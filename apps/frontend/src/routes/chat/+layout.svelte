<script lang="ts">
	/**
	 * Chat shell adapter (SLG-104, updated for the `<LangGraph>` provider in SLG-133 PR 3).
	 *
	 * This is the seam between SvelteKit-specific concerns (`$app/state`, `$app/navigation`,
	 * paraglide) and the container-agnostic `<LangGraph>` provider / `ThreadList` pieces, which
	 * know nothing about routing or i18n. `ThreadListSidebar.svelte` (a child of `<LangGraph>`
	 * below) is the one further seam needed for the `navigating`/pending-row merge — see its own
	 * header comment.
	 */
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { env } from '$env/dynamic/public';

	import * as Sidebar from '$lib/components/ui/sidebar';
	import LangGraph from '$lib/components/chat/LangGraph.svelte';
	import ThreadListSidebar from './ThreadListSidebar.svelte';
	import { parseSidebarCookie } from '$lib/sidebarCookie';
	import * as m from '$lib/paraglide/messages.js';
	import type { LangGraphLabels } from '$lib/components/chat/labels.js';

	let { children } = $props();

	// Ports the localized label objects `Chat.svelte` used to build itself (SLG-133 PR 3 moves
	// `Conversation` off paraglide entirely — see its header comment). Nested exactly as before:
	// `resolveLabels`'s per-scope merge replaces a scope wholesale, so `messagesList` needs its
	// `message`/`toolMessage`/`errorMessage` sub-scopes nested here, not flattened.
	const chatLabels: LangGraphLabels = {
		threadList: {
			newChat: m.sidebar_new_chat(),
			threadsLabel: m.sidebar_threads_label(),
			empty: m.sidebar_threads_empty(),
			loading: m.sidebar_threads_loading(),
			error: m.sidebar_threads_error(),
			retry: m.sidebar_threads_retry(),
			loadMore: m.sidebar_threads_load_more(),
			mobileTitle: m.sidebar_mobile_title(),
			mobileDescription: m.sidebar_mobile_description()
		},
		composer: {
			placeholder: m.chat_input_placeholder()
		},
		messagesList: {
			message: {
				aiActions: {
					copy: m.message_copy(),
					copied: m.message_copied(),
					regenerate: m.message_regenerate(),
					feedback: {
						good: m.message_feedback_good(),
						bad: m.message_feedback_bad(),
						comingSoon: m.coming_soon()
					}
				},
				userActions: {
					edit: m.message_edit()
				},
				userEdit: {
					edit: m.message_edit(),
					cancel: m.cancel(),
					saveAndSend: m.save_and_send()
				},
				thinking: {
					thinking: m.thinking()
				}
			},
			toolMessage: {
				usingTools: m.tools_using(),
				toolLabel: m.tool_label(),
				parameters: m.tool_parameters(),
				noParameters: m.tool_no_parameters(),
				result: m.tool_result()
			},
			errorMessage: {
				retry: m.chat_error_retry()
			}
		}
	};

	// Derive from the token *string*, not from `page.data.session`: SvelteKit hands out a fresh
	// data object on every navigation, so keying on the object would mint a new Client — and
	// restart the thread fetch — on every thread click. `<LangGraph>` preserves this same
	// discipline internally.
	let accessToken = $derived(page.data.session?.accessToken ?? null);
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
	token={accessToken}
	{activeThreadId}
	onThreadChange={(id) => {
		if (id) void goto(`/chat/${id}`);
	}}
	hrefFor={(t) => `/chat/${t.id}`}
	labels={chatLabels}
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
