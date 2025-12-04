<script lang="ts">
    import { cn, type WithElementRef, type WithoutChildren } from "$lib/utils.js";
    import type { HTMLTextareaAttributes } from "svelte/elements";

    let {
        ref = $bindable(null),
        value = $bindable(),
        class: className,
        "data-slot": dataSlot = "textarea",
        ...restProps
    }: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
    const BASE_CLASSES = "flex w-full resize-none items-center border-none bg-transparent text-base leading-6 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none dark:bg-transparent dark:text-white dark:placeholder-gray-400";
</script>

<textarea
        bind:this={ref}
        data-slot={dataSlot}
        class={cn(
       // --- REMOVED: Border and Focus Ring Classes ---
       // Removed: border-input (default border color)
       // Removed: border (default border)
       // Removed: focus-visible:border-ring (focus border)
       // Removed: focus-visible:ring-[3px] (focus ring)
       // Removed: focus-visible:ring-ring/50 (focus ring color)
       "placeholder:text-muted-foreground aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 field-sizing-content  flex min-h-16 w-full rounded-md bg-none px-3 py-2 text-base outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
       BASE_CLASSES,
       className
    )}
        bind:value
        {...restProps}
></textarea>