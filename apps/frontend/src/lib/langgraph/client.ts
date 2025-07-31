import { Client } from '@langchain/langgraph-sdk';
import { PUBLIC_LANGGRAPH_API_URL } from '$env/static/public';

export function createLangGraphClient(accessToken: string): Client {
	return new Client({
		defaultHeaders: {
			Authorization: `Bearer ${accessToken}`
		},
		apiUrl: PUBLIC_LANGGRAPH_API_URL
	});
}

export async function createThread(
	accessToken: string,
	graphId: string = 'chat'
): Promise<{ threadId: string; assistantId: string }> {
	const client = createLangGraphClient(accessToken);

	const thread = await client.threads.create();
	const assistant = await client.assistants.create({ graphId });

	return {
		threadId: thread.thread_id,
		assistantId: assistant.assistant_id
	};
}
