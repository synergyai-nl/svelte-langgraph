<script lang="ts">
	import { toggleMode, mode } from 'mode-watcher';
	import { buttonVariants } from '$lib/components/ui/button';
	import { Moon, Sun } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let { class: className = '' } = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger
		onclick={toggleMode}
		class={cn(buttonVariants({ variant: 'outline', size: 'sm' }), className)}
	>
		{#if mode.current === 'light'}
			<Sun size={16} />
		{:else}
			<Moon size={16} />
		{/if}
	</Tooltip.Trigger>
	<Tooltip.Content>
		{mode.current === 'light' ? m.light_mode() : m.dark_mode()}
	</Tooltip.Content>
</Tooltip.Root>
