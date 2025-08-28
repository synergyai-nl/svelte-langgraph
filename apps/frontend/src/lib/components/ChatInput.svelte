<script lang="ts">
	import { scale } from 'svelte/transition';
	import SubmitButton from './SubmitButton.svelte';

	// Constants
	const MAX_LINES = 8;
	const MIN_HEIGHT = 24;
	const TRANSITION_DURATION = 400;
	const DEFAULT_LINE_HEIGHT = 24;

	interface Props {
		value: string;
		isStreaming?: boolean;
		onSubmit: () => void;
		placeholder?: string;
	}

	let {
		value = $bindable(),
		isStreaming = false,
		onSubmit = () => {},
		placeholder = 'Message...'
	}: Props = $props();

	let textareaEl: HTMLTextAreaElement | null = null;
	let isExpanded = $state(false);
	let textareaHeight = $state('auto');
	let resizeFrame: number;

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && event.shiftKey === false) {
			event.preventDefault();
			if (value.trim()) {
				onSubmit();
			}
		}
	}

	function autoResize() {
		if (!textareaEl) return;

		// Reset height to get accurate scrollHeight
		textareaEl.style.height = 'auto';
		const scrollHeight = textareaEl.scrollHeight;

		// Calculate line height and determine if we should expand
		const computedStyle = getComputedStyle(textareaEl);
		const lineHeight = parseFloat(computedStyle.lineHeight) || DEFAULT_LINE_HEIGHT;
		const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
		const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
		const totalPadding = paddingTop + paddingBottom;

		// Calculate number of lines (approximately)
		const lines = Math.floor((scrollHeight - totalPadding) / lineHeight);

		// Sticky expanded logic:
		// - Expand when more than 2 lines
		// - Only collapse when empty or single line (not just when <= 2 lines)
		if (lines > 2) {
			isExpanded = true;
		} else if (value.trim() === '' || lines <= 1) {
			isExpanded = false;
		}
		// If lines === 2 and already expanded, stay expanded (sticky behavior)

		// Set max height
		const maxHeight = Math.min(scrollHeight, lineHeight * MAX_LINES + totalPadding);
		textareaHeight = maxHeight + 'px';
		textareaEl.style.height = textareaHeight;
	}

	$effect(() => {
		if (value === '' && textareaEl) {
			textareaEl.style.height = 'auto';
			textareaHeight = 'auto';
			isExpanded = false;
		}
	});

	function scheduleResize() {
		if (resizeFrame) cancelAnimationFrame(resizeFrame);
		resizeFrame = requestAnimationFrame(autoResize);
	}

	$effect(() => {
		if (textareaEl) {
			scheduleResize();
		}
	});

	function handleSubmit(event: Event) {
		event.preventDefault();
		if (value.trim()) {
			onSubmit();
		}
	}
</script>

<div class="fixed right-0 bottom-0 left-0 bg-transparent">
	<div class="mx-auto w-full max-w-4xl px-4 py-4">
		<form
			onsubmit={handleSubmit}
			class="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-md dark:border-gray-700 dark:bg-gray-900 dark:shadow-gray-800/20"
		>
			<div class="flex flex-col gap-2">
				<!-- Textarea container -->
				<div class="flex items-center gap-2" class:items-end={isExpanded}>
					<div class="min-w-0 flex-1">
						<textarea
							bind:this={textareaEl}
							bind:value
							disabled={isStreaming}
							{placeholder}
							rows={1}
							name="message"
							class="w-full resize-none border-none bg-transparent text-sm leading-6 text-gray-900 placeholder-gray-500 focus:ring-0 focus:outline-none dark:text-white dark:placeholder-gray-400"
							style="height: {textareaHeight}; min-height: {MIN_HEIGHT}px;"
							onkeydown={handleKeyPress}
							oninput={scheduleResize}
						></textarea>
					</div>

					<!-- Submit button - inline when collapsed -->
					{#if !isExpanded}
						<div class="flex shrink-0" transition:scale={{ duration: TRANSITION_DURATION }}>
							<SubmitButton {isStreaming} disabled={isStreaming || !value.trim()} />
						</div>
					{/if}
				</div>

				<!-- Expanded button row -->
				{#if isExpanded}
					<div class="flex items-center justify-end gap-2">
						<!-- Submit button - on new line when expanded -->
						<div class="flex shrink-0" transition:scale={{ duration: TRANSITION_DURATION }}>
							<SubmitButton {isStreaming} disabled={isStreaming || !value.trim()} />
						</div>
					</div>
				{/if}
			</div>
		</form>
	</div>
</div>
