import { error } from '@sveltejs/kit';
import { Client } from '@langchain/langgraph-sdk';
import { PUBLIC_LANGGRAPH_API_URL } from '$env/static/public';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.auth();

	if (!session?.accessToken) {
		return { session: null };
	}

	try {
		const client = new Client({
			defaultHeaders: {
				Authorization: `Bearer ${session.accessToken}`
			},
			apiUrl: PUBLIC_LANGGRAPH_API_URL
		});

		const thread = await client.threads.create();
		const assistant = await client.assistants.create({
			graphId: 'chat'
		});

		return {
			session,
			langgraph: {
				threadId: thread.thread_id,
				assistantId: assistant.assistant_id
			}
		};
	} catch (err) {
		console.error('Failed to initialize chat:', err);
		error(400, {
			message: 'Failed to initialize chat'
		});
	}
};
