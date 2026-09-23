<script lang="ts" module>
	import {
		defaultFeedbackButtonsLabels,
		type FeedbackButtonsLabels
	} from './FeedbackButtons.svelte';

	export interface AIMessageActionsLabels {
		copy: string;
		copied: string;
		regenerate: string;
		feedback: FeedbackButtonsLabels;
	}

	export const defaultAIMessageActionsLabels: AIMessageActionsLabels = {
		copy: 'Copy to clipboard',
		copied: 'Copied',
		regenerate: 'Regenerate',
		feedback: defaultFeedbackButtonsLabels
	};
</script>

<script lang="ts">
	import { CopyButton } from '$lib/components/ui/copy-button';
	import { Button } from '$lib/components/ui/button';
	import { RefreshCw } from '@lucide/svelte';
	import type { Message } from '@svelte-langgraph/client';
	import { Tooltip, TooltipTrigger, TooltipContent } from '$lib/components/ui/tooltip/index.js';
	import FeedbackButtons from './FeedbackButtons.svelte';
	import { resolveLabels, type DeepPartial } from './labels';
	import { useLangGraphOptional } from './langGraphContext.svelte.js';

	interface Props {
		message: Message;
		isHovered: boolean;
		onRegenerate: (message: Message) => void;
		onFeedback?: (message: Message, type: 'up' | 'down') => void;
		labels?: DeepPartial<AIMessageActionsLabels>;
	}

	let { message, isHovered, onRegenerate, onFeedback, labels }: Props = $props();

	const ctx = useLangGraphOptional();
	const l = $derived(resolveLabels(defaultAIMessageActionsLabels, ctx?.labels?.aiActions, labels));

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
			{copySuccess ? l.copied : l.copy}
		</TooltipContent>
	</Tooltip>

	<Tooltip>
		<TooltipTrigger>
			<Button
				onclick={() => onRegenerate(message)}
				class="h-6 w-6"
				variant="ghost"
				size="icon-sm"
				title={l.regenerate}
			>
				<RefreshCw size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>
			{l.regenerate}
		</TooltipContent>
	</Tooltip>

	<FeedbackButtons {message} {onFeedback} labels={l.feedback} />
</div>
