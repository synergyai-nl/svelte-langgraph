<script lang="ts" module>
	export interface ThinkingBlockLabels {
		thinking: string;
	}

	export const defaultThinkingBlockLabels: ThinkingBlockLabels = {
		thinking: 'Thinking'
	};
</script>

<script lang="ts">
	import { Brain, ChevronRight } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import { resolveLabels, type DeepPartial } from './labels';

	interface Props {
		thinking: string;
		/** Animate the icon while thinking tokens are actively streaming in. */
		active?: boolean;
		labels?: DeepPartial<ThinkingBlockLabels>;
	}

	let { thinking, active = false, labels }: Props = $props();

	const l = $derived(resolveLabels(defaultThinkingBlockLabels, undefined, labels));

	let collapsed = $state(true);
	const uid = $props.id();
	const contentId = `thinking-content-${uid}`;
</script>

<div class="mb-2">
	<button
		type="button"
		aria-expanded={!collapsed}
		aria-controls={collapsed ? undefined : contentId}
		class="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-sm text-purple-700 transition-colors hover:bg-purple-100 focus:ring-2 focus:ring-purple-400 focus:ring-offset-1 focus:outline-none dark:bg-purple-900/20 dark:text-purple-300 dark:hover:bg-purple-900/30"
		onclick={() => (collapsed = !collapsed)}
		data-streaming={active ? 'true' : 'false'}
	>
		<Brain size={16} class="text-purple-500 dark:text-purple-400 {active ? 'animate-pulse' : ''}" />
		<span>{l.thinking}</span>
		<ChevronRight class="h-3 w-3" style={collapsed ? '' : 'transform: rotate(90deg)'} />
	</button>

	{#if !collapsed}
		<div
			id={contentId}
			class="mt-2 rounded-lg border border-purple-100 bg-purple-50/50 px-3 py-2 text-xs text-purple-800 dark:border-purple-800/30 dark:bg-purple-900/10 dark:text-purple-300"
			transition:slide
		>
			<pre class="font-sans whitespace-pre-wrap">{thinking}</pre>
		</div>
	{/if}
</div>
