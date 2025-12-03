<script lang="ts">
	import { Button, Tooltip } from 'flowbite-svelte';

	import type { BaseMessage } from '$lib/langgraph/types';
	import * as m from '$lib/paraglide/messages.js';
    import {ThumbsDown, ThumbsUp} from "lucide-svelte";

	interface Props {
		message: BaseMessage;
		onFeedback?: (message: BaseMessage, type: 'up' | 'down') => void;
	}

	let { message, onFeedback }: Props = $props();

	let feedbackGiven = $state<'up' | 'down' | null>(null);

	function handleFeedback(type: 'up' | 'down') {
		feedbackGiven = feedbackGiven === type ? null : type;
		onFeedback?.(message, type);
	}
</script>

<div class="ml-2 flex gap-1 border-l border-gray-300 pl-2 dark:border-gray-600">
	<Button
		onclick={() => handleFeedback('up')}
		class="p-1.5! {feedbackGiven === 'up' ? 'bg-gray-200 dark:bg-gray-700' : ''}"
		color="alternative"
		size="xs"
		title={m.message_feedback_good()}
	>
		<ThumbsUp class="w-3 h-3" />
	</Button>
	<Tooltip type="auto">Coming Soon !</Tooltip>
	<Button
		onclick={() => handleFeedback('down')}
		class="p-1.5! {feedbackGiven === 'down' ? 'bg-gray-200 dark:bg-gray-700' : ''}"
		color="alternative"
		size="xs"
		title={m.message_feedback_bad()}
	>
		<ThumbsDown class="w-3 h-3" />
	</Button>
	<Tooltip type="auto">Coming Soon !</Tooltip>
</div>
