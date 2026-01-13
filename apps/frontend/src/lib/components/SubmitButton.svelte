<script lang="ts">
	import { Spinner } from 'flowbite-svelte';
	import { SendHorizontal } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		isStreaming: boolean;
		disabled: boolean;
	}

	let { isStreaming, disabled }: Props = $props();
</script>

<Button
	type="submit"
	{disabled}
	size="icon-sm"
	variant="default"
	class="bg-primary-600 hover:bg-primary-700 flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 text-white shadow-sm disabled:cursor-not-allowed disabled:bg-gray-300"
>
	{#if isStreaming}
		<Spinner />
	{:else}
		<SendHorizontal />
	{/if}
</Button>
