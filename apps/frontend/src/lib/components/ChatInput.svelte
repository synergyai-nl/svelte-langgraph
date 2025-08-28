<script lang="ts">
	import { Button, Spinner } from 'flowbite-svelte';
	import { PaperPlaneSolid } from 'flowbite-svelte-icons';
	import { scale } from 'svelte/transition';

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
		const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
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

		// Set max height (8 lines max)
		const maxHeight = Math.min(scrollHeight, lineHeight * 8 + totalPadding);
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

	$effect(() => {
		if (textareaEl && value !== undefined) {
			// Use setTimeout to ensure DOM is updated
			setTimeout(autoResize, 0);
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
							style="height: {textareaHeight}; min-height: 24px;"
							onkeydown={handleKeyPress}
							oninput={autoResize}
						></textarea>
					</div>

					<!-- Submit button - inline when collapsed -->
					{#if !isExpanded}
						<div class="flex shrink-0" transition:scale={{ duration: 400 }}>
							<Button
								type="submit"
								disabled={isStreaming || !value.trim()}
								size="sm"
								class="bg-primary-600 hover:bg-primary-700 flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 text-white shadow-sm disabled:cursor-not-allowed disabled:bg-gray-300"
							>
								{#if isStreaming}
									<Spinner />
								{:else}
									<PaperPlaneSolid class="h-3 w-3 rotate-45" />
								{/if}
							</Button>
						</div>
					{/if}
				</div>

				<!-- Expanded button row -->
				{#if isExpanded}
					<div class="flex items-center justify-end gap-2">
						<!-- Submit button - on new line when expanded -->
						<div class="flex shrink-0" transition:scale={{ duration: 400 }}>
							<Button
								type="submit"
								disabled={isStreaming || !value.trim()}
								size="sm"
								class="bg-primary-600 hover:bg-primary-700 flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-0 text-white shadow-sm disabled:cursor-not-allowed disabled:bg-gray-300"
							>
								{#if isStreaming}
									<Spinner />
								{:else}
									<PaperPlaneSolid class="h-3 w-3 rotate-45" />
								{/if}
							</Button>
						</div>
					</div>
				{/if}
			</div>
		</form>
	</div>
</div>
