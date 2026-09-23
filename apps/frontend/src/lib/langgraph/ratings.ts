/** Thumb ratings, stored in thread metadata.
 *
 *  Metadata rather than thread state: state means a checkpoint write, which
 *  forks history on the next submit and 409s during an active run — see the
 *  escape-hatch note in stateSync.svelte.ts.
 *
 *  One flat `rating:<runId>` key each, not a nested map. Aegra merges metadata
 *  by top-level key, so a nested object would be replaced wholesale and any
 *  write built on a stale read would erase the rest.
 */

export type Rating = 'up' | 'down';

const RATING_PREFIX = 'rating:';

/** The metadata key a run's rating is stored under. */
export function ratingKey(runId: string): string {
	return `${RATING_PREFIX}${runId}`;
}

/** Ratings by run id. Unknown keys and values are skipped rather than trusted:
 *  metadata is a free dictionary shared with everything else on the thread. */
export function ratingsFromMetadata(metadata: unknown): Record<string, Rating> {
	const entries = Object.entries((metadata as Record<string, unknown>) ?? {});
	const found: Record<string, Rating> = {};
	for (const [key, value] of entries) {
		if (!key.startsWith(RATING_PREFIX)) continue;
		if (value === 'up' || value === 'down') found[key.slice(RATING_PREFIX.length)] = value;
	}
	return found;
}

/** Add or remove a run from a set-like flag record.
 *
 *  Returns a new object: the caller holds these in `$state` and assigns the
 *  result, so mutating in place would not be seen.
 */
export function setFlag(
	flags: Record<string, true>,
	runId: string,
	on: boolean
): Record<string, true> {
	const next = { ...flags };
	if (on) next[runId] = true;
	else delete next[runId];
	return next;
}
