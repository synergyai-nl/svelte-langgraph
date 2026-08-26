<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ThumbsUp, ThumbsDown } from '@lucide/svelte';
	import type { Message } from '$lib/langgraph/types';
	import * as m from '$lib/paraglide/messages.js';
	import { Tooltip, TooltipTrigger, TooltipContent } from '$lib/components/ui/tooltip/index.js';

	interface Props {
		message: Message;
		onFeedback?: (message: Message, type: 'up' | 'down') => void;
		/** The rating already recorded for this message, or null if unrated. */
		rating?: 'up' | 'down' | null;
	}

	let { message, onFeedback, rating = null }: Props = $props();

	// Controlled by the parent rather than held locally: the highlight has to
	// survive a remount and a reload, and it should reflect what was actually
	// stored, not merely what was clicked.
	function handleFeedback(type: 'up' | 'down') {
		if (rating === type) return;
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
				class="h-6 w-6 p-1.5 {rating === 'up' ? 'bg-muted' : ''}"
				title={m.message_feedback_good()}
			>
				<ThumbsUp size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>{m.message_feedback_good()}</TooltipContent>
	</Tooltip>
	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => handleFeedback('down')}
				variant="ghost"
				size="icon-sm"
				class="h-6 w-6 p-1.5 {rating === 'down' ? 'bg-muted' : ''}"
				title={m.message_feedback_bad()}
			>
				<ThumbsDown size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>{m.message_feedback_bad()}</TooltipContent>
	</Tooltip>
</div>
