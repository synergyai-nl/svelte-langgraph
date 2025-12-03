<script lang="ts">
	import { Spinner } from 'flowbite-svelte';
	import { User } from 'lucide-svelte';
</script>

<div class="mb-6 flex w-full justify-start">
	<div class="flex max-w-[80%] items-start gap-3">
		<div
			class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 dark:bg-gray-400"
		>
			<User class="h-3 w-3 text-white dark:text-gray-900" />
		</div>
		<div class="relative w-full">
			<Spinner />
		</div>
	</div>
</div>
