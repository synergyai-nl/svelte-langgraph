<script lang="ts">
	import { onMount } from 'svelte';

	interface Message {
		text: string;
		isUser: boolean;
	}

	let messages = $state<Message[]>([]);
	let currentPhrase = $state(0);

	const loadingPhrases = [
		'Getting things ready...',
		'Warming up the AI...',
		'Almost there...',
		'Preparing your experience...'
	];

	const chatMessages = [
		{ text: '', isUser: false },
		{ text: '', isUser: true },
		{ text: '', isUser: false },
		{ text: '', isUser: true }
	];

	onMount(() => {
		// Add chat messages one by one
		chatMessages.forEach((msg, index) => {
			setTimeout(() => {
				messages = [...messages, msg];
			}, index * 900);
		});

		// Cycle through loading phrases
		const phraseInterval = setInterval(() => {
			currentPhrase = (currentPhrase + 1) % loadingPhrases.length;
		}, 20000);

		return () => clearInterval(phraseInterval);
	});
</script>

<div class="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-900">
	<!-- Chat Messages Area -->
	<div class="flex flex-1 flex-col items-center px-4 pt-8 pb-40">
		<div class="w-full max-w-4xl space-y-4">
			{#each messages as message, i (i)}
				<div
					class="animate-fade-in flex opacity-0 {message.isUser ? 'justify-end' : 'justify-start'}"
					style="animation-delay: {i * 200}ms; animation-fill-mode: forwards;"
				>
					<div class="flex items-start gap-3 {message.isUser ? 'flex-row-reverse' : 'flex-row'}">
						<div
							class="h-10 w-10 flex-shrink-0 animate-pulse rounded-full bg-gray-300 dark:bg-gray-600"
						></div>
						<div
							class="space-y-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
							style="min-width: 200px; max-width: 400px;"
						>
							<div class="h-3 w-full animate-pulse rounded bg-gray-300 dark:bg-gray-600"></div>
							<div class="h-3 w-3/4 animate-pulse rounded bg-gray-300 dark:bg-gray-600"></div>
						</div>
					</div>
				</div>
			{/each}

			{#if messages.length > 0}
				<div class="animate-fade-in flex flex-row-reverse items-start gap-3">
					<div
						class="h-10 w-10 flex-shrink-0 animate-pulse rounded-full bg-gray-300 dark:bg-gray-600"
					></div>
					<div
						class="flex items-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
					>
						<div
							class="h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"
							style="animation-delay: 0ms;"
						></div>
						<div
							class="h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"
							style="animation-delay: 150ms;"
						></div>
						<div
							class="h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"
							style="animation-delay: 300ms;"
						></div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Fixed Loading Text -->
	<div class="fixed right-0 bottom-32 left-0 text-center">
		<p class="animate-pulse text-base font-medium text-gray-600 dark:text-gray-400">
			{loadingPhrases[currentPhrase]}
		</p>
	</div>

	<!-- Input Box Skeleton -->
	<div
		class="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"
	>
		<div class="mx-auto max-w-4xl">
			<div class="flex items-center gap-3">
				<div class="h-14 flex-1 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700"></div>
				<div class="h-11 w-11 animate-pulse rounded-full bg-gray-300 dark:bg-gray-600"></div>
			</div>
		</div>
	</div>

	<!-- Feedback Button -->
	<div class="fixed right-6 bottom-6">
		<div class="h-10 w-28 animate-pulse rounded-lg bg-gray-300 dark:bg-gray-600"></div>
	</div>
</div>

<style>
	@keyframes fade-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fade-in {
		animation: fade-in 0.5s ease-out;
	}
</style>
