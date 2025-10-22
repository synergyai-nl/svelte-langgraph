<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { ThumbsUpOutline, ThumbsDownOutline } from 'flowbite-svelte-icons';
	import type { BaseMessage } from '$lib/langgraph/types';
	import * as m from '$lib/paraglide/messages.js';

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
		disabled
	>
		<ThumbsUpOutline size="xs" />
	</Button>
	<Button
		onclick={() => handleFeedback('down')}
		class="p-1.5! {feedbackGiven === 'down' ? 'bg-gray-200 dark:bg-gray-700' : ''}"
		color="alternative"
		size="xs"
		title={m.message_feedback_bad()}
		disabled
	>
		<ThumbsDownOutline size="xs" />
	</Button>
</div>
