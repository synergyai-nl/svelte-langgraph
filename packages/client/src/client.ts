import {
	Client,
	type Metadata,
	type RequestHook,
	type Thread,
	type ThreadState
} from '@langchain/langgraph-sdk';
import { apiEndpoint, normalizeApiUrl } from './apiUrl';
import type { FeedbackScore, ThreadValues } from './types';
import type { TitleClient, TitleMessage } from './threadTitle';

/** The SDK client plus our own backend routes, all sending the same auth. */
export interface AppClient extends TitleClient {
	/** Rate an AI answer. The backend resolves which run produced it. */
	submitFeedback(
		threadId: string,
		messageId: string,
		score: FeedbackScore,
		comment?: string
	): Promise<void>;
}

// Above the backend's 10-second deadlines, so its own error arrives first.
const ROUTE_TIMEOUT_MS = 15_000;

/**
 * Waits for `promise`, but gives up with `signal.reason` once the signal aborts. The promise itself
 * is left running: a shared token refresh must not be cancelled by one caller giving up.
 */
function abortable<T>(value: T | Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		if (signal.aborted) {
			// Still observe the value, so a later rejection is not unhandled.
			Promise.resolve(value).catch(() => {});
			return reject(signal.reason);
		}
		const onAbort = () => reject(signal.reason);
		signal.addEventListener('abort', onAbort, { once: true });
		Promise.resolve(value)
			.finally(() => signal.removeEventListener('abort', onAbort))
			.then(resolve, reject);
	});
}

/**
 * A bearer token, or a function that returns the current one. A function is called before every
 * request (SDK requests, streams and their reconnects, and our own routes), so a token that
 * expires can be refreshed without building a new client.
 */
export type TokenSource = string | null | (() => Promise<string | null> | string | null);

/**
 * @param url - LangGraph server API URL. Callers own resolving this (e.g. from
 * `PUBLIC_LANGGRAPH_API_URL` in the SvelteKit app) — this package has no SvelteKit dependency.
 * It must be absolute, without query or fragment; it is normalised so the SDK and our own
 * routes resolve against the same base.
 * @param token - Bearer token sent as the `Authorization` header, when provided. A function is
 * called before every request; when it returns null the request carries no `Authorization`.
 * @param headers - Additional default headers, merged in under `Authorization`.
 * @param options.onRequest - The SDK's own `onRequest`, run once per SDK request after the bearer
 * is set (HTTP retries reuse its result; stream reconnects call it again); it may return a changed
 * `RequestInit`. The title and feedback routes do not pass through it. An error it throws fails
 * the request.
 */
export function createClient(
	url: string,
	token?: TokenSource,
	headers?: Record<string, string>,
	{ onRequest }: { onRequest?: RequestHook } = {}
): AppClient {
	const baseUrl = normalizeApiUrl(url);
	const readToken = typeof token === 'function' ? token : undefined;

	// The SDK keeps its headers protected, so our routes share this instead.
	const defaultHeaders: Record<string, string> = { ...headers };
	for (const key of Object.keys(defaultHeaders)) {
		if (readToken && key.toLowerCase() === 'authorization') delete defaultHeaders[key];
	}
	if (typeof token === 'string' && token) {
		defaultHeaders.Authorization = `Bearer ${token}`;
	}

	const client = new Client({
		// A copy: the SDK may write x-api-key into the object it is given.
		defaultHeaders: { ...defaultHeaders },
		apiUrl: baseUrl,
		timeoutMs: 5000, // Increased from 2000ms for CI reliability
		onRequest:
			(readToken || onRequest) &&
			(async (requestUrl, init) => {
				if (readToken) {
					// The SDK has merged its timeout and the caller's signal into `init.signal`.
					const bearer = await (init.signal ? abortable(readToken(), init.signal) : readToken());
					const requestHeaders = new Headers(init.headers);
					if (bearer) requestHeaders.set('Authorization', `Bearer ${bearer}`);
					init = { ...init, headers: requestHeaders };
				}
				return onRequest ? onRequest(requestUrl, init) : init;
			})
	});

	async function postJson(route: string, body: unknown, signal?: AbortSignal): Promise<Response> {
		const timeout = AbortSignal.timeout(ROUTE_TIMEOUT_MS);
		const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
		const bearer = await (readToken ? abortable(readToken(), combined) : undefined);
		const response = await fetch(apiEndpoint(baseUrl, route), {
			method: 'POST',
			headers: {
				...defaultHeaders,
				...(bearer && { Authorization: `Bearer ${bearer}` }),
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body),
			signal: combined
		});
		if (!response.ok) throw new Error(`POST ${route} failed: ${response.status}`);
		return response;
	}

	return Object.assign(client, {
		async generateTitle(
			messages: TitleMessage[],
			signal: AbortSignal
		): Promise<{ title: string | null }> {
			return (await postJson('titles', { messages }, signal)).json();
		},
		async submitFeedback(
			threadId: string,
			messageId: string,
			score: FeedbackScore,
			comment?: string
		) {
			// An undefined comment drops out of the JSON, leaving a bare rating.
			await postJson('feedback', { thread_id: threadId, message_id: messageId, score, comment });
		}
	});
}

