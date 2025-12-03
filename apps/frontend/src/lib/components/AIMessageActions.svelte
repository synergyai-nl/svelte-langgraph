<script lang="ts">
	import { Tooltip, Clipboard } from 'flowbite-svelte';
	import { Button } from '$lib/components/ui/button';
	import { ArrowsRepeatOutline, CheckOutline, ClipboardCleanSolid } from 'flowbite-svelte-icons';
	import type { BaseMessage } from '$lib/langgraph/types';
	import * as m from '$lib/paraglide/messages.js';
	import { Tooltip, TooltipTrigger, TooltipContent } from '$lib/components/ui/tooltip/index.js';
	import FeedbackButtons from './FeedbackButtons.svelte';

	interface Props {
		message: BaseMessage;
		isHovered: boolean;
		onRegenerate?: (message: BaseMessage) => void;
		onFeedback?: (message: BaseMessage, type: 'up' | 'down') => void;
	}

	let { message, isHovered, onRegenerate, onFeedback }: Props = $props();
	let copyOpen = $state(false);
</script>

<div
	class="absolute bottom-2 left-0 flex items-center gap-1 transition-all duration-300 ease-in-out"
	style="opacity: {isHovered ? '1' : '0'}; transform: translateY({isHovered ? '0' : '-4px'});"
>
	<Tooltip open={copyOpen}>
		<TooltipTrigger asChild let:builder>
			<Clipboard
				value={message.text}
				embedded
				color="alternative"
				class="p-1.5!"
				builders={[builder]}
				onchange={(success) => (copyOpen = success)}
			>
				{#snippet children(success)}
					{#if success}<CheckOutline size="xs" />{:else}<ClipboardCleanSolid size="xs" />{/if}
				{/snippet}
			</Clipboard>
		</TooltipTrigger>
		<TooltipContent>
			{copyOpen ? m.message_copied() : m.message_copy()}
		</TooltipContent>
	</Tooltip>

	<Tooltip>
		<TooltipTrigger asChild let:builder>
			<Button
				onclick={() => onRegenerate?.(message)}
				class="p-1.5!"
				variant="ghost"
				size="sm"
				title={m.message_regenerate()}
			>
				<ArrowsRepeatOutline />
			</Button>
		</TooltipTrigger>
		<TooltipContent>
			{m.coming_soon()}
		</TooltipContent>
	</Tooltip>

	<FeedbackButtons {message} {onFeedback} />
</div>
