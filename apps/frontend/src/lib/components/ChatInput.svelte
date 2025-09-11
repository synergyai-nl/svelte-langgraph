<script lang="ts">
	import { Textarea } from 'flowbite-svelte';
	import SubmitButton from './SubmitButton.svelte';

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
		placeholder = 'Message...'
	}: Props = $props();

	let isEmpty = $derived(!String(value ?? '').trim());
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
			class="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-md dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-800/20"
		>
			<div class="flex gap-2">
				<div class="min-w-0 flex-1">
					<Textarea
						id="user-input"
						disabled={isStreaming}
						{placeholder}
						rows={2}
						name="message"
						bind:value
						clearable
						class="flex w-full resize-none items-center border-none bg-transparent text-base leading-6 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none dark:text-white dark:placeholder-gray-400"
						onkeydown={handleKeyPress}
					></Textarea>
				</div>

				<!-- Submit button -->
				<div class="flex shrink-0 items-start pt-1">
					<SubmitButton {isStreaming} disabled={isStreaming || isEmpty} />
				</div>
			</div>
		</form>
	</div>
</div>
