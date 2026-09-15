/** Serialises writes that share a key, so later ones cannot land first.
 *
 *  Two rating changes leave two metadata writes in flight, and nothing makes
 *  them arrive in the order they were sent. Out of order, the older rating wins
 *  and a reload shows a highlight contradicting the recorded score.
 */
export interface WriteQueue {
	/** Run `write` after any write already queued under `key`. */
	(key: string, write: () => Promise<unknown>): Promise<void>;
}

export function createWriteQueue(): WriteQueue {
	const inFlight: Record<string, Promise<void> | undefined> = {};

	return function queue(key, write) {
		// Rejections swallowed so one failure cannot reject everything behind it.
		const queued = (inFlight[key] ?? Promise.resolve()).then(write).then(
			() => {},
			() => {}
		);
		inFlight[key] = queued;
		void queued.finally(() => {
			// Only if nothing newer took the slot, or the next write drops out of
			// the chain and can race the one it should have followed.
			if (inFlight[key] === queued) delete inFlight[key];
		});
		return queued;
	};
}
