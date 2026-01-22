<script lang="ts">
	import { User } from '@lucide/svelte';
	import { Spinner } from '$lib/components/ui/spinner';
</script>

<div class="mb-6 flex w-full justify-start">
	<div class="flex max-w-[80%] items-start gap-3">
		<div
			class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 dark:bg-gray-400"
		>
			<User size={20} class="text-white dark:text-gray-900" />
		</div>
		<div>
			<Spinner size="xl" />
		</div>
	</div>
</div>
