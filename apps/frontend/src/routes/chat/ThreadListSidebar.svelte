<script lang="ts">
	/**
	 * SvelteKit-specific seam (see `+layout.svelte`'s header comment): merges the container-agnostic
	 * `<LangGraph>` context's `pendingThreadId` (history-loading, reported by `Conversation`) with
	 * `navigating`'s in-flight target thread id — the click→mount window that only SvelteKit knows
	 * about. Must be rendered as a child of `<LangGraph>` to read its context; that is why this
	 * lives in `routes/chat/` instead of the routing-agnostic `lib/components/chat/` package.
	 */
	import { navigating } from '$app/state';
	import { ThreadList } from '$lib/components/chat/ThreadList';
	import { useLangGraphOptional } from '$lib/components/chat/langGraphContext.svelte.js';

	const ctx = useLangGraphOptional();
	let pendingThreadId = $derived(navigating.to?.params?.threadID ?? ctx?.pendingThreadId ?? null);
</script>

<ThreadList {pendingThreadId} />
