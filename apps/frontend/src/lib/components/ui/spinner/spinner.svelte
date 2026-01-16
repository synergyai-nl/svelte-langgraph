<script lang="ts" module>
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { type VariantProps, tv } from 'tailwind-variants';

	export const spinnerVariants = tv({
		base: 'animate-spin text-current',
		variants: {
			size: {
				default: 'size-4',
				sm: 'size-3',
				lg: 'size-6',
				xl: 'size-8'
			}
		},
		defaultVariants: {
			size: 'default'
		}
	});

	export type SpinnerSize = VariantProps<typeof spinnerVariants>['size'];

	export type SpinnerProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		size?: SpinnerSize;
	};
</script>

<script lang="ts">
	import { LoaderCircle } from '@lucide/svelte';

	let {
		class: className,
		size = 'default',
		ref = $bindable(null),
		...restProps
	}: SpinnerProps = $props();
</script>

<div bind:this={ref} role="status" aria-label="Loading" {...restProps}>
	<LoaderCircle class={cn(spinnerVariants({ size }), className)} />
	<span class="sr-only">Loading...</span>
</div>