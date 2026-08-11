<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { setThreadListRefresh } from '$lib/langgraph/threadListContext';
	import Chat from '../Chat.svelte';
	import type { ComponentProps } from 'svelte';

	interface Props {
		/** Spy invoked whenever Chat asks the thread list to refresh. */
		refresh: () => void;
		chatProps: ComponentProps<typeof Chat>;
	}

	let { refresh, chatProps }: Props = $props();

	// Must run during component init — Chat calls getThreadListRefresh() while initialising.
	setThreadListRefresh({ refresh: () => refresh() });
</script>

<Tooltip.Provider>
	<Chat {...chatProps} />
</Tooltip.Provider>
