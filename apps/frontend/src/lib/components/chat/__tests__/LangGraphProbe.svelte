<script lang="ts">
	/**
	 * Mounts the real `<LangGraph>` provider — exercising its actual wiring effects (client
	 * derivation, assistant resolution, prop pass-through) rather than a stubbed context — and hands
	 * the live `LangGraphContext` instance to the test via `onCtx`, captured by a nested
	 * `UseLangGraphProbe` (only a descendant of `<LangGraph>` can read its context).
	 *
	 * Tests using this should pass an explicit `assistantId` unless they specifically want to
	 * exercise assistant *resolution*, since omitting it makes `<LangGraph>` call the real
	 * `getOrCreateAssistant`, which performs network requests `Client` will attempt against
	 * whatever `url` was given.
	 */
	import LangGraph from '../LangGraph.svelte';
	import UseLangGraphProbe from './UseLangGraphProbe.svelte';
	import type { LangGraphContext } from '../langGraphContext.svelte.js';
	import type { ComponentProps } from 'svelte';

	interface Props extends Omit<ComponentProps<typeof LangGraph>, 'children'> {
		onCtx?: (ctx: LangGraphContext | undefined) => void;
	}

	let { onCtx, ...rest }: Props = $props();
</script>

<LangGraph {...rest}>
	<UseLangGraphProbe onResult={onCtx} />
</LangGraph>
