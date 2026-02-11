<script lang="ts">
	import { toggleMode, mode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button';
	import { Moon, Sun } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let { class: className = '' } = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		<Button onclick={toggleMode} class={cn('', className)} variant="outline" size="sm">
			{#if mode.current === 'light'}
				<Sun size={16} />
			{:else}
				<Moon size={16} />
			{/if}
		</Button>
	</Tooltip.Trigger>
	<Tooltip.Content>
		{mode.current === 'light' ? m.light_mode() : m.dark_mode()}
	</Tooltip.Content>
</Tooltip.Root>
