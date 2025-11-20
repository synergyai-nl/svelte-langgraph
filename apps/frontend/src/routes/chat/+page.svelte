<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createClient, getOrCreateThread } from '$lib/langgraph/client';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';

	let show_login_dialog = $state(false);
	let client = $derived(page.data.session ? createClient(page.data.session.accessToken) : null);
	let redirect_error = $state<Error | null>(null);

	async function redirectToThread() {
		if (!client) return;

		try {
			const thread = await getOrCreateThread(client);
			await goto(`/chat/${thread.thread_id}`);
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

	$effect.pre(() => {
		if (!page.data.session) show_login_dialog = true;
	});
</script>

{#if redirect_error}
	<div class="flex h-screen items-center justify-center">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-red-600">Error</h1>
			<p class="mt-2 text-gray-600">{redirect_error.message}</p>
		</div>
	</div>
{:else}
	<ChatLoader />
{/if}

<LoginModal bind:open={show_login_dialog} />
