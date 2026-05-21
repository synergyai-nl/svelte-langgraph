<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	type Variant = 'default' | 'secondary' | 'destructive' | 'outline';

	let {
		variant = 'default' as Variant,
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { variant?: Variant } = $props();

	const variantClasses: Record<Variant, string> = {
		default: 'bg-primary text-primary-foreground hover:bg-primary/80',
		secondary: 'bg-muted text-muted-foreground hover:bg-muted/80',
		destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
		outline: 'border border-border text-foreground'
	};
</script>

<div
	data-slot="badge"
	class={cn(
		'focus:ring-ring inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none',
		variantClasses[variant],
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
