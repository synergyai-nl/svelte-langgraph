<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import {
		setThreadListRefresh,
		setThreadLoadingReporter,
		type ThreadLoadingReporter
	} from '@svelte-langgraph/client';
	import Chat from '../Chat.svelte';
	import type { ComponentProps } from 'svelte';

	interface Props {
		/** Spy invoked whenever Chat asks the thread list to refresh. */
		refresh: () => void;
		/** Spy invoked whenever Chat reports its history-loading state. */
		loadingReporter?: ThreadLoadingReporter;
		chatProps: ComponentProps<typeof Chat>;
	}

	let { refresh, loadingReporter, chatProps }: Props = $props();

	// Must run during component init — Chat calls getThreadListRefresh()/getThreadLoadingReporter()
	// while initialising.
	setThreadListRefresh({ refresh: () => refresh() });
	setThreadLoadingReporter({
		setLoading: (threadId, loading) => loadingReporter?.setLoading(threadId, loading)
	});
</script>

<Tooltip.Provider>
	<Chat {...chatProps} />
</Tooltip.Provider>
