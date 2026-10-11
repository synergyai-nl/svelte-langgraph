import { Client, type Thread } from '@langchain/langgraph-sdk';
import { apiEndpoint, apiUrl } from './apiUrl';
import type { ThreadValues } from './types';
import type { TitleClient, TitleMessage } from './threadTitle';
import { submitFeedback, type FeedbackScore } from './feedback';

/** The SDK client plus our own backend routes, all sending the same auth. */
export interface AppClient extends TitleClient {
	submitFeedback(
		threadId: string,
		messageId: string,
		score: FeedbackScore,
		comment?: string
	): Promise<void>;
}

export function createClient(accessToken: string): AppClient {
	console.assert(!!accessToken, 'No access token specified.');

	// The SDK keeps its headers protected, so our routes share this instead.
	const auth = { Authorization: `Bearer ${accessToken}` };

	const client = new Client({
		// A copy: the SDK may write x-api-key into the object it is given.
		defaultHeaders: { ...auth },
		apiUrl: apiUrl(),
		timeoutMs: 5000 // Increased from 2000ms for CI reliability
	});
	return Object.assign(client, {
		async generateTitle(
			messages: TitleMessage[],
			signal: AbortSignal
		): Promise<{ title: string | null }> {
			const response = await fetch(apiEndpoint('titles'), {
				method: 'POST',
				headers: { ...auth, 'Content-Type': 'application/json' },
				body: JSON.stringify({ messages }),
				// Allow the backend's 10-second model timeout to return its result.
				signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)])
			});
			if (!response.ok) throw new Error(`Title request failed: ${response.status}`);
			return await response.json();
		},
		submitFeedback(threadId: string, messageId: string, score: FeedbackScore, comment?: string) {
			return submitFeedback(auth, threadId, messageId, score, comment);
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
