<script lang="ts">
	import { Button } from 'flowbite-svelte';
	import { PenOutline } from 'flowbite-svelte-icons';
	import type { BaseMessage } from '$lib/langgraph/types';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		message: BaseMessage;
		isHovered: boolean;
		onEdit?: (message: BaseMessage) => void;
	}

	let { message, isHovered, onEdit }: Props = $props();
</script>

<div
	class="absolute right-0 bottom-2 flex items-center gap-2 transition-all duration-300 ease-in-out"
	style="opacity: {isHovered ? '1' : '0'}; transform: translateY({isHovered ? '0' : '-4px'});"
>
	<Button
		onclick={() => onEdit?.(message)}
		class="p-1.5!"
		color="alternative"
		size="xs"
		title={m.message_edit()}
		disabled
	>
		<PenOutline size="xs" />
	</Button>
</div>
