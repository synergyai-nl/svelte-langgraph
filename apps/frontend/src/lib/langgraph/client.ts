import { Client } from '@langchain/langgraph-sdk';
import { env } from '$env/dynamic/public';

export function createLangGraphClient(accessToken: string): Client {
	return new Client({
		defaultHeaders: {
			Authorization: `Bearer ${accessToken}`
		},
		apiUrl: env.PUBLIC_LANGGRAPH_API_URL
	});
}

export async function createThread(
	client: Client,
	graphId: string = 'chat'
): Promise<{ threadId: string; assistantId: string }> {
	const thread = await client.threads.create();
	const assistant = await client.assistants.create({ graphId });

	return {
		threadId: thread.thread_id,
		assistantId: assistant.assistant_id
	};
}
