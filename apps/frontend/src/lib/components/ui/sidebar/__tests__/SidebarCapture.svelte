<script lang="ts">
	import { useSidebar } from '../context.svelte.js';

	interface Props {
		onSidebar: (s: ReturnType<typeof useSidebar>) => void;
	}

	let { onSidebar }: Props = $props();

	// Rendered as a child of `Sidebar.Provider`, so `useSidebar()` resolves here. Hands the real
	// `SidebarState` back to the test so it can drive `setOpen`/dispatch keyboard events and
	// assert on the resulting state without re-implementing the context lookup itself.
	onSidebar(useSidebar());
</script>
