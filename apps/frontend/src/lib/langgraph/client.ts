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
