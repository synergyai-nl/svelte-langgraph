<script lang="ts">
	/**
	 * `/demo/embedded` — proof that `<LangGraph>`/`<ChatSurface>` work anywhere, not just inside
	 * the app's own `routes/chat` layout (SLG-133 PR 4). Compare against
	 * `routes/chat/+layout.svelte`:
	 *
	 * - No `<ThreadList>` — this embed has no chrome to navigate between threads, just the one
	 *   conversation.
	 * - No `activeThreadId`/`onThreadChange`/`hrefFor` — a router-free embed has no URL to
	 *   read a thread id from or push one into, so `<LangGraph>` runs in its uncontrolled
	 *   thread-selection mode instead (see `EmbeddedChatSurface.svelte`, which creates the first
	 *   thread on mount).
	 * - No `labels` prop, so every chat component falls back to its own built-in English default —
	 *   deliberately no paraglide import here, to prove a consumer doesn't need this app's i18n
	 *   setup to embed a working chat surface.
	 *
	 * The fixed-height card below stands in for whatever real container an embed lives in (a
	 * support-chat overlay, a docked widget, ...): `ChatSurface` is `h-full min-h-0`, so it fills
	 * and scrolls *inside* the card rather than growing the page.
	 */
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import LangGraph from '$lib/components/chat/LangGraph.svelte';
	import EmbeddedChatSurface from './EmbeddedChatSurface.svelte';

	let accessToken = $derived(page.data.session?.accessToken ?? null);
</script>

<div class="flex justify-center p-8">
	{#if accessToken}
		<div
			data-testid="embedded-chat-card"
			class="h-[32rem] w-full max-w-md overflow-hidden rounded-xl border shadow-lg"
		>
			<LangGraph url={env.PUBLIC_LANGGRAPH_API_URL ?? ''} token={accessToken}>
				<EmbeddedChatSurface />
			</LangGraph>
		</div>
	{:else}
		<div class="max-w-md rounded-xl border p-8 text-center text-sm">
			<p>Sign in to try the embedded chat demo.</p>
			<a href="/" class="underline">Go to sign in</a>
		</div>
	{/if}
</div>
