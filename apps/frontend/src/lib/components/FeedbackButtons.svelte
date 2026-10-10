<script lang="ts" module>
	export type FeedbackStatus = 'pending' | 'sent' | 'failed' | null;
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ThumbsUp, ThumbsDown, Asterisk } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { Tooltip, TooltipTrigger, TooltipContent } from '$lib/components/ui/tooltip/index.js';
	import FeedbackDialog from './FeedbackDialog.svelte';

	interface Props {
		/** Sends the rating with its optional comment; rejects if it didn't land. */
		onSubmit?: (type: 'up' | 'down', comment?: string) => Promise<void>;
		/** False for an answer the backend can't tie to a trace. */
		available?: boolean;
		/** Bindable, so the action row can stay visible while pending or failed. */
		status?: FeedbackStatus;
	}

	let { onSubmit, available = true, status = $bindable(null) }: Props = $props();

	// Local by design: nothing is read back, so a remount starts fresh. The
	// backend's per-user, per-message score id makes rating again an update.
	let rating = $state<'up' | 'down' | null>(null);
	let draft = $state<'up' | 'down' | null>(null);

	// Sent is final until remount: the click is acknowledged, not editable.
	let disabled = $derived(!available || !onSubmit || status === 'pending' || status === 'sent');

	let label = $derived(
		!available
			? m.message_feedback_unavailable()
			: status === 'sent'
				? m.message_feedback_sent()
				: status === 'failed'
					? m.message_feedback_failed()
					: null
	);

	function choose(type: 'up' | 'down') {
		if (disabled || draft) return;
		rating = type;
		draft = type;
	}

	async function resolve(comment?: string) {
		const type = draft;
		draft = null;
		if (!type || !onSubmit) return;

		status = 'pending';
		try {
			await onSubmit(type, comment);
			status = 'sent';
		} catch (err) {
			rating = null;
			status = 'failed';
			console.error('Failed to submit feedback', err);
		}
	}
</script>

<div class="border-border-card ml-2 flex items-center gap-1 border-l pl-2">
	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => choose('up')}
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
				onclick={() => choose('down')}
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
		<!-- Same slot as the failure marker, so the row doesn't reflow. -->
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

<FeedbackDialog rating={draft} onResolve={resolve} />
