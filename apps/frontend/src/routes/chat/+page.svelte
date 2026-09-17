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

	async function redirectToThread() {
		if (!client) return;

		try {
			const thread = await getOrCreateThread(client);
			await goto(`/chat/${thread.thread_id}`);
			threadListRefresh?.refresh();
		} catch (err) {
			if (err instanceof Error) redirect_error = err;
			console.error('Error creating or fetching thread:', err);
		}
	}

	// Trigger redirect when client is ready
	$effect(() => {
		if (client && !redirect_error) {
			redirectToThread();
		}
	});
</script>

{#if redirect_error}
	<ChatError error={redirect_error} />
{:else}
	<ChatLoader />
{/if}
