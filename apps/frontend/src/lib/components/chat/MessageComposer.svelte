<!--
	@component
	MessageComposer — the message input area: a textarea plus send/stop controls. Also known as the chat
	input, message box, or prompt input. Enter submits, Shift+Enter inserts a newline.
-->

<script lang="ts">
	import { Textarea } from '#lib/components/ui/textarea/index.ts';
	import SubmitButton from './SubmitButton.svelte';
	import * as m from '#lib/paraglide/messages.js';

	interface Props {
		value: string;
		/** A run is going: Stop replaces Send, and Enter sends nothing. The input stays editable. */
		isStreaming?: boolean;
		/** Turns the composer off (e.g. while the thread history loads): no input, no Send. */
		disabled?: boolean;
		onSubmit: () => void;
		onStop?: () => void;
		placeholder?: string;
	}

	let {
		value = $bindable(''),
		isStreaming = false,
		disabled = false,
		onSubmit,
		onStop,
		placeholder = m.slg_chat_input_placeholder()
	}: Props = $props();

	let textarea = $state<HTMLTextAreaElement | null>(null);
	let isEmpty = $derived(!(value ?? '').trim());
	let cannotSend = $derived(isEmpty || isStreaming || disabled);
	function handleSubmit(event: SubmitEvent) {
		// Prevent the native GET form submission (would navigate to ?message=<text>).
		event.preventDefault();
		// The one guard against blank input: `ConversationApi.submit` sends any text it is given.
		if (cannotSend) return;
		onSubmit();
		// Send was pressed: Stop replaces it, which would drop focus. Keep it in the input.
		textarea?.focus();
	}

	// Send replaces Stop, which would drop focus the same way.
	function handleStop() {
		onStop?.();
		textarea?.focus();
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && event.shiftKey === false && !event.isComposing) {
			event.preventDefault();
			if (!cannotSend) onSubmit();
		}
	}
</script>

<div class="shrink-0 bg-transparent">
	<div class="mx-auto w-full max-w-4xl px-4 py-4">
		<form
			id="input_form"
			onsubmit={handleSubmit}
			class="border-border-input bg-card rounded-xl border px-4 py-2 shadow-md"
		>
			<div class="flex items-end gap-3">
				<div class="min-w-0 flex-1">
					<!-- Not disabled during a run: a disabled input loses focus, and nothing gives it back. -->
					<Textarea
						bind:ref={textarea}
						id="user-input"
						{disabled}
						{placeholder}
						aria-label={placeholder}
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
					<SubmitButton
						{isStreaming}
						disabled={cannotSend}
						onStop={handleStop}
						sendLabel={m.slg_chat_input_send()}
						stopLabel={m.slg_chat_input_stop()}
					/>
				</div>
			</div>
		</form>
	</div>
</div>
