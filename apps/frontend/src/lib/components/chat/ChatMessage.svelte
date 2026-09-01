<script lang="ts" module>
	import {
		defaultAIMessageActionsLabels,
		type AIMessageActionsLabels
	} from './AIMessageActions.svelte';
	import {
		defaultUserMessageActionsLabels,
		type UserMessageActionsLabels
	} from './UserMessageActions.svelte';
	import {
		defaultUserMessageEditLabels,
		type UserMessageEditLabels
	} from './UserMessageEdit.svelte';
	import { defaultThinkingBlockLabels, type ThinkingBlockLabels } from './ThinkingBlock.svelte';

	/** Purely a pass-through aggregate — `ChatMessage` renders no label strings of its own. */
	export interface ChatMessageLabels {
		aiActions: AIMessageActionsLabels;
		userActions: UserMessageActionsLabels;
		userEdit: UserMessageEditLabels;
		thinking: ThinkingBlockLabels;
	}

	export const defaultChatMessageLabels: ChatMessageLabels = {
		aiActions: defaultAIMessageActionsLabels,
		userActions: defaultUserMessageActionsLabels,
		userEdit: defaultUserMessageEditLabels,
		thinking: defaultThinkingBlockLabels
	};
</script>

<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { User } from '@lucide/svelte';
	import type { Message } from '@svelte-langgraph/client';
	import Markdown from 'svelte-exmarkdown';
	import { gfmPlugin } from 'svelte-exmarkdown/gfm';
	import AIMessageActions from './AIMessageActions.svelte';
	import UserMessageActions from './UserMessageActions.svelte';
	import UserMessageEdit from './UserMessageEdit.svelte';
	import ThinkingBlock from './ThinkingBlock.svelte';
	import { resolveLabels, type DeepPartial } from './labels';
	import { useLangGraphOptional } from './langGraphContext.svelte.js';

	interface Props {
		message: Message;
		onEdit: (message: Message, newText: string) => boolean;
		onRegenerate: (message: Message) => void;
		onFeedback?: (message: Message, type: 'up' | 'down') => void;
		/** Whether this message's thinking block should show its "still streaming" animation. */
		isThinkingActive?: boolean;
		labels?: DeepPartial<ChatMessageLabels>;
	}

	let {
		message,
		onEdit,
		onRegenerate,
		onFeedback,
		isThinkingActive = false,
		labels
	}: Props = $props();

	const ctx = useLangGraphOptional();
	const l = $derived(resolveLabels(defaultChatMessageLabels, ctx?.labels?.message, labels));

	const plugins = [gfmPlugin()];

	let isHovered = $state(false);
	let isEditing = $state(false);
	let editText = $state('');

	function startEditing() {
		editText = message.text;
		isEditing = true;
	}

	function cancelEditing() {
		isEditing = false;
	}

	function confirmEdit() {
		if (editText.trim() && editText !== message.text) {
			// Only close the editor if the edit was accepted (rejected when a run is streaming)
			if (onEdit(message, editText)) {
				isEditing = false;
			}
		} else {
			isEditing = false;
		}
	}
</script>

<div class="mb-6 w-full {message.type === 'user' ? 'flex justify-end' : 'flex justify-start'}">
	<div
		class="flex items-start gap-3 {message.type === 'user'
			? 'max-w-[70%] flex-row-reverse'
			: 'max-w-[80%]'}"
	>
		<div class="bg-muted mt-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full">
			<User size={20} class="text-foreground" />
		</div>
		<div class="relative w-full">
			{#if message.type === 'user' && isEditing}
				<UserMessageEdit
					bind:value={editText}
					onConfirm={confirmEdit}
					onCancel={cancelEditing}
					labels={l.userEdit}
				/>
			{:else}
				<div
					role="group"
					onmouseenter={() => (isHovered = true)}
					onmouseleave={() => (isHovered = false)}
					class="relative w-full"
				>
					{#if message.type === 'ai'}
						{#if message.thinking}
							<ThinkingBlock
								thinking={message.thinking}
								active={isThinkingActive}
								labels={l.thinking}
							/>
						{/if}
						{#if message.text}
							<Card.Root class="border-border-card bg-muted border shadow-sm">
								<Card.Content class="prose prose-gray dark:prose-invert max-w-none text-sm">
									<Markdown md={message.text} {plugins} />
								</Card.Content>
							</Card.Root>
							<AIMessageActions
								{message}
								{isHovered}
								{onRegenerate}
								{onFeedback}
								labels={l.aiActions}
							/>
						{/if}
					{:else}
						<Card.Root class="bg-foreground border-0 shadow-sm">
							<Card.Content
								class="prose prose-invert text-background max-w-none text-sm whitespace-pre-wrap"
							>
								{message.text}
							</Card.Content>
						</Card.Root>
						<UserMessageActions {isHovered} onEdit={startEditing} labels={l.userActions} />
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>
