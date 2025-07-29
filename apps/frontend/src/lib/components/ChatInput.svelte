<script lang="ts">
	import { Button, Textarea, Spinner } from 'flowbite-svelte';

	interface Props {
		value: string;
		isStreaming?: boolean;
		onSubmit: () => void;
		placeholder?: string;
	}

	let {
		value = $bindable(),
		isStreaming = false,
		onSubmit,
		placeholder = 'Message...'
	}: Props = $props();

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && event.shiftKey === false) {
			event.preventDefault();
			onSubmit();
		}
	}
</script>

<div
	class="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
>
	<div class="mx-auto w-full max-w-4xl px-4 py-4">
		<form id="input_form" onsubmit={onSubmit}>
			<Textarea
				id="user-input"
				disabled={isStreaming}
				{placeholder}
				rows={2}
				name="message"
				bind:value
				clearable
				class="block h-full w-full resize-none border-0 bg-inherit text-sm focus:ring-0 focus:outline-none"
				onkeypress={handleKeyPress}
			>
				{#snippet footer()}
					<div class="flex items-center justify-end">
						<Button
							type="submit"
							disabled={isStreaming}
							class="border-0 bg-gray-900 text-white shadow-sm transition-all duration-200 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
						>
							Send
							{#if isStreaming}
								<Spinner class="ms-2" size="4" color="primary" />
							{/if}
						</Button>
					</div>
				{/snippet}
			</Textarea>
		</form>
	</div>
</div>
