<script lang="ts">
	import { PanelLeft } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import { useSidebar } from './context.svelte.js';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		onclick,
		// PATCHED vs upstream registry: upstream hard-codes the accessible label in English;
		// taking it as a prop (defaulting to the upstream string) lets callers pass localized
		// text without importing paraglide into ui/ (SLG-104).
		label = 'Toggle Sidebar',
		...restProps
	}: ComponentProps<typeof Button> & {
		onclick?: (e: MouseEvent) => void;
		label?: string;
	} = $props();

	const sidebar = useSidebar();
</script>

<Button
	bind:ref
	data-sidebar="trigger"
	data-slot="sidebar-trigger"
	variant="ghost"
	size="icon-sm"
	class={cn('cn-sidebar-trigger', className)}
	type="button"
	onclick={(e) => {
		onclick?.(e);
		sidebar.toggle();
	}}
	{...restProps}
>
	<PanelLeft />
	<span class="sr-only">{label}</span>
</Button>
