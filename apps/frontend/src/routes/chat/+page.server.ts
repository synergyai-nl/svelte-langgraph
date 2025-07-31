import { error } from '@sveltejs/kit';
import { Client } from '@langchain/langgraph-sdk';
import { PUBLIC_LANGGRAPH_API_URL } from '$env/static/public';
import type { PageServerLoad } from './$types';

async function initializeLangGraph(accessToken: string): Promise<{
	threadId: string;
	assistantId: string;
}> {
	const client = new Client({
		defaultHeaders: {
			Authorization: `Bearer ${accessToken}`
		},
		apiUrl: PUBLIC_LANGGRAPH_API_URL
	});

	const thread = await client.threads.create();
	const assistant = await client.assistants.create({ graphId: 'chat' });

	return {
		threadId: thread.thread_id,
		assistantId: assistant.assistant_id
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.auth();

	if (!session?.accessToken) {
		return { session: null };
	}

	try {
		const { threadId, assistantId } = await initializeLangGraph(session.accessToken);
		return {
			session,
			langgraph: {
				threadId: threadId,
				assistantId: assistantId
			}
		};
	} catch (err) {
		console.error('Failed to initialize chat:', err);
		error(400, {
			message: 'Failed to initialize chat'
		});
	}
};
