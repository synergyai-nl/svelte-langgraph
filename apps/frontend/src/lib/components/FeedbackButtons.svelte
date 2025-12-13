<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ThumbsUp, ThumbsDown } from '@lucide/svelte';
	import type { BaseMessage } from '$lib/langgraph/types';
	import * as m from '$lib/paraglide/messages.js';
	import { Tooltip, TooltipTrigger, TooltipContent } from '$lib/components/ui/tooltip/index.js';

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
	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => handleFeedback('up')}
				variant="ghost"
				size="icon-sm"
				class="h-6 w-6 p-1.5 {feedbackGiven === 'up' ? 'bg-gray-200 dark:bg-gray-700' : ''}"
				title={m.message_feedback_good()}
			>
				<ThumbsUp size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>{m.coming_soon()}</TooltipContent>
	</Tooltip>
	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => handleFeedback('down')}
				variant="ghost"
				size="icon-sm"
				class="h-6 w-6 p-1.5 {feedbackGiven === 'down' ? 'bg-gray-200 dark:bg-gray-700' : ''}"
				title={m.message_feedback_bad()}
			>
				<ThumbsDown size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>{m.coming_soon()}</TooltipContent>
	</Tooltip>
</div>
