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

<div class="fixed right-0 bottom-0 left-0 bg-transparent">
	<div class="mx-auto w-full max-w-4xl px-4 py-4">
		<form
			id="input_form"
			onsubmit={onSubmit}
			class="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 shadow-md dark:bg-gray-800"
		>
			<div class="min-w-0 flex-1">
				<Textarea
					id="user-input"
					disabled={isStreaming}
					{placeholder}
					rows={1}
					name="message"
					bind:value
					clearable
					classes={{ div: 'w-full' }}
					class="resize-none border-none bg-gray-50 text-sm leading-6 text-gray-900 focus:ring-0 focus:outline-none dark:bg-gray-800 dark:text-white"
					onkeypress={handleKeyPress}
				/>
			</div>

			<Button
				type="submit"
				disabled={isStreaming}
				size="sm"
				class="shrink-0 rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-gray-800 disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
			>
				{#if isStreaming}
					<Spinner class="ms-2" size="4" color="primary" />
				{:else}
					Send
				{/if}
			</Button>
		</form>
	</div>
</div>
