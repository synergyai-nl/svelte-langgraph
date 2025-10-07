<script lang="ts">
	import { UserOutline } from 'flowbite-svelte-icons';
	import { Spinner } from 'flowbite-svelte';
</script>

<div class="mb-6 flex w-full justify-start">
	<div class="flex max-w-[80%] items-start gap-3">
		<div
			class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 dark:bg-gray-400"
		>
			<UserOutline size="sm" class="text-white dark:text-gray-900" />
		</div>
		<div class="relative w-full">
			<Spinner />
		</div>
	</div>
</div>
