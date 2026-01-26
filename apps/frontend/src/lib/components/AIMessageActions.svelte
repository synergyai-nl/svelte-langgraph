<script lang="ts">
	import { CopyButton } from '$lib/components/ui/copy-button';
	import { Button } from '$lib/components/ui/button';
	import { RefreshCw } from '@lucide/svelte';
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
	let copyTimeoutId: ReturnType<typeof setTimeout> | null = null;
</script>

<div
	class="absolute left-0 flex items-center gap-1 transition-all duration-300 ease-in-out"
	style="opacity: {isHovered ? '1' : '0'}; transform: translateY({isHovered ? '0' : '-4px'});"
>
	<Tooltip disableCloseOnTriggerClick>
		<TooltipTrigger>
			<CopyButton
				text={message.text}
				variant="ghost"
				size="icon-sm"
				class="h-6 w-6"
				onCopy={(status) => {
					copySuccess = status === 'success';

					if (copySuccess) {
						if (copyTimeoutId) clearTimeout(copyTimeoutId);
						copyTimeoutId = setTimeout(() => {
							copySuccess = false;
						}, 1500);
					}
				}}
			/>
		</TooltipTrigger>
		<TooltipContent>
			{copySuccess ? m.message_copied() : m.message_copy()}
		</TooltipContent>
	</Tooltip>

	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => onRegenerate?.(message)}
				class="h-6 w-6"
				variant="ghost"
				size="icon-sm"
				title={m.message_regenerate()}
				disabled
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
