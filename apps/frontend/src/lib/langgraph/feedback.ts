import { apiEndpoint } from './apiUrl';

export type FeedbackScore = 'up' | 'down';

/** Rate an AI answer. The backend resolves which run produced it. Reached
 *  through `AppClient.submitFeedback`, which supplies the client's own auth. */
export async function submitFeedback(
	auth: { Authorization: string },
	threadId: string,
	messageId: string,
	score: FeedbackScore,
	comment?: string
): Promise<void> {
	const trimmed = comment?.trim();

	const res = await fetch(apiEndpoint('feedback'), {
		method: 'POST',
		headers: { ...auth, 'Content-Type': 'application/json' },
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
