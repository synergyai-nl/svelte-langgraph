<script lang="ts">
	/**
	 * Chat shell adapter (SLG-104, updated for the `<LangGraph>` provider in SLG-133 PR 3).
	 *
	 * This is the seam between SvelteKit-specific concerns (`$app/state`, `$app/navigation`,
	 * paraglide) and the container-agnostic `<LangGraph>` provider / `ThreadList` pieces, which
	 * know nothing about routing. `ThreadListSidebar.svelte` (a child of `<LangGraph>`
	 * below) is the one further seam needed for the `navigating`/pending-row merge — see its own
	 * header comment.
	 */
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';

	import * as Sidebar from '$lib/components/ui/sidebar';
	import LangGraph from '$lib/components/chat/LangGraph.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import { backendAuth, getToken } from '$lib/auth/backendToken.svelte';
	import ThreadListSidebar from './ThreadListSidebar.svelte';
	import { parseSidebarCookie } from '$lib/sidebarCookie';
	import * as m from '$lib/paraglide/messages.js';

	let { children } = $props();

	// `getToken` is one stable function the client calls before every request, refreshing the
	// token when it nears expiry. A session change therefore never mints a new Client, which
	// would restart the thread fetch and remount the conversation.
	let signedOut = $derived(!page.data.session);

	// One sign-in prompt for the whole chat: when signed out, or when the session expired and
	// could not be refreshed. Closing it signed out goes home; closing an expired prompt stays,
	// and the next failed request reopens it.
	let loginOpen = $state(!page.data.session);
	$effect.pre(() => {
		if (signedOut || backendAuth.expired) loginOpen = true;
	});
	let activeThreadId = $derived(page.params.threadID ?? null);

	// Seeded once at init, then owned by `Sidebar.Provider` (`bind:open`, via `<LangGraph>`). The
	// root `load` only reruns on a hard navigation, so on a client-side remount
	// `page.data.sidebarOpen` can be stale — the cookie (written on every toggle) is the source of
	// truth once we're in the browser.
	let sidebarOpen = $state(
		(browser ? parseSidebarCookie(document.cookie) : null) ?? page.data.sidebarOpen
	);
</script>

<!-- Provider is `h-full min-h-0` by default (SLG-133); this layout's own ancestry supplies the
     viewport height (see the root layout's `h-svh` wrapper), so no override is needed here.
     `ThreadListSidebar` and the content pane below are `<LangGraph>`'s literal flex children —
     see `LangGraph.svelte`'s header comment for why nothing may wrap them. -->
<LangGraph
	url={env.PUBLIC_LANGGRAPH_API_URL ?? ''}
	token={signedOut ? null : getToken}
	{activeThreadId}
	onThreadChange={(id) => {
		if (id) void goto(`/chat/${id}`);
	}}
	hrefFor={(t) => `/chat/${t.id}`}
	bind:sidebarOpen
>
	<ThreadListSidebar />

	<div class="bg-background relative flex w-full min-w-0 flex-1 flex-col">
		<div class="flex shrink-0 items-center px-2 py-1">
			<Sidebar.Trigger label={m.sidebar_toggle()} />
		</div>
		<div class="min-h-0 flex-1">
			{@render children()}
		</div>
	</div>
</LangGraph>

<LoginModal
	bind:open={loginOpen}
	expired={!signedOut && backendAuth.expired}
	onclose={() => (backendAuth.expired = false)}
/>
