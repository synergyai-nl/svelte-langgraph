<script lang="ts">
	import { goto } from '$app/navigation';
	import { getBackend } from '$lib/langgraph/backendContext';
	import { getOrCreateThread } from '$lib/langgraph/client';
	import { getThreadListRefresh } from '$lib/langgraph/threadListContext';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import ChatError from '$lib/components/ChatError.svelte';

	const backend = getBackend();
	let client = $derived(backend.client);
	let redirect_error = $state<Error | null>(null);

	// `/chat` sits under `chat/+layout.svelte`, so the refresh context is in scope. The layout's
	// `ThreadList` has usually already resolved its first page by the time `getOrCreateThread`
	// creates a brand-new thread, and the redirect below keeps the same layout/client (so
	// `setClient` doesn't rerun) — without this nudge the new thread stays invisible in the
	// sidebar until the user sends a message or reloads.
	const threadListRefresh = getThreadListRefresh();

	async function redirectToThread(
		currentClient: NonNullable<typeof client>,
		isActive: () => boolean
	) {
		redirect_error = null;
		try {
			const thread = await getOrCreateThread(currentClient);
			if (!isActive()) return;
			threadListRefresh?.refresh();
			await goto(`/chat/${thread.thread_id}`);
		} catch (err) {
			if (!isActive()) return;
			redirect_error = err instanceof Error ? err : new Error(String(err));
			console.error('Error creating or fetching thread:', err);
		}
	}

	// Trigger once when the client is ready, and again after an explicit auth recovery.
	$effect(() => {
		void backend.recoveryGeneration;
		const currentClient = client;
		if (!currentClient) return;
		let active = true;
		redirectToThread(currentClient, () => active);
		return () => {
			active = false;
		};
	});
</script>

{#if redirect_error}
	<ChatError error={redirect_error} />
{:else}
	<ChatLoader />
{/if}
