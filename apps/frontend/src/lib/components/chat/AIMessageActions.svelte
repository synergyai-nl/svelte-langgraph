<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Check, Copy, RefreshCw, X } from '@lucide/svelte';
	import { scale } from 'svelte/transition';
	import { UseClipboard } from '$lib/hooks/use-clipboard.svelte';
	import type { FeedbackScore, Message } from '@svelte-langgraph/client';
	import * as m from '$lib/paraglide/messages.js';
	import { Tooltip, TooltipTrigger, TooltipContent } from '$lib/components/ui/tooltip/index.js';
	import FeedbackButtons, { type FeedbackStatus } from './FeedbackButtons.svelte';

	interface Props {
		message: Message;
		isHovered: boolean;
		onRegenerate?: (message: Message) => void;
		onFeedback?: (type: FeedbackScore, comment?: string) => Promise<void>;
		feedbackAvailable?: boolean;
	}

	let { message, isHovered, onRegenerate, onFeedback, feedbackAvailable = true }: Props = $props();
	let feedbackStatus = $state<FeedbackStatus>(null);
	let copySuccess = $state(false);
	let copyTimeoutId: ReturnType<typeof setTimeout> | null = null;
	const clipboard = new UseClipboard();

	async function handleCopy() {
		copySuccess = (await clipboard.copy(message.text)) === 'success';

		if (copySuccess) {
			if (copyTimeoutId) clearTimeout(copyTimeoutId);
			copyTimeoutId = setTimeout(() => {
				copySuccess = false;
			}, 1500);
		}
	}

	// A pending/failed rating must stay legible after the pointer leaves — see
	// the focus-within/touch classes below for the other two visibility gaps
	// (keyboard navigation, devices with no hover at all).
	let visible = $derived(isHovered || feedbackStatus === 'pending' || feedbackStatus === 'failed');
</script>

<div
	data-testid="message-actions"
	class="absolute left-0 flex items-center gap-1 transition-all duration-300 ease-in-out focus-within:translate-y-0! focus-within:opacity-100! [@media(hover:none)]:translate-y-0! [@media(hover:none)]:opacity-100!"
	style="opacity: {visible ? '1' : '0'}; transform: translateY({visible ? '0' : '-4px'});"
>
	<Tooltip disableCloseOnTriggerClick>
		<TooltipTrigger>
			<Button
				type="button"
				name="copy"
				tabindex={-1}
				variant="ghost"
				size="icon-sm"
				class="flex h-6 w-6 items-center gap-2"
				onclick={handleCopy}
			>
				{#key clipboard.status}
					<div in:scale={{ duration: 500, start: 0.85 }}>
						{#if clipboard.status === 'success'}
							<Check />
							<span class="sr-only">{m.slg_message_copied()}</span>
						{:else if clipboard.status === 'failure'}
							<X />
							<span class="sr-only">{m.slg_message_copy_failed()}</span>
						{:else}
							<Copy />
							<span class="sr-only">{m.slg_message_copy()}</span>
						{/if}
					</div>
				{/key}
			</Button>
		</TooltipTrigger>
		<TooltipContent>
			{copySuccess ? m.slg_message_copied() : m.slg_message_copy()}
		</TooltipContent>
	</Tooltip>

	{#if onRegenerate}
		<Tooltip>
			<TooltipTrigger>
				<Button
					onclick={() => onRegenerate(message)}
					class="h-6 w-6"
					variant="ghost"
					size="icon-sm"
					title={m.slg_message_regenerate()}
				>
					<RefreshCw size={16} />
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				{m.slg_message_regenerate()}
			</TooltipContent>
		</Tooltip>
	{/if}

	<FeedbackButtons
		onSubmit={onFeedback}
		available={feedbackAvailable}
		bind:status={feedbackStatus}
	/>
</div>
