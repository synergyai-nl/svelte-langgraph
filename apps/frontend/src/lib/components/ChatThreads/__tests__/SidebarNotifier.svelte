<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar';

	interface Props {
		onSidebar: (s: ReturnType<typeof Sidebar.useSidebar>) => void;
	}

	let { onSidebar }: Props = $props();

	// Rendered as a child of `Sidebar.Provider` (see ChatThreadsHost), so `useSidebar()` resolves
	// here. Handing the real `SidebarState` back to the test lets it drive `setOpenMobile` and
	// assert on `openMobile` without re-implementing the context lookup itself.
	onSidebar(Sidebar.useSidebar());
</script>
