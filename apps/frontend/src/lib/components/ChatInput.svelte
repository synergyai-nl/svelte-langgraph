<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import SubmitButton from './SubmitButton.svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		value: string;
		isStreaming?: boolean;
		onSubmit: () => void;
		onStop?: () => void;
		placeholder?: string;
	}

	let {
		value = $bindable(''),
		isStreaming = false,
		onSubmit,
		onStop,
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
			class="border-border-input bg-card rounded-xl border px-4 py-2 shadow-md"
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
						class="text-foreground placeholder-muted-foreground flex max-h-[calc(8*1.5rem+1rem)] !min-h-[2.5rem] w-full resize-none items-center overflow-y-auto border-none bg-transparent px-0 py-2 text-base leading-6 !shadow-none focus:ring-0 focus:outline-none focus-visible:border-transparent focus-visible:ring-0"
						style="max-height: calc(8 * 1.5rem + 1rem); background-color: transparent;"
						onkeydown={handleKeyPress}
					></Textarea>
				</div>

				<!-- Submit button -->
				<div class="flex shrink-0 items-end pb-1">
					<SubmitButton {isStreaming} disabled={isStreaming || isEmpty} {onStop} />
				</div>
			</div>
		</form>
	</div>
</div>
