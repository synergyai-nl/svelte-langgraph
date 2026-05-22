<script lang="ts">
	import { cn } from '$lib/utils';

	let { class: className = '' }: { class?: string } = $props();
</script>

<div class={cn('py-8', className)}>
	<div
		class="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 px-6 sm:flex-row sm:gap-6"
	>
		<span class="text-muted-foreground text-sm tracking-wide">Built with</span>
		<div class="flex items-center gap-5">
			<img
				src="/logos/svelte.svg"
				alt="Svelte"
				class="h-9 w-9 opacity-70 transition-opacity hover:opacity-100"
			/>
			<span class="text-muted-foreground/40 text-2xl font-extralight" aria-hidden="true">+</span>
			<img
				src="/logos/langgraph.svg"
				alt="LangGraph"
				class="h-9 w-9 opacity-80 transition-opacity hover:opacity-100"
			/>
		</div>
	</div>
</div>
