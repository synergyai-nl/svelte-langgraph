<script lang="ts" module>
	export interface UserMessageActionsLabels {
		edit: string;
	}

	export const defaultUserMessageActionsLabels: UserMessageActionsLabels = {
		edit: 'Edit'
	};
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Pencil } from '@lucide/svelte';
	import { Tooltip, TooltipTrigger, TooltipContent } from '$lib/components/ui/tooltip/index.js';
	import { resolveLabels, type DeepPartial } from './labels';
	import { useLangGraphOptional } from './langGraphContext.svelte.js';

	interface Props {
		isHovered: boolean;
		onEdit: () => void;
		labels?: DeepPartial<UserMessageActionsLabels>;
	}

	let { isHovered, onEdit, labels }: Props = $props();

	const ctx = useLangGraphOptional();
	const l = $derived(
		resolveLabels(defaultUserMessageActionsLabels, ctx?.labels?.userActions, labels)
	);
</script>

<div
	class="absolute right-0 flex items-center gap-2 transition-all duration-300 ease-in-out"
	style="opacity: {isHovered ? '1' : '0'}; transform: translateY({isHovered ? '0' : '-4px'});"
>
	<Tooltip>
		<TooltipTrigger>
			<Button onclick={onEdit} class="h-6 w-6" variant="ghost" size="icon-sm" title={l.edit}>
				<Pencil size={16} />
			</Button>
		</TooltipTrigger>
		<TooltipContent>
			{l.edit}
		</TooltipContent>
	</Tooltip>
</div>
