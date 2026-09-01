<script lang="ts" module>
	export interface UserMessageEditLabels {
		edit: string;
		cancel: string;
		saveAndSend: string;
	}

	export const defaultUserMessageEditLabels: UserMessageEditLabels = {
		edit: 'Edit',
		cancel: 'Cancel',
		saveAndSend: 'Save & Send'
	};
</script>

<script lang="ts">
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import { resolveLabels, type DeepPartial } from './labels';

	interface Props {
		value: string;
		onConfirm: () => void;
		onCancel: () => void;
		labels?: DeepPartial<UserMessageEditLabels>;
	}

	let { value = $bindable(), onConfirm, onCancel, labels }: Props = $props();

	const l = $derived(resolveLabels(defaultUserMessageEditLabels, undefined, labels));

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
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
		aria-label={l.edit}
		class="bg-foreground dark:bg-foreground text-background min-h-0 resize-none rounded-xl border-0 px-6 py-6 text-sm shadow-sm ring-2 ring-blue-500 focus-visible:ring-blue-500"
	/>
	<div class="flex justify-end gap-1.5">
		<Button variant="ghost" size="sm" onclick={onCancel}>{l.cancel}</Button>
		<Button variant="secondary" size="sm" onclick={onConfirm}>{l.saveAndSend}</Button>
	</div>
</div>
