<script lang="ts" module>
	export interface FeedbackButtonsLabels {
		good: string;
		bad: string;
		comingSoon: string;
	}

	export const defaultFeedbackButtonsLabels: FeedbackButtonsLabels = {
		good: 'Good Response',
		bad: 'Bad Response',
		comingSoon: 'Coming soon'
	};
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ThumbsUp, ThumbsDown } from '@lucide/svelte';
	import type { Message } from '@svelte-langgraph/client';
	import { Tooltip, TooltipTrigger, TooltipContent } from '$lib/components/ui/tooltip/index.js';
	import { resolveLabels, type DeepPartial } from './labels';

	interface Props {
		message: Message;
		onFeedback?: (message: Message, type: 'up' | 'down') => void;
		labels?: DeepPartial<FeedbackButtonsLabels>;
	}

	let { message, onFeedback, labels }: Props = $props();

	const l = $derived(resolveLabels(defaultFeedbackButtonsLabels, undefined, labels));

	let feedbackGiven = $state<'up' | 'down' | null>(null);

	function handleFeedback(type: 'up' | 'down') {
		feedbackGiven = feedbackGiven === type ? null : type;
		onFeedback?.(message, type);
	}
</script>

<div class="border-border-card ml-2 flex gap-1 border-l pl-2">
	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => handleFeedback('up')}
				variant="ghost"
				size="icon-sm"
				class="h-6 w-6 p-1.5 {feedbackGiven === 'up' ? 'bg-muted' : ''}"
				title={l.good}
				disabled
			>
				<ThumbsUp size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>{l.comingSoon}</TooltipContent>
	</Tooltip>
	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => handleFeedback('down')}
				variant="ghost"
				size="icon-sm"
				class="h-6 w-6 p-1.5 {feedbackGiven === 'down' ? 'bg-muted' : ''}"
				title={l.bad}
				disabled
			>
				<ThumbsDown size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>{l.comingSoon}</TooltipContent>
	</Tooltip>
</div>
