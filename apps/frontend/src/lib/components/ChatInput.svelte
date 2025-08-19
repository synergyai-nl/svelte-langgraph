<script lang="ts">
	import { Button, Textarea, Spinner } from 'flowbite-svelte';
	import { onMount } from 'svelte';
	import { PaperPlaneSolid } from 'flowbite-svelte-icons';

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

	let textareaEl: HTMLTextAreaElement | null = null;
	let isExpanded = $state(false);

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && event.shiftKey === false) {
			event.preventDefault();
			onSubmit();
			value = '';
		}
	}

	function autoResize() {
		if (!textareaEl) return;

		const lineHeight = parseFloat(getComputedStyle(textareaEl).lineHeight) || 24;
		const maxRows = window.innerWidth < 640 ? 4 : 8; // 4 rows on mobile, 8 on desktop
		const maxHeight = lineHeight * maxRows;

		// Set to a known single-line height first to get clean measurement
		textareaEl.style.height = lineHeight + 'px';
		const baseScrollHeight = textareaEl.scrollHeight;
		
		// Now reset to auto to get actual content height
		textareaEl.style.height = 'auto';
		const fullScrollHeight = textareaEl.scrollHeight;
		const newHeight = Math.min(fullScrollHeight, maxHeight);
		textareaEl.style.height = newHeight + 'px';

		// Use a more robust detection: compare actual content scroll height to base single-line height
		// Only change state if there's a clear difference (more than 4px buffer)
		const heightDifference = fullScrollHeight - baseScrollHeight;
		
		if (!isExpanded && heightDifference > 4) {
			isExpanded = true;
		} else if (isExpanded && heightDifference <= 2) {
			isExpanded = false;
		}
	}

	onMount(() => {
		textareaEl = document.getElementById('user-input') as HTMLTextAreaElement;
		if (textareaEl) {
			textareaEl.addEventListener('input', autoResize);
			return () => textareaEl?.removeEventListener('input', autoResize);
		}
	});

	$effect(() => {
		if (value === '' && textareaEl) {
			textareaEl.style.height = '';
			isExpanded = false;
		}
	});
</script>

<div class="fixed right-0 bottom-0 left-0 bg-transparent">
	<div class="mx-auto w-full max-w-4xl px-4 py-4">
		<form
			id="input_form"
			onsubmit={onSubmit}
			class="rounded-xl bg-gray-50 px-3 py-2 shadow-md dark:bg-gray-800 transition-all duration-200"
		>
			<div class="flex gap-2" class:flex-col={isExpanded} class:items-center={!isExpanded} class:items-stretch={isExpanded}>
				<div class="min-w-0 flex-1 w-full">
					<Textarea
						id="user-input"
						disabled={isStreaming}
						{placeholder}
						rows={1}
						name="message"
						bind:value
						classes={{ div: 'w-full' }}
						class="w-full resize-none border-none bg-gray-50 text-sm leading-6 text-gray-900 focus:ring-0 focus:outline-none dark:bg-gray-800 dark:text-white"
						onkeypress={handleKeyPress}
					/>
				</div>

				<div 
					class="transition-all duration-200 ease-out flex shrink-0"
					class:justify-end={isExpanded}
					class:justify-center={!isExpanded}
				>
					<Button
						type="submit"
						disabled={isStreaming}
						size="sm"
						class="bg-primary-600 hover:bg-primary-700 flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full p-3 text-white shadow-md transition-all duration-200"
					>
						{#if isStreaming}
							<Spinner size="4" color="primary" />
						{:else}
							<PaperPlaneSolid class="rotate-45" />
						{/if}
					</Button>
				</div>
			</div>
		</form>
	</div>
</div>
