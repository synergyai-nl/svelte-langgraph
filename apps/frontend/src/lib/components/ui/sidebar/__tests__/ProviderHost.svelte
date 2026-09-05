<script lang="ts">
	import * as Sidebar from '../index.js';
	import SidebarCapture from './SidebarCapture.svelte';

	interface Props {
		onSidebar: (s: ReturnType<typeof Sidebar.useSidebar>) => void;
		/** Whether to mount a `Sidebar.Root` inside the provider (SLG-133 registration gate). */
		withRoot?: boolean;
	}

	let { onSidebar, withRoot = false }: Props = $props();
</script>

<Sidebar.Provider>
	<SidebarCapture {onSidebar} />
	{#if withRoot}
		<Sidebar.Root collapsible="offcanvas" />
	{/if}
</Sidebar.Provider>
