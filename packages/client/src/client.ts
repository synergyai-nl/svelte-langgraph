import { Client, type Thread } from '@langchain/langgraph-sdk';
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
 */
export function createClient(
	url: string,
	token?: TokenSource,
	headers?: Record<string, string>
): AppClient {
	const baseUrl = normalizeApiUrl(url);
	const readToken = typeof token === 'function' ? token : undefined;

	// The SDK keeps its headers protected, so our routes share this instead.
	const defaultHeaders: Record<string, string> = { ...headers };
	if (typeof token === 'string' && token) {
		defaultHeaders.Authorization = `Bearer ${token}`;
	}

	const client = new Client({
		// A copy: the SDK may write x-api-key into the object it is given.
		defaultHeaders: { ...defaultHeaders },
		apiUrl: baseUrl,
		timeoutMs: 5000, // Increased from 2000ms for CI reliability
		onRequest:
			readToken &&
			(async (_url, init) => {
				const bearer = await readToken();
				const requestHeaders = new Headers(init.headers);
				if (bearer) requestHeaders.set('Authorization', `Bearer ${bearer}`);
				return { ...init, headers: requestHeaders };
			})
	});

	async function postJson(route: string, body: unknown, signal?: AbortSignal): Promise<Response> {
		const bearer = await readToken?.();
		const timeout = AbortSignal.timeout(ROUTE_TIMEOUT_MS);
		const response = await fetch(apiEndpoint(baseUrl, route), {
			method: 'POST',
			headers: {
				...defaultHeaders,
				...(bearer && { Authorization: `Bearer ${bearer}` }),
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(body),
			signal: signal ? AbortSignal.any([signal, timeout]) : timeout
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

export async function getOrCreateThread(client: Client): Promise<Thread<ThreadValues>> {
	const threads = await client.threads.search({
		metadata: { graph_id: 'chat' },
		status: 'idle',
		limit: 1,
		sortBy: 'updated_at',
		sortOrder: 'desc'
	});
	return threads.length ? (threads[0] as Thread<ThreadValues>) : createThread(client);
}

/**
 * Unconditionally create a new thread.
 * Distinct from getOrCreateThread, which deliberately reuses the most recently updated *idle*
 * thread. "New chat" means new — reuse would drop the user back into the conversation they left.
 */
export async function createThread(client: Client): Promise<Thread<ThreadValues>> {
	return (await client.threads.create({ metadata: { graph_id: 'chat' } })) as Thread<ThreadValues>;
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
