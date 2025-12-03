<script lang="ts">

	import { Button } from '$lib/components/ui/button';
	import { PenOutline } from 'flowbite-svelte-icons';
	import type { BaseMessage } from '$lib/langgraph/types';
	import * as m from '$lib/paraglide/messages.js';
	import { Tooltip, TooltipTrigger, TooltipContent } from '$lib/components/ui/tooltip/index.js';

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

	<Tooltip>
		<TooltipTrigger asChild let:builder>
	<Button onclick={() => onEdit?.(message)} variant="ghost" size="icon-sm" title={m.message_edit()}>
		<PenOutline />
	</Button>
		</TooltipTrigger>
		<TooltipContent>
			{m.coming_soon()}
		</TooltipContent>
	</Tooltip>
</div>
