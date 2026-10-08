/** Which run produced which AI message, stored in thread metadata.
 *
 *  Persisted because the live checkpoint window only covers the ~10 most
 *  recent messages (see `fetchStateHistory` in Chat.svelte). Flat
 *  `run:<messageId>` keys, same reasoning as ratings.ts.
 */

const MESSAGE_RUN_PREFIX = 'run:';

/** The metadata key a message's producing run is stored under. */
export function messageRunKey(messageId: string): string {
	return `${MESSAGE_RUN_PREFIX}${messageId}`;
}

/** Producing run ids by message id. Unknown keys and non-string values are
 *  skipped rather than trusted: metadata is a free dictionary shared with
 *  everything else on the thread. */
export function messageRunsFromMetadata(metadata: unknown): Record<string, string> {
	const entries = Object.entries((metadata as Record<string, unknown>) ?? {});
	const found: Record<string, string> = {};
	for (const [key, value] of entries) {
		if (!key.startsWith(MESSAGE_RUN_PREFIX)) continue;
		if (typeof value === 'string' && value) found[key.slice(MESSAGE_RUN_PREFIX.length)] = value;
	}
	return found;
}
