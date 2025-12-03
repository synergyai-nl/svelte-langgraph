<script lang="ts">
	import { UserOutline } from 'flowbite-svelte-icons';
	import { Spinner } from 'flowbite-svelte';

	interface Props {
		onCancel?: () => void;
	}

	let { onCancel }: Props = $props();
</script>

<div class="mb-6 flex w-full justify-start">
	<div class="flex max-w-[80%] items-start gap-3">
		<div
			class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 dark:bg-gray-400"
		>
			<UserOutline size="sm" class="text-white dark:text-gray-900" />
		</div>
		<div class="relative w-full">
			<div class="flex items-center gap-3">
				<Spinner />
				{#if onCancel}
					<button
						onclick={() => onCancel()}
						title="Stop generation"
						class="px-2 py-1 text-xs rounded-md border border-border hover:bg-muted/50 transition-colors"
					>
						Stop
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
