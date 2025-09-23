<script lang="ts">
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages.js';
</script>

<div
	class="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12 dark:bg-black"
>
	<div class="max-w-md text-center">
		<h1 class="mb-4 text-5xl font-light text-gray-900 dark:text-white">
			{page.status}
		</h1>
		<p class="mb-2 text-xl text-gray-700 dark:text-gray-300">
			{page.error?.message || m.error_message_fallback()}
		</p>
		<p class="mt-6 text-sm text-gray-500 dark:text-gray-500">
			{m.error_try_again()}
		</p>
		<a
			href="/"
			class="mt-8 inline-block rounded border border-gray-300 px-5 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
		>
			{m.error_return_home()}
		</a>
	</div>
</div>
