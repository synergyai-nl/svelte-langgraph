<script lang="ts">
	import { SendHorizontal, Square } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		isStreaming: boolean;
		disabled: boolean;
		onStop?: () => void;
		/** Accessible name of the Send button (it is icon-only). */
		sendLabel: string;
		/** Accessible name of the Stop button (it is icon-only). */
		stopLabel: string;
	}

	let { isStreaming, disabled, onStop, sendLabel, stopLabel }: Props = $props();
</script>

{#if isStreaming}
	<Button
		type="button"
		size="icon-sm"
		variant="destructive"
		class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 text-white shadow-sm"
		aria-label={stopLabel}
		onclick={onStop}
	>
		<Square aria-hidden="true" class="h-4 w-4" />
	</Button>
{:else}
	<Button
		type="submit"
		{disabled}
		aria-label={sendLabel}
		size="icon-sm"
		variant="default"
		class="bg-primary-600 hover:bg-primary-700 flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 text-white shadow-sm disabled:cursor-not-allowed disabled:bg-gray-300"
	>
		<SendHorizontal aria-hidden="true" />
	</Button>
{/if}
