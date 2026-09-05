<script lang="ts">
	import SuggestionCard from './SuggestionCard.svelte';

	export interface ChatSuggestion {
		title: string;
		description: string;
		suggestedText: string;
	}

	interface Props {
		suggestions: ChatSuggestion[];
		introTitle: string;
		intro: string;
		onSuggestionClick: (suggestedText: string) => void;
	}

	let { suggestions, introTitle, intro, onSuggestionClick }: Props = $props();
</script>

<!-- `min-h-full`, not `min-h-screen`: this renders inside `ChatSurface`'s scroll container, which
     may be far smaller than the viewport (SLG-133's embeddable-container story — see
     `routes/demo/embedded`). Referencing the viewport here would force that container to scroll
     past its own bounds regardless of how small a host page makes it; `routes/+layout.svelte`'s
     header comment documents the same rule for the app shell itself. -->
<div class="flex min-h-full flex-col items-center justify-start pt-16">
	<div class="mx-auto w-full max-w-4xl">
		<div class="flex flex-col items-center justify-center text-center">
			<div class="fade-slide-up mx-auto max-w-2xl space-y-8">
				<div class="space-y-4">
					<h1 class="text-4xl font-light text-gray-900 md:text-5xl dark:text-white">
						{introTitle}
					</h1>
					<p class="text-lg font-light text-gray-600 dark:text-gray-400">
						{intro}
					</p>
				</div>

				<div class="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
					{#each suggestions as suggestion, index (index)}
						<SuggestionCard
							title={suggestion.title}
							description={suggestion.description}
							onclick={() => onSuggestionClick(suggestion.suggestedText)}
						/>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	@keyframes fade-slide-up {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.fade-slide-up {
		animation: fade-slide-up 0.6s ease-out;
	}
</style>
