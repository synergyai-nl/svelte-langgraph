<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ThumbsUp, ThumbsDown, Asterisk } from '@lucide/svelte';
	import type { Message } from '$lib/langgraph/types';
	import * as m from '$lib/paraglide/messages.js';
	import { Tooltip, TooltipTrigger, TooltipContent } from '$lib/components/ui/tooltip/index.js';

	interface Props {
		message: Message;
		onFeedback?: (message: Message, type: 'up' | 'down') => void;
		/** The rating already recorded for this message, or null if unrated. */
		rating?: 'up' | 'down' | null;
		/** 'pending' while the score is in flight, 'failed' if the last try didn't land. */
		status?: 'pending' | 'failed' | null;
		/** False until the stored ratings are known — see Chat.svelte. */
		ready?: boolean;
		/** The stored ratings couldn't be loaded at all, so rating stays off. */
		unavailable?: boolean;
	}

	let {
		message,
		onFeedback,
		rating = null,
		status = null,
		ready = true,
		unavailable = false
	}: Props = $props();

	// Controlled by the parent rather than held locally: the highlight has to
	// survive a remount and a reload, and it should reflect what was actually
	// stored, not merely what was clicked.
	let disabled = $derived(!ready || status === 'pending');

	// A failure is worth saying out loud, but not worth shouting about later —
	// the label replaces the tooltip only until the next attempt.
	let label = $derived(
		unavailable
			? m.message_feedback_unavailable()
			: !ready
				? m.message_feedback_loading()
				: status === 'failed'
					? m.message_feedback_failed()
					: null
	);

	function handleFeedback(type: 'up' | 'down') {
		if (disabled || rating === type) return;
		onFeedback?.(message, type);
	}
</script>

<div class="border-border-card ml-2 flex items-center gap-1 border-l pl-2">
	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => handleFeedback('up')}
				{disabled}
				variant="ghost"
				size="icon-sm"
				class="h-6 w-6 p-1.5 {rating === 'up' ? 'bg-muted' : ''}"
				title={m.message_feedback_good()}
			>
				<ThumbsUp size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>{label ?? m.message_feedback_good()}</TooltipContent>
	</Tooltip>
	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => handleFeedback('down')}
				{disabled}
				variant="ghost"
				size="icon-sm"
				class="h-6 w-6 p-1.5 {rating === 'down' ? 'bg-muted' : ''}"
				title={m.message_feedback_bad()}
			>
				<ThumbsDown size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>{label ?? m.message_feedback_bad()}</TooltipContent>
	</Tooltip>

	{#if status === 'pending'}
		<!-- Marks the in-flight window without moving anything: the asterisk sits in
		     the same slot the failure marker uses, so the row doesn't reflow. -->
		<Asterisk
			size={14}
			class="text-muted-foreground animate-pulse"
			data-testid="feedback-pending"
			aria-hidden="true"
		/>
	{:else if status === 'failed'}
		<Tooltip>
			<TooltipTrigger>
				<Asterisk
					size={14}
					class="text-destructive"
					data-testid="feedback-failed"
					aria-label={m.message_feedback_failed()}
				/>
			</TooltipTrigger>
			<TooltipContent>{m.message_feedback_failed()}</TooltipContent>
		</Tooltip>
	{/if}
</div>
