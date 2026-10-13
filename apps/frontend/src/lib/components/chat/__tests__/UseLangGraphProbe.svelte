<script lang="ts">
	/**
	 * Calls `useLangGraph()` during component init and hands the result to the test via a callback
	 * prop. Rendered bare (no `<LangGraph>` ancestor) to test that it throws outside a provider, or
	 * nested inside `<LangGraph>`/`LangGraphHost` to capture the live context instance.
	 */
	import { useLangGraph } from '../langGraphContext.svelte.js';
	import type { LangGraphContext } from '../langGraphContext.svelte.js';

	interface Props {
		/** Component name passed to `useLangGraph(name)`. */
		name?: string;
		onResult?: (ctx: LangGraphContext) => void;
	}

	let { name, onResult }: Props = $props();

	const ctx = useLangGraph(name);
	onResult?.(ctx);
</script>

<div data-testid="use-langgraph-probe"></div>
