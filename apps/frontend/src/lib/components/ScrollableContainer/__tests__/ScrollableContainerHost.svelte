<script lang="ts">
	import { ScrollableContainer } from '../index';
	import type { BaseMessage } from '@svelte-langgraph/client';

	interface Props {
		message?: BaseMessage | null;
		/** When provided, renders one row per message instead of the single `message` row. */
		messages?: BaseMessage[];
	}

	let { message = null, messages }: Props = $props();

	const rows = $derived(messages ?? [message]);
</script>

<!--
	Minimal host mirroring how ChatMessages.svelte attaches `scrollToMe(message)`
	to a message row, so tests can exercise the real attachment wiring end to end.
-->
<ScrollableContainer>
	{#snippet children({ scrollToMe })}
		{#each rows as row, index (row?.id ?? index)}
			<div {@attach scrollToMe(row)}>row</div>
		{/each}
	{/snippet}
</ScrollableContainer>
