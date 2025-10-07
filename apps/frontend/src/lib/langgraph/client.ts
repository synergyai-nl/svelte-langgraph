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
	console.info('im searching for thread');
	const existingThreads = await client.threads.search({
		status: 'idle',
		limit: 1,
		sortBy: 'updated_at',
		sortOrder: 'desc'
	});

	let threadId;
	if (existingThreads.length > 0) {
		// Use existing thread
		threadId = existingThreads[0].thread_id;
	} else {
		// Create new thread if none exists
		const thread = await client.threads.create();
		threadId = thread.thread_id;
	}

	// Search for existing assistant first
	const existingAssistants = await client.assistants.search({ graphId, limit: 1 });

	let assistantId: string;
	if (existingAssistants.length > 0) {
		// Use existing assistant
		assistantId = existingAssistants[0].assistant_id;
	} else {
		// Create new assistant if none exists
		const assistant = await client.assistants.create({ graphId });
		assistantId = assistant.assistant_id;
	}

	return {
		threadId,
		assistantId
	};
}
