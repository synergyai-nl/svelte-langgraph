<script lang="ts">
    import { Tooltip as TooltipPrimitive } from 'bits-ui';
    import { cn } from '$lib/utils.js';
    import TooltipPortal from './tooltip-portal.svelte';
    import type { ComponentProps } from 'svelte';
    import type { WithoutChildrenOrChild } from '$lib/utils.js';

    let {
        ref = $bindable(null),
        class: className,
        sideOffset = 0,
        side = 'top',
        children,
        arrowClasses,
        portalProps,
        ...restProps
    }: TooltipPrimitive.ContentProps & {
        arrowClasses?: string;
        portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
    } = $props();
</script>

<TooltipPortal {...portalProps}>
    <TooltipPrimitive.Content
            bind:ref
            data-slot="tooltip-content"
            {sideOffset}
            {side}
            class={cn(
			'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-end-2 data-[side=right]:slide-in-from-start-2 data-[side=top]:slide-in-from-bottom-2 z-50 h-9 w-fit origin-(--bits-tooltip-content-transform-origin) items-center rounded-md border-1 border-gray-300 bg-white px-3 py-2 text-sm text-balance text-black shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white',
			className
		)}
            {...restProps}
    >
        {@render children?.()}
        <TooltipPrimitive.Arrow>
            {#snippet child({ props })}
                <div
                        class={cn(
						'z-50 size-2.5 rotate-45 rounded-[2px]  border-1 border-t-0 border-l-0 border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800',
						'data-[side=top]:translate-x-1/2 data-[side=top]:translate-y-[calc(-50%_+_2px)]',
						'data-[side=bottom]:-translate-x-1/2 data-[side=bottom]:-translate-y-[calc(-50%_+_1px)]',
						'data-[side=right]:translate-x-[calc(50%_+_2px)] data-[side=right]:translate-y-1/2',
						'data-[side=left]:-translate-y-[calc(50%_-_3px)]',
						arrowClasses
					)}
                        {...props}
                ></div>
            {/snippet}
        </TooltipPrimitive.Arrow>
    </TooltipPrimitive.Content>
</TooltipPortal>
