<script lang="ts">
	import { ScrollableContainer } from '../index';
	import type { BaseMessage } from '$lib/langgraph/types';

	interface Props {
		message?: BaseMessage | null;
	}

	let { message = null }: Props = $props();
</script>

<!--
	Minimal host mirroring how ChatMessages.svelte attaches `scrollToMe(message)`
	to a message row, so tests can exercise the real attachment wiring end to end.
-->
<ScrollableContainer>
	{#snippet children({ scrollToMe })}
		<div {@attach scrollToMe(message)}>row</div>
	{/snippet}
</ScrollableContainer>
