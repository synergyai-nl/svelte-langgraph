<script lang="ts">
	/**
	 * Chat shell adapter (SLG-104).
	 *
	 * This is the seam between SvelteKit-specific concerns (`$app/state`, `$app/navigation`,
	 * paraglide) and the container-agnostic `ChatThreads` / `ThreadList` pieces, which know
	 * nothing about routing or i18n.
	 */
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import * as Sidebar from '$lib/components/ui/sidebar';
	import { ChatThreads } from '$lib/components/ChatThreads';
	import { createClient, createThread } from '$lib/langgraph/client';
	import { ThreadList } from '$lib/langgraph/threadList.svelte';
	import { setThreadListRefresh } from '$lib/langgraph/threadListContext';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	// Derive from the token *string*, not from `page.data.session`: SvelteKit hands out a fresh
	// data object on every navigation, so keying on the object would mint a new Client — and
	// restart the thread fetch — on every thread click.
	let accessToken = $derived(page.data.session?.accessToken ?? null);
	let client = $derived(accessToken ? createClient(accessToken) : null);
	let activeThreadId = $derived(page.params.threadID ?? null);

	const threadList = new ThreadList();
	setThreadListRefresh({ refresh: () => threadList.refresh() });

	// The single wiring effect — `ThreadList` deliberately contains no effects of its own.
	$effect(() => {
		threadList.setClient(client);
	});

	onDestroy(() => threadList.dispose());

	let creating = $state(false);

	async function handleNewThread() {
		if (creating || !client) return;
		creating = true;
		try {
			const thread = await createThread(client);
			await goto(`/chat/${thread.thread_id}`);
			threadList.refresh();
		} finally {
			creating = false;
		}
	}
</script>

<!-- `h-full min-h-0` overrides the provider's base `min-h-svh` via tailwind-merge. -->
<Sidebar.Provider open={page.data.sidebarOpen} class="h-full min-h-0">
	<ChatThreads
		list={threadList}
		{activeThreadId}
		onNewThread={handleNewThread}
		busy={creating}
		disabled={!client}
		hrefFor={(t) => `/chat/${t.id}`}
		labels={{
			newChat: m.sidebar_new_chat(),
			threadsLabel: m.sidebar_threads_label(),
			empty: m.sidebar_threads_empty(),
			loading: m.sidebar_threads_loading(),
			error: m.sidebar_threads_error(),
			retry: m.sidebar_threads_retry(),
			loadMore: m.sidebar_threads_load_more()
		}}
	/>

	<div class="bg-background relative flex w-full min-w-0 flex-1 flex-col">
		<div class="flex shrink-0 items-center px-2 py-1">
			<Sidebar.Trigger />
		</div>
		<div class="min-h-0 flex-1">
			{@render children()}
		</div>
	</div>
</Sidebar.Provider>
