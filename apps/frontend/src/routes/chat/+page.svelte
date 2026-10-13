<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getOrCreateThread } from '@svelte-langgraph/client';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import ChatError from '$lib/components/ChatError.svelte';
	import { useLangGraphOptional } from '$lib/components/chat/langGraphContext.svelte.js';

	let show_login_dialog = $state(!page.data.session);
	let redirect_error = $state<Error | null>(null);

	// `/chat` sits under `chat/+layout.svelte`'s `<LangGraph>`, so `ctx` is in scope — and its
	// `client` is the one, shared client for the whole `/chat` subtree (no separate derivation
	// here anymore). Its owned `ThreadList` has usually already resolved its first page by the
	// time `getOrCreateThread` creates a brand-new thread, and the redirect below keeps the same
	// layout/client (so the derived client doesn't change) — without the `refresh()` nudge below
	// the new thread stays invisible in the sidebar until the user sends a message or reloads.
	const ctx = useLangGraphOptional();

	async function redirectToThread(isCancelled: () => boolean) {
		const client = ctx?.client;
		if (!client) return;

		try {
			const thread = await getOrCreateThread(client);
			// A navigation away from this page (e.g. the user clicking an existing thread in the
			// sidebar) while the fetch above was in flight must win — otherwise this stale
			// resolution would yank them back to the reused/created thread they no longer asked
			// for. Mirrors the selection-epoch guard in `LangGraphContext#createThread`; `isCancelled`
			// flips true from the effect's cleanup below, which runs on unmount (this component is
			// swapped out entirely once `goto` lands on `/chat/[threadID]`).
			if (isCancelled()) return;
			await goto(`/chat/${thread.thread_id}`);
			ctx?.threadList.refresh();
		} catch (err) {
			if (isCancelled()) return;
			if (err instanceof Error) redirect_error = err;
			console.error('Error creating or fetching thread:', err);
		}
	}

	// Trigger redirect when client is ready
	$effect(() => {
		if (ctx?.client && !redirect_error) {
			let cancelled = false;
			redirectToThread(() => cancelled);
			return () => {
				cancelled = true;
			};
		}
	});

	$effect.pre(() => {
		if (!page.data.session) show_login_dialog = true;
	});
</script>

{#if redirect_error}
	<ChatError error={redirect_error} />
{:else}
	<ChatLoader />
{/if}

<LoginModal bind:open={show_login_dialog} />
