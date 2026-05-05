<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';

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
		aria-label={m.message_edit()}
		class="bg-foreground dark:bg-foreground text-background min-h-0 resize-none rounded-xl border-0 px-6 py-6 text-sm shadow-sm ring-2 ring-blue-500 focus-visible:ring-blue-500"
	/>
	<div class="flex justify-end gap-1.5">
		<Button variant="ghost" size="sm" onclick={onCancel}>{m.cancel()}</Button>
		<Button variant="secondary" size="sm" onclick={onConfirm}>{m.save_and_send()}</Button>
	</div>
</div>
