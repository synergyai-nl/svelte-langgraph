<script lang="ts">
	import { Button, Spinner } from 'flowbite-svelte';
	import { PaperPlaneSolid } from 'flowbite-svelte-icons';

	interface Props {
		isStreaming: boolean;
		disabled: boolean;
	}

	let { isStreaming, disabled }: Props = $props();
</script>

<Button
	type="submit"
	{disabled}
	size="sm"
	class="bg-primary-600 hover:bg-primary-700 flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 text-white shadow-sm disabled:cursor-not-allowed disabled:bg-gray-300"
>
	{#if isStreaming}
		<Spinner />
	{:else}
		<PaperPlaneSolid class="h-3 w-3 rotate-45" />
	{/if}
</Button>
