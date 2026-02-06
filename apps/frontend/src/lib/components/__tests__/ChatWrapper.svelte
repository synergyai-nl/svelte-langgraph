<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import Chat from '../Chat.svelte';
	import type { ChatSuggestion } from '../ChatSuggestions.svelte';
	import type { Client, Thread } from '@langchain/langgraph-sdk';
	import type { ThreadValues } from '$lib/langgraph/types';

	interface Props {
		langGraphClient: Client;
		assistantId: string;
		thread: Thread<ThreadValues>;
		suggestions?: ChatSuggestion[];
		intro?: string;
		introTitle?: string;
	}

	let {
		langGraphClient,
		assistantId,
		thread,
		suggestions = [],
		intro = '',
		introTitle = ''
	}: Props = $props();
</script>

<Tooltip.Provider>
	<Chat {langGraphClient} {assistantId} {thread} {suggestions} {intro} {introTitle} />
</Tooltip.Provider>
