<script lang="ts">
	import { Clipboard } from 'flowbite-svelte';
	import { Button } from '$lib/components/ui/button';
	import { RefreshCw, Check, Clipboard as ClipboardIcon } from '@lucide/svelte';
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
	let copySuccess = $state(false);
</script>

<div
	class="absolute bottom-2 left-0 flex items-center gap-1 transition-all duration-300 ease-in-out"
	style="opacity: {isHovered ? '1' : '0'}; transform: translateY({isHovered ? '0' : '-4px'});"
>
	<Tooltip disableCloseOnTriggerClick>
		<TooltipTrigger>
			<Clipboard
				value={message.text}
				bind:success={copySuccess}
				class="!border-0 !bg-transparent !p-1.5 !text-foreground !shadow-none !ring-0 !outline-none hover:!bg-accent hover:!text-accent-foreground focus:!bg-transparent focus:!ring-0 active:!bg-transparent active:!ring-0 dark:hover:!bg-accent/50 [&>button]:!bg-transparent [&>button]:!text-foreground [&>button]:hover:!bg-accent [&>button]:hover:!text-accent-foreground [&>button]:dark:hover:!bg-accent/50 [&>button]:!border-0 [&>button]:!shadow-none [&>button]:!ring-0"
			>
				{#snippet children(success: boolean)}
					{#if success}<Check size={16} />{:else}<ClipboardIcon size={16} />{/if}
				{/snippet}
			</Clipboard>
		</TooltipTrigger>
		<TooltipContent>
			{copySuccess ? m.message_copied() : m.message_copy()}
		</TooltipContent>
	</Tooltip>

	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => onRegenerate?.(message)}
				class="p-1.5!"
				variant="ghost"
				size="sm"
				title={m.message_regenerate()}
			>
				<RefreshCw size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>
			{m.coming_soon()}
		</TooltipContent>
	</Tooltip>

	<FeedbackButtons {message} {onFeedback} />
</div>
