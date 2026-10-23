<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ThreadList from '../ThreadList.svelte';
	import SidebarNotifier from './SidebarNotifier.svelte';
	import { LangGraphContext, setLangGraphContext } from '../../langGraphContext.svelte.js';
	import type { ComponentProps } from 'svelte';

	interface HostProps {
		/**
		 * The `<LangGraph>` context `ThreadList` requires, set directly (same approach as
		 * `LangGraphHost`). Falls back to a fresh, empty one.
		 */
		ctx?: LangGraphContext;
		/** Hands the test the real `SidebarState` (e.g. to `setOpenMobile(true)` before asserting). */
		onSidebar?: (s: ReturnType<typeof Sidebar.useSidebar>) => void;
	}

	let {
		ctx: ctxProp,
		onSidebar,
		...props
	}: ComponentProps<typeof ThreadList> & HostProps = $props();

	// Read once at init: the context value must never change identity.
	setLangGraphContext(ctxProp ?? new LangGraphContext());
</script>

<!--
	Sidebar.MenuButton (used by ThreadListItem) requires useSidebar() context, which only
	Sidebar.Provider sets up. TestProviders only supplies Tooltip context, so this host wraps
	ThreadList in a real Sidebar.Provider instead.
-->
<Sidebar.Provider>
	<ThreadList {...props} />
	{#if onSidebar}
		<SidebarNotifier {onSidebar} />
	{/if}
</Sidebar.Provider>
