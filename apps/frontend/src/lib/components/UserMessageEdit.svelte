<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		value: string;
		rows: number;
		textareaRef?: HTMLTextAreaElement;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		value = $bindable(),
		rows,
		textareaRef = $bindable(),
		onConfirm,
		onCancel
	}: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			onConfirm();
		}
		if (e.key === 'Escape') {
			onCancel();
		}
	}
</script>

<div class="flex w-full flex-col gap-1.5">
	<textarea
		bind:this={textareaRef}
		bind:value
		onkeydown={handleKeydown}
		{rows}
		class="bg-foreground text-background focus:ring-ring w-full resize-none rounded-xl px-6 py-6 text-sm shadow-sm focus:ring-2 focus:outline-none"
	></textarea>
	<div class="flex justify-end gap-1.5">
		<button
			type="button"
			onclick={onCancel}
			class="text-muted-foreground hover:bg-muted rounded px-2.5 py-1 text-xs transition-colors"
		>
			{m.cancel()}
		</button>
		<button
			type="button"
			onclick={onConfirm}
			class="bg-foreground text-background rounded px-2.5 py-1 text-xs font-medium transition-colors"
		>
			{m.save_and_send()}
		</button>
	</div>
</div>
