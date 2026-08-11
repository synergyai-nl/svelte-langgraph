<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ChatThreads from '../ChatThreads.svelte';
	import SidebarNotifier from './SidebarNotifier.svelte';
	import type { ComponentProps } from 'svelte';

	interface HostProps {
		/** Hands the test the real `SidebarState` (e.g. to `setOpenMobile(true)` before asserting). */
		onSidebar?: (s: ReturnType<typeof Sidebar.useSidebar>) => void;
	}

	let { onSidebar, ...props }: ComponentProps<typeof ChatThreads> & HostProps = $props();
</script>

<!--
	Sidebar.MenuButton (used by ChatThreadItem) requires useSidebar() context, which only
	Sidebar.Provider sets up. TestProviders only supplies Tooltip context, so this host wraps
	ChatThreads in a real Sidebar.Provider instead.
-->
<Sidebar.Provider>
	<ChatThreads {...props} />
	{#if onSidebar}
		<SidebarNotifier {onSidebar} />
	{/if}
</Sidebar.Provider>
