/**
 * Svelte context for triggering a thread-list refresh from anywhere below the provider (e.g.
 * after creating a new thread). Kept as a minimal interface rather than exposing the full
 * `ThreadList` instance, so callers can't reach in and mutate list state directly.
 */
import { getContext, setContext } from 'svelte';

export interface ThreadListRefresh {
	refresh(): void;
}

const KEY = Symbol.for('slg-thread-list-refresh');

export function setThreadListRefresh(v: ThreadListRefresh): ThreadListRefresh {
	return setContext(KEY, v);
}

export function getThreadListRefresh(): ThreadListRefresh | undefined {
	return getContext(KEY);
}
