<div class="flex min-h-screen flex-col items-center justify-start pt-16">
	<div class="mx-auto w-full max-w-4xl">
		<div class="flex flex-col items-center justify-center text-center">
			<div class="mx-auto max-w-2xl space-y-8">
				<div class="space-y-4">
					<!-- Loader for greeting -->
					<div class="h-12 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"></div>
					<!-- Skeleton for description -->
					<div
						class="mx-auto h-6 w-3/4 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
					></div>
				</div>

				<!-- Loader for suggestion cards -->
				<div class="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
					{#each Array(4).keys() as i (i)}
						<div class="animate-pulse rounded-lg bg-gray-100 p-6 dark:bg-gray-800">
							<div class="mb-2 h-6 rounded bg-gray-200 dark:bg-gray-700"></div>
							<div class="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700"></div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Loader for chat input -->
<div
	class="fixed right-0 bottom-0 left-0 border-t bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
>
	<div class="mx-auto max-w-4xl">
		<div class="h-12 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"></div>
	</div>
</div>
