<script lang="ts">
	/**
	 * A tooltip as `<LangGraph>`'s only child, with no `Tooltip.Provider` around it: Bits UI throws
	 * without an ancestor provider, so this checks `<LangGraph>` supplies one.
	 */
	import * as Tooltip from '$lib/components/ui/tooltip';
	import LangGraph from '../LangGraph.svelte';
</script>

<LangGraph assistantId="assistant-1">
	<Tooltip.Root>
		<Tooltip.Trigger>Trigger</Tooltip.Trigger>
		<Tooltip.Content>Tip</Tooltip.Content>
	</Tooltip.Root>
</LangGraph>
