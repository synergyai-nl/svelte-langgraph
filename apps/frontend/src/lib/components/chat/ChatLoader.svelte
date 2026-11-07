<div class="flex h-full flex-col">
	<div class="flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto pt-16">
		<div class="mx-auto w-full max-w-4xl">
			<div class="flex flex-col items-center justify-center text-center">
				<div class="mx-auto max-w-2xl space-y-8">
					<div class="space-y-4">
						<!-- Loader for greeting -->
						<div class="bg-muted h-12 animate-pulse rounded-lg"></div>
						<!-- Skeleton for description -->
						<div class="bg-muted mx-auto h-6 w-3/4 animate-pulse rounded-lg"></div>
					</div>

					<!-- Loader for suggestion cards -->
					<div class="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
						{#each Array(4).keys() as i (i)}
							<div class="bg-card animate-pulse rounded-lg p-6">
								<div class="bg-muted mb-2 h-6 rounded"></div>
								<div class="bg-muted h-4 w-3/4 rounded"></div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Loader for chat input -->
	<div class="border-border-input bg-card shrink-0 border-t p-4">
		<div class="mx-auto max-w-4xl">
			<div class="bg-muted h-12 animate-pulse rounded-lg"></div>
		</div>
	</div>
</div>
