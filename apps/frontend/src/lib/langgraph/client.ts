import { Client } from '@langchain/langgraph-sdk';
import { env } from '$env/dynamic/public';

export function createClient(accessToken: string): Client {
	console.assert(accessToken, 'No access token specified.');

	return new Client({
		defaultHeaders: {
			Authorization: `Bearer ${accessToken}`
		},
		apiUrl: env.PUBLIC_LANGGRAPH_API_URL,
		timeoutMs: 2000
	});
}

export async function getOrCreateThread(client: Client): Promise<string> {
	// Search for existing thread first
	const existingThreads = await client.threads.search({
		status: 'idle',
		limit: 1,
		sortBy: 'updated_at',
		sortOrder: 'desc'
	});

	if (existingThreads.length > 0) {
		const existingThread = existingThreads[0];
		console.info('Using existing thread', existingThread);
		return existingThread.thread_id;
	} else {
		console.info('No existing thread found, creating anew');
		const thread = await client.threads.create();
		return thread.thread_id;
	}
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
