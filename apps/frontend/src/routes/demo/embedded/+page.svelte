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
	 * - Chat components render their strings through paraglide (`messages/chat/{locale}.json`), so
	 *   the embed follows the app's current locale like every other route.
	 *
	 * The fixed-height card below stands in for whatever real container an embed lives in (a
	 * support-chat overlay, a docked widget, ...): `ChatSurface` is `h-full min-h-0`, so it fills
	 * and scrolls *inside* the card rather than growing the page.
	 *
	 * Unlike the chat layout's login modal, this page handles backend-credential expiry inline
	 * (an expired-session card with a sign-in button).
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';
	import { backendAuth, getToken } from '$lib/auth/backendToken.svelte';
	import LangGraph from '$lib/components/chat/LangGraph.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import EmbeddedChatSurface from './EmbeddedChatSurface.svelte';

	// `expired` is module-wide and may be stale (set on /chat, re-signed-in since). The gate keeps
	// <LangGraph> unmounted, so nothing else would call getToken() to clear it: revalidate once.
	onMount(() => {
		if (page.data.session && backendAuth.expired) getToken().catch(() => {});
	});
</script>

<div class="flex flex-col items-center gap-6 p-8">
	<h1 class="text-2xl font-semibold tracking-tight">{m.demo_embedded_title()}</h1>

	{#if page.data.session && !backendAuth.expired}
		<div
			data-testid="embedded-chat-card"
			class="h-[32rem] w-full max-w-md overflow-hidden rounded-xl border shadow-lg"
		>
			<LangGraph url={env.PUBLIC_LANGGRAPH_API_URL ?? ''} token={getToken}>
				<EmbeddedChatSurface />
			</LangGraph>
		</div>
	{:else}
		<div class="max-w-md space-y-4 rounded-xl border p-8 text-center text-sm">
			{#if page.data.session}
				<h2 class="text-base font-semibold">{m.auth_session_expired_title()}</h2>
				<p class="text-foreground/70">{m.auth_session_expired_message()}</p>
			{:else}
				<p class="text-foreground/70">{m.demo_embedded_description()}</p>
			{/if}
			<SignInButton label={m.demo_embedded_sign_in()} size="default" />
		</div>
	{/if}
</div>
