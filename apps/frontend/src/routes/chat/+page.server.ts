import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createThread, createLangGraphClient } from '$lib/langgraph/client';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.auth();

	if (!session?.accessToken) {
		return { session };
	}

	try {
		// Create a LangGraph client, thread, and assistant
		// Pre-creates a LangGraph thread and assistant on page load to improve perceived performance.
		// This is a tradeoff: it enables instant chat start, but creates a thread even if the user doesn't chat.
		// Revisit if lazy-init becomes more appropriate.
		const client = createLangGraphClient(session.accessToken);
		const langgraph = await createThread(client);

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
