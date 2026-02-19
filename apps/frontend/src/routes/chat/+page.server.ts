import { redirect } from '@sveltejs/kit';
import { createClient, getOrCreateThread } from '$lib/langgraph/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const session = await event.locals.auth();

	if (session?.accessToken) {
		const client = createClient(session.accessToken);
		const thread = await getOrCreateThread(client);
		redirect(302, `/chat/${thread.thread_id}`);
	}

	return {};
};
