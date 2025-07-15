<script lang="ts">
	import { Button, Textarea, Spinner } from 'flowbite-svelte';

	interface Props {
		value: string;
		isStreaming?: boolean;
		onSubmit: () => void;
		placeholder?: string;
	}

	let { value = $bindable(), isStreaming = false, onSubmit, placeholder = "Message..." }: Props = $props();

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && event.shiftKey === false) {
			event.preventDefault();
			onSubmit();
		}
	}
</script>

<div class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
	<div class="w-full max-w-4xl mx-auto px-4 py-4">
		<form id="input_form" onsubmit={onSubmit}>
			<Textarea
				id="user-input"
				disabled={isStreaming}
				{placeholder}
				rows={2}
				name="message"
				bind:value
				clearable
				class="focus:ring-1 focus:ring-gray-300 focus:border-gray-300 transition-all duration-200 border-gray-300 dark:border-gray-600"
				onkeypress={handleKeyPress}
			>
				{#snippet footer()}
					<div class="flex items-center justify-end">
						<Button 
							type="submit" 
							disabled={isStreaming}
							class="bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900 text-white border-0 shadow-sm transition-all duration-200"
						>
							Send
							{#if isStreaming}
								<Spinner class="ms-2" size="4" color="white" />
							{/if}
						</Button>
					</div>
				{/snippet}
			</Textarea>
		</form>
	</div>
</div>