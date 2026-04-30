<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Textarea } from '$lib/components/ui/textarea';

	interface Props {
		value: string;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { value = $bindable(), onConfirm, onCancel }: Props = $props();

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
	<Textarea
		bind:value
		onkeydown={handleKeydown}
		autofocus
		class="bg-foreground dark:bg-foreground text-background ring-2 ring-blue-500 focus-visible:ring-blue-500 min-h-0 resize-none rounded-xl border-0 px-6 py-6 text-sm shadow-sm"
	/>
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