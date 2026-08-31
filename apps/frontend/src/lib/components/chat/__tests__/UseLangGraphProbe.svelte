<script lang="ts">
	/**
	 * Calls `useLangGraph()`/`useLangGraphOptional()` during component init and hands the result (or
	 * the thrown error, for `useLangGraph()` outside a provider) to the test via callback props.
	 * Rendered bare (no `<LangGraph>` ancestor) to test the "outside a provider" cases, or nested
	 * inside `<LangGraph>`/`LangGraphHost` to capture the live context instance.
	 */
	import { useLangGraph, useLangGraphOptional } from '../langGraphContext.svelte.js';
	import type { LangGraphContext } from '../langGraphContext.svelte.js';

	interface Props {
		/** Use `useLangGraph()` (throws outside a provider) instead of the optional variant. */
		required?: boolean;
		onResult?: (ctx: LangGraphContext | undefined) => void;
	}

	let { required = false, onResult }: Props = $props();

	const ctx = required ? useLangGraph() : useLangGraphOptional();
	onResult?.(ctx);
</script>

<div data-testid="use-langgraph-probe"></div>
