import { Client } from '@langchain/langgraph-sdk';
import { env } from '$env/dynamic/public';

export function createClient(accessToken: string): Client {
	return new Client({
		defaultHeaders: {
			Authorization: `Bearer ${accessToken}`
		},
		apiUrl: env.PUBLIC_LANGGRAPH_API_URL,
		timeoutMs: 2000
	});
}

export async function getAssistantId(client: Client, graphId: string = 'chat'): Promise<string> {
	const assistant = await client.assistants.create({ graphId });

	return {
		assistantId: assistant.assistant_id
	};
}

export async function getThreadId(client: Client): Promise<string> {
	const thread = await client.threads.create();

	return {
		threadId: thread.thread_id
	};
}
