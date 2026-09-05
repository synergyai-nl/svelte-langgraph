import { env } from '$env/dynamic/public';

/** Same limit as COMMENT_MAX_LENGTH in apps/backend/src/svelte_langgraph/routes.py. */
export const COMMENT_MAX_LENGTH = 2000;

/** Code points, not `.length`: UTF-16 units would reject a comment of emoji at
 *  half the stated limit while the backend still accepted it. */
function codePointLength(value: string): number {
	return [...value].length;
}

/**
 * Score a run.
 *
 * Posts straight to Aegra with the caller's own bearer token, the same one
 * `createClient` sends. There is no SvelteKit hop: the browser already talks to
 * this backend for threads and runs, and the endpoint now checks that the run
 * belongs to the caller, which a signed URL minted for any requested run id
 * never did.
 */
export async function submitFeedback(
	accessToken: string,
	runId: string,
	score: 'up' | 'down',
	comment?: string
): Promise<void> {
	const apiUrl = env.PUBLIC_LANGGRAPH_API_URL;
	if (!apiUrl) throw new Error('Required PUBLIC_LANGGRAPH_API_URL is undefined');

	const trimmed = comment?.trim();
	if (trimmed && codePointLength(trimmed) > COMMENT_MAX_LENGTH)
		throw new Error(`comment must be at most ${COMMENT_MAX_LENGTH} characters`);

	const res = await fetch(`${apiUrl}/feedback`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accessToken}`
		},
		// Omitted rather than sent as null when absent, so a bare rating is the
		// same request it was before comments existed.
		body: JSON.stringify(
			trimmed ? { run_id: runId, score, comment: trimmed } : { run_id: runId, score }
		)
	});

	if (!res.ok) throw new Error(`Feedback submission failed: ${res.status}`);
}
