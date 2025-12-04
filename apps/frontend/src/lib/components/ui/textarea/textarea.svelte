<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from '$lib/utils.js';
	import type { HTMLTextareaAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		'data-slot': dataSlot = 'textarea',
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
	const BASE_CLASSES =
		'flex w-full resize-none items-center border-none bg-transparent text-base leading-6 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none dark:bg-transparent dark:text-white dark:placeholder-gray-400';
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		'placeholder:text-muted-foreground aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex  field-sizing-content min-h-16 w-full rounded-md bg-none px-3 py-2 text-base transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
		BASE_CLASSES,
		className
	)}
	bind:value
	{...restProps}
></textarea>
