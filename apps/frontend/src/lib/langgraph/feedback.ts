import { apiUrl } from './apiUrl';

/** Same limit as COMMENT_MAX_LENGTH in apps/backend/src/svelte_langgraph/routes.py. */
export const COMMENT_MAX_LENGTH = 2000;

/** Code points, not `.length`: UTF-16 units would reject a comment of emoji at
 *  half the stated limit while the backend still accepted it. */
function codePointLength(value: string): number {
	return [...value].length;
}

/** Score a run through the same authenticated transport as threads and runs. */
export async function submitFeedback(
	authenticatedFetch: typeof fetch,
	runId: string,
	score: 'up' | 'down',
	comment?: string
): Promise<void> {
	const trimmed = comment?.trim();
	if (trimmed && codePointLength(trimmed) > COMMENT_MAX_LENGTH)
		throw new Error(`comment must be at most ${COMMENT_MAX_LENGTH} characters`);

	const res = await authenticatedFetch(`${apiUrl()}/feedback`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		// Omitted rather than sent as null when absent, so a bare rating is the
		// same request it was before comments existed.
		body: JSON.stringify(
			trimmed ? { run_id: runId, score, comment: trimmed } : { run_id: runId, score }
		)
	});

	if (!res.ok) throw new Error(`Feedback submission failed: ${res.status}`);
}
