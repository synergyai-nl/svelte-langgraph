<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';
	import ChatThreads from '../ChatThreads.svelte';
	import type { ComponentProps } from 'svelte';

	let props: ComponentProps<typeof ChatThreads> = $props();
</script>

<!--
	Sidebar.MenuButton (used by ChatThreadItem) requires useSidebar() context, which only
	Sidebar.Provider sets up. TestProviders only supplies Tooltip context, so this host wraps
	ChatThreads in a real Sidebar.Provider instead.
-->
<Sidebar.Provider>
	<ChatThreads {...props} />
</Sidebar.Provider>
