<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import ChatMessages from '../ChatMessages.svelte';
	import type { Message } from '$lib/langgraph/types';

	interface Props {
		messages: Array<Message>;
		finalAnswerStarted: boolean;
		generationError?: Error | null;
		onRetryError?: () => void;
	}

	let { messages, finalAnswerStarted, generationError = null, onRetryError }: Props = $props();
</script>

<Tooltip.Provider>
	<ChatMessages {messages} {finalAnswerStarted} {generationError} {onRetryError} />
</Tooltip.Provider>
