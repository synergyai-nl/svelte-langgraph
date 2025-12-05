<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import SubmitButton from './SubmitButton.svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		value: string;
		isStreaming?: boolean;
		onSubmit: () => void;
		placeholder?: string;
	}

	let {
		value = $bindable(''),
		isStreaming = false,
		onSubmit,
		placeholder = m.chat_input_placeholder()
	}: Props = $props();

	let isEmpty = $derived(!(value ?? '').trim());
	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && event.shiftKey === false) {
			event.preventDefault();
			onSubmit();
		}
	}
</script>

<div class="fixed right-0 bottom-0 left-0 bg-transparent">
	<div class="mx-auto w-full max-w-4xl px-4 py-4">
		<form
			id="input_form"
			onsubmit={onSubmit}
			class="rounded-xl border border-gray-200 bg-white px-4 py-2 shadow-md dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-800/20"
		>
			<div class="flex items-end gap-3">
				<div class="min-w-0 flex-1">
					<Textarea
						id="user-input"
						disabled={isStreaming}
						{placeholder}
						rows={1}
						name="message"
						bind:value
						class="flex max-h-[calc(8*1.5rem+1rem)] w-full resize-none items-center overflow-y-auto border-none bg-transparent px-0 py-2 text-base leading-6 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent dark:text-white dark:placeholder-gray-400"
						style="max-height: calc(8 * 1.5rem + 1rem); min-height: calc(2 * 1.5rem);"
						onkeydown={handleKeyPress}
					></Textarea>
				</div>

				<!-- Submit button -->
				<div class="flex shrink-0 items-end pb-2">
					<SubmitButton {isStreaming} disabled={isStreaming || isEmpty} />
				</div>
			</div>
		</form>
	</div>
</div>
