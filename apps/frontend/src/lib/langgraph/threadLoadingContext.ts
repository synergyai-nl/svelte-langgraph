/**
 * Svelte context for reporting a thread's history-loading state up to the layout, so the
 * sidebar can mark the corresponding thread row as pending. Kept as a minimal interface rather
 * than exposing the full `useStream` instance, so callers can't reach in and mutate stream state
 * directly.
 */
import { getContext, setContext } from 'svelte';

export interface ThreadLoadingReporter {
	setLoading(threadId: string, loading: boolean): void;
}

const KEY = Symbol.for('slg-thread-loading-reporter');

export function setThreadLoadingReporter(reporter: ThreadLoadingReporter): void {
	setContext(KEY, reporter);
}

export function getThreadLoadingReporter(): ThreadLoadingReporter | undefined {
	return getContext(KEY);
}
