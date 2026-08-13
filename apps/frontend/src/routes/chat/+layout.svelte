<script lang="ts">
	/**
	 * Chat shell adapter (SLG-104).
	 *
	 * This is the seam between SvelteKit-specific concerns (`$app/state`, `$app/navigation`,
	 * paraglide) and the container-agnostic `ChatThreads` / `ThreadList` pieces, which know
	 * nothing about routing or i18n.
	 */
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import * as Sidebar from '$lib/components/ui/sidebar';
	import { ChatThreads } from '$lib/components/ChatThreads';
	import { createClient, createThread } from '$lib/langgraph/client';
	import { ThreadList } from '$lib/langgraph/threadList.svelte';
	import { setThreadListRefresh } from '$lib/langgraph/threadListContext';
	import { parseSidebarCookie } from '$lib/sidebarCookie';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	// Derive from the token *string*, not from `page.data.session`: SvelteKit hands out a fresh
	// data object on every navigation, so keying on the object would mint a new Client — and
	// restart the thread fetch — on every thread click.
	let accessToken = $derived(page.data.session?.accessToken ?? null);
	let client = $derived(accessToken ? createClient(accessToken) : null);
	let activeThreadId = $derived(page.params.threadID ?? null);

	// Seeded once at init, then owned by `Sidebar.Provider` (`bind:open`). The root `load` only
	// reruns on a hard navigation, so on a client-side remount `page.data.sidebarOpen` can be
	// stale — the cookie (written on every toggle) is the source of truth once we're in the
	// browser.
	let sidebarOpen = $state(
		(browser ? parseSidebarCookie(document.cookie) : null) ?? page.data.sidebarOpen
	);

	const threadList = new ThreadList({ initialLoading: Boolean(page.data.session?.accessToken) });
	setThreadListRefresh({ refresh: () => threadList.refresh() });

	// The single wiring effect — `ThreadList` deliberately contains no effects of its own.
	$effect(() => {
		threadList.setClient(client);
	});

	$effect(() => {
		threadList.setActiveThreadId(activeThreadId);
	});

	onDestroy(() => threadList.dispose());

	let creating = $state(false);
	let createError = $state<string | null>(null);

	// Any navigation to a different thread — including the one a successful handleNewThread
	// performs via goto — supersedes whatever the sidebar was reporting before, so a stale
	// creation error is cleared. A failed handleNewThread never changes activeThreadId, so
	// the alert stays visible exactly where it was set.
	$effect(() => {
		void activeThreadId;
		createError = null;
	});

	/** Returns false on failure so `ChatThreads` keeps the mobile drawer open over `createError`. */
	async function handleNewThread(): Promise<boolean> {
		if (creating || !client) return false;
		creating = true;
		createError = null;
		try {
			const thread = await createThread(client);
			await goto(`/chat/${thread.thread_id}`);
			threadList.refresh();
			return true;
		} catch (err) {
			console.error('Failed to create a new thread', err);
			createError = m.sidebar_new_chat_error();
			return false;
		} finally {
			creating = false;
		}
	}
</script>

<!-- `h-full min-h-0` overrides the provider's base `min-h-svh` via tailwind-merge. -->
<Sidebar.Provider bind:open={sidebarOpen} class="h-full min-h-0">
	<ChatThreads
		list={threadList}
		{activeThreadId}
		onNewThread={handleNewThread}
		busy={creating}
		disabled={!client}
		hrefFor={(t) => `/chat/${t.id}`}
		error={createError}
		labels={{
			newChat: m.sidebar_new_chat(),
			threadsLabel: m.sidebar_threads_label(),
			empty: m.sidebar_threads_empty(),
			loading: m.sidebar_threads_loading(),
			error: m.sidebar_threads_error(),
			retry: m.sidebar_threads_retry(),
			loadMore: m.sidebar_threads_load_more(),
			mobileTitle: m.sidebar_mobile_title(),
			mobileDescription: m.sidebar_mobile_description()
		}}
	/>

	<div class="bg-background relative flex w-full min-w-0 flex-1 flex-col">
		<div class="flex shrink-0 items-center px-2 py-1">
			<Sidebar.Trigger label={m.sidebar_toggle()} />
		</div>
		<div class="min-h-0 flex-1">
			{@render children()}
		</div>
	</div>
</Sidebar.Provider>