/** A caller's own thread for {@link getOrCreateThread}. */
export interface ThreadOptions {
	/** Use this thread: created when missing, otherwise returned as it is. */
	threadId?: string;
	/**
	 * Written onto a thread this call creates, never onto an existing one, with `graph_id` set to
	 * `graphId` over the same key: the thread list filters on it, and the server stamps it again on
	 * every run. Without `threadId` it is also the reuse filter.
	 */
	metadata?: Metadata;
}

/**
 * With `threadId`, one create request that does nothing when the thread exists
 * (`ifExists: 'do_nothing'`). Without it, the most recently updated idle thread of `graphId`
 * whose metadata matches, or a new one. Errors (a 409 for another user's id, 403, network) reach
 * the caller unchanged.
 */
export async function getOrCreateThread(
	client: Client,
	graphId: string,
	{ threadId, metadata }: ThreadOptions = {}
): Promise<Thread<ThreadValues>> {
	// `!== undefined`: an empty id must reach the server and be refused, not reuse a thread.
	if (threadId !== undefined) {
		return (await client.threads.create({
			graphId,
			metadata,
			threadId,
			ifExists: 'do_nothing'
		})) as Thread<ThreadValues>;
	}
	const threads = await client.threads.search({
		metadata: { ...metadata, graph_id: graphId },
		status: 'idle',
		limit: 1,
		sortBy: 'updated_at',
		sortOrder: 'desc'
	});
	return threads.length
		? (threads[0] as Thread<ThreadValues>)
		: createThread(client, graphId, metadata);
}

/**
 * Unconditionally create a new thread of `graphId`; `graph_id` wins over the same key in
 * `metadata`.
 * Distinct from getOrCreateThread, which deliberately reuses the most recently updated *idle*
 * thread. "New chat" means new — reuse would drop the user back into the conversation they left.
 */
export async function createThread(
	client: Client,
	graphId: string,
	metadata?: Metadata
): Promise<Thread<ThreadValues>> {
	return (await client.threads.create({ graphId, metadata })) as Thread<ThreadValues>;
}

/**
 * The checkpoint to fork from to replace message `messageId` and everything after it (an edit,
 * or a regenerate of an answer): the parent of the oldest checkpoint on the thread's current
 * branch that holds the message. Follows the branch from the newest checkpoint, reading the
 * history `pageSize` checkpoints per request, newest first, until it has passed the message's
 * first checkpoint. `undefined` when the message is not on the branch.
 */
export async function findForkPoint(
	client: Client,
	threadId: string,
	messageId: string,
	pageSize = 20
): Promise<string | undefined> {
	const byId = new Map<string, ThreadState<ThreadValues>>();
	let page: ThreadState<ThreadValues>[] = [];
	const readPage = async () => {
		const last = page.at(-1)?.checkpoint.checkpoint_id;
		page = await client.threads.getHistory<ThreadValues>(threadId, {
			limit: pageSize,
			before: last === undefined ? undefined : { configurable: { checkpoint_id: last } }
		});
		for (const state of page) byId.set(state.checkpoint.checkpoint_id!, state);
	};
	const holds = (
		state: ThreadState<ThreadValues> | undefined
	): state is ThreadState<ThreadValues> =>
		state?.values?.messages?.some((message) => message.id === messageId) ?? false;

	await readPage();
	let state: ThreadState<ThreadValues> | undefined = page[0];
	let forkFrom: string | undefined;
	while (holds(state)) {
		forkFrom = state.parent_checkpoint?.checkpoint_id ?? undefined;
		if (forkFrom === undefined) return undefined;
		// A parent is older than its child, so it is on a later page when not read yet.
		while (!byId.has(forkFrom) && page.length === pageSize) await readPage();
		state = byId.get(forkFrom);
	}
	// `state` is now the newest checkpoint on the branch without the message, if there is one.
	return state && forkFrom;
}

export async function getOrCreateAssistant(
	client: Client,
	graphId: string = 'chat'
): Promise<string> {
	// Search for existing assistant first
	const existingAssistants = await client.assistants.search({ graphId, limit: 1 });

	if (existingAssistants.length > 0) {
		const existingAssistant = existingAssistants[0];
		console.info('Using existing assistant', existingAssistant);
		return existingAssistant.assistant_id;
	} else {
		console.info('No existing assistant found, creating anew');
		const assistant = await client.assistants.create({ graphId });
		return assistant.assistant_id;
	}
}
