<script lang="ts">
	import { Button, Tooltip } from 'flowbite-svelte';
	import { ClipboardOutline, ArrowsRepeatOutline } from 'flowbite-svelte-icons';
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

	function handleCopy() {
		navigator.clipboard.writeText(message.text);
	}
</script>

<div
	class="absolute bottom-2 left-0 flex items-center gap-2 transition-all duration-300 ease-in-out"
	style="opacity: {isHovered ? '1' : '0'}; transform: translateY({isHovered ? '0' : '-4px'});"
>
	<Button
		onclick={handleCopy}
		class="p-1.5!"
		color="alternative"
		size="xs"
		title={m.message_copy()}
		disabled
	>
		<ClipboardOutline size="xs" />
	</Button>
	<Button
		onclick={() => onRegenerate?.(message)}
		class="p-1.5!"
		color="alternative"
		size="xs"
		title={m.message_regenerate()}
		disabled
	>
		<ArrowsRepeatOutline size="xs" />
	</Button>
	<Tooltip type="auto">Coming Soon !</Tooltip>
	<FeedbackButtons {message} {onFeedback} />
	<Tooltip type="auto">Coming Soon !</Tooltip>
</div>
