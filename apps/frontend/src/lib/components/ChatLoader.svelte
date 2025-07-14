<div class="min-h-screen flex flex-col items-center justify-start pt-16">
	<div class="w-full max-w-4xl mx-auto">
		<div class="flex flex-col items-center justify-center text-center">
			<div class="max-w-2xl mx-auto space-y-8">
				<div class="space-y-4">
					<!-- Loader for greeting -->
					<div class="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
					<!-- Skeleton for description -->
					<div class="h-6 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse mx-auto w-3/4"></div>
				</div>
				
				<!-- Loader for suggestion cards -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12">
					{#each Array(4) as _}
						<div class="p-6 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse">
							<div class="h-6 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
							<div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Loader for chat input -->
<div class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t dark:border-gray-700 p-4">
	<div class="max-w-4xl mx-auto">
		<div class="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
	</div>
</div>
