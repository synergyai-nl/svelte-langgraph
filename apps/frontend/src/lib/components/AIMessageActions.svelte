<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { RefreshCw, Check, Clipboard } from 'lucide-svelte';
	import type { BaseMessage } from '$lib/langgraph/types';
	import * as m from '$lib/paraglide/messages.js';
	import {
		Tooltip,
		TooltipTrigger,
		TooltipContent,
		TooltipProvider
	} from '$lib/components/ui/tooltip/index.js';
    import { Clipboard as Clipboard_icon } from 'flowbite-svelte';
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

<TooltipProvider>
	<div
		class="absolute bottom-2 left-0 flex items-center gap-1 transition-all duration-300 ease-in-out"
		style="opacity: {isHovered ? '1' : '0'}; transform: translateY({isHovered ? '0' : '-4px'});"
	>
		<Tooltip open={copyOpen}>
			<TooltipTrigger>
				<Clipboard_icon
					value={message.text}
					embedded
					color="alternative"
					class="p-1.5!"
					onchange={(e) =>
						(copyOpen = (e.target as HTMLButtonElement).getAttribute('aria-pressed') === 'true')}
				>
					{#snippet children(success)}
						{#if success}<Check class="h-3 w-3" />{:else}<Clipboard class="h-3 w-3" />{/if}
					{/snippet}
				</Clipboard_icon>
			</TooltipTrigger>
			<TooltipContent>
				{copyOpen ? m.message_copied() : m.message_copy()}
			</TooltipContent>
		</Tooltip>

		<Tooltip>
			<TooltipTrigger>
				<Button
					onclick={() => onRegenerate?.(message)}
					class="p-1.5!"
					color="alternative"
					size="xs"
					title={m.message_regenerate()}
				>
					<RefreshCw class="h-3 w-3" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				{m.coming_soon()}
			</TooltipContent>
		</Tooltip>
		<FeedbackButtons {message} {onFeedback} />
	</div>
</TooltipProvider>
