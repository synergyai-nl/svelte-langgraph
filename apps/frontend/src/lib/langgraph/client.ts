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

export async function getAssistantId(client: Client, graphId: string = 'chat'): Promise<string> {
	const assistant = await client.assistants.create({ graphId });

	return assistant.assistant_id;
}

export async function getThreadId(client: Client): Promise<string> {
	const thread = await client.threads.create();

	return thread.thread_id;
}
