import { Client } from '@langchain/langgraph-sdk';
import { env } from '$env/dynamic/public';

export function createLangGraphClient(accessToken: string): Client {
	return new Client({
		defaultHeaders: {
			Authorization: `Bearer ${accessToken}`
		},
		apiUrl: env.PUBLIC_LANGGRAPH_API_URL,
		timeoutMs: 2000
	});
}

export async function getOrCreateThread(
	client: Client,
	graphId: string = 'chat'
): Promise<{ threadId: string; assistantId: string }> {
	// Search for existing thread first
	const existingThreads = await client.threads.search({
		status: 'idle',
		limit: 1,
		sortBy: 'updated_at',
		sortOrder: 'desc'
	});

	let threadId;
	if (existingThreads.length > 0) {
		const existingThread = existingThreads[0];
		console.info('Using existing thread', existingThread);
		threadId = existingThread.thread_id;
	} else {
		console.info('No existing thread found, creating anew');
		const thread = await client.threads.create();
		threadId = thread.thread_id;
	}

	// Search for existing assistant first
	const existingAssistants = await client.assistants.search({ graphId, limit: 1 });

	let assistantId: string;
	if (existingAssistants.length > 0) {
		const existingAssistant = existingAssistants[0];
		console.info('Using existing assistant', existingAssistant);
		assistantId = existingAssistant.assistant_id;
	} else {
		console.info('No existing assistant found, creating anew');
		const assistant = await client.assistants.create({ graphId });
		assistantId = assistant.assistant_id;
	}

	return {
		threadId,
		assistantId
	};
}
