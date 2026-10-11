import { apiEndpoint } from './apiUrl';

/**
 * Rate an AI answer. The backend resolves which run produced it.
 *
 * Posts straight to Aegra with the caller's own bearer token, the same one
 * `createClient` sends.
 */
export async function submitFeedback(
	accessToken: string,
	threadId: string,
	messageId: string,
	score: 'up' | 'down',
	comment?: string
): Promise<void> {
	const trimmed = comment?.trim();

	const res = await fetch(apiEndpoint('feedback'), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`
		},
		// Omitted rather than sent as null when absent, so a bare rating is the
		// same request it was before comments existed.
		body: JSON.stringify(
			trimmed
				? { thread_id: threadId, message_id: messageId, score, comment: trimmed }
				: { thread_id: threadId, message_id: messageId, score }
		)
	});

	if (!res.ok) throw new Error(`Feedback submission failed: ${res.status}`);
}
