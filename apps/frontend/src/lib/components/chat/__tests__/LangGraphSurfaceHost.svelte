<script lang="ts">
	/** The real `<LangGraph>` provider around a `ChatSurface` on a fixed thread. */
	import type { ComponentProps } from 'svelte';
	import LangGraph from '../LangGraph.svelte';
	import ChatSurface from '../ChatSurface.svelte';

	let props: Omit<ComponentProps<typeof LangGraph>, 'children'> = $props();
</script>

<LangGraph {...props}>
	<ChatSurface threadId="test-123" />
</LangGraph>
