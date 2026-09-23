import { Client, type Thread } from '@langchain/langgraph-sdk';
import type { ThreadValues } from './types';
import type { TitleClient, TitleMessage } from './threadTitle';

/**
 * @param url - LangGraph server API URL. Callers own resolving this (e.g. from
 * `PUBLIC_LANGGRAPH_API_URL` in the SvelteKit app) — this package has no SvelteKit dependency.
 * @param token - Bearer token sent as the `Authorization` header, when provided.
 * @param headers - Additional default headers, merged in under `Authorization`.
 */
export function createClient(
	url: string,
	token?: string | null,
	headers?: Record<string, string>
): TitleClient {
	if (!url) throw Error('Required LangGraph API URL is undefined');

	console.assert(!!token, 'No access token specified.');

	const defaultHeaders: Record<string, string> = { ...headers };
	if (token) {
		defaultHeaders.Authorization = `Bearer ${token}`;
	}

	const client = new Client({
		defaultHeaders,
		apiUrl: url,
		timeoutMs: 5000 // Increased from 2000ms for CI reliability
	});
	return Object.assign(client, {
		async generateTitle(
			messages: TitleMessage[],
			signal: AbortSignal
		): Promise<{ title: string | null }> {
			const response = await fetch(`${url.replace(/\/$/, '')}/titles`, {
				method: 'POST',
				headers: {
					...defaultHeaders,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ messages }),
				// Allow the backend's 10-second model timeout to return its result.
				signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)])
			});
			if (!response.ok) throw new Error(`Title request failed: ${response.status}`);
			return await response.json();
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
