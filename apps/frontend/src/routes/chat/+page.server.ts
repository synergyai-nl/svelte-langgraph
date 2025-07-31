import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createLangGraphClient } from '$lib/langgraph/client';

async function initializeLangGraph(accessToken: string): Promise<{
	threadId: string;
	assistantId: string;
}> {
	const client = createLangGraphClient(accessToken);

	const thread = await client.threads.create();
	const assistant = await client.assistants.create({ graphId: 'chat' });

	return {
		threadId: thread.thread_id,
		assistantId: assistant.assistant_id
	};
}

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.auth();

	// If user is not authenticated, skip LangGraph setup.
	// Returning `session: null` allows client to show login modal instead of erroring.
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
