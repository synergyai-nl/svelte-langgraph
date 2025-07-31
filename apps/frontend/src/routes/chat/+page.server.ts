import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createThread } from '$lib/client/langgraphClient';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.auth();

	// If user is not authenticated, skip LangGraph setup.
	// Returning `session: null` allows client to show login modal instead of erroring.
	if (!session?.accessToken) {
		return { session: null };
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
