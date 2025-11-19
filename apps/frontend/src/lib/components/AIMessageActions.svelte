<script lang="ts">
	import { Button, Tooltip, Clipboard } from 'flowbite-svelte';
	import { ArrowsRepeatOutline, CheckOutline, ClipboardCleanSolid } from 'flowbite-svelte-icons';
	import type { BaseMessage } from '$lib/langgraph/types';
	import * as m from '$lib/paraglide/messages.js';
	import FeedbackButtons from './FeedbackButtons.svelte';

	interface Props {
		message: BaseMessage;
		isHovered: boolean;
		onRegenerate?: (message: BaseMessage) => void;
		onFeedback?: (message: BaseMessage, type: 'up' | 'down') => void;
	}

	let { message, isHovered, onRegenerate, onFeedback }: Props = $props();
</script>

<div
	class="absolute bottom-2 left-0 flex items-center gap-1 transition-all duration-300 ease-in-out"
	style="opacity: {isHovered ? '1' : '0'}; transform: translateY({isHovered ? '0' : '-4px'});"
>
	<Clipboard value={message.text} embedded color="alternative" class="p-1.5!">
		{#snippet children(success)}
			<Tooltip isOpen={success}>{success ? m.message_copied() : m.message_copy()}</Tooltip>
			{#if success}<CheckOutline size="xs" />{:else}<ClipboardCleanSolid size="xs" />{/if}
		{/snippet}
	</Clipboard>

	<Button
		onclick={() => onRegenerate?.(message)}
		class="p-1.5!"
		color="alternative"
		size="xs"
		title={m.message_regenerate()}
	>
		<ArrowsRepeatOutline size="xs" />
	</Button>
	<Tooltip type="auto">{m.coming_soon()}</Tooltip>
	<FeedbackButtons {message} {onFeedback} />
</div>
