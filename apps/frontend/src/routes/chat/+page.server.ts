import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createThread } from '$lib/client/langgraphClient';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.auth();

	if (!session?.accessToken) {
		return { session };
	}

	try {
		// Create a LangGraph client, thread, and assistant
		const langgraph = await createThread(session.accessToken);

		return {
			session,
			langgraph
		};
	} catch (err) {
		console.error('Failed to initialize chat:', err);
		error(400, {
			message: 'Failed to initialize chat'
		});
	}
};
