<div class="absolute -top-3 left-4 flex gap-1">
	<div class="bubble-dance h-2 w-2 rounded-full bg-gray-500" style="animation-delay: 0s"></div>
	<div class="bubble-dance h-2 w-2 rounded-full bg-gray-500" style="animation-delay: 0.2s"></div>
	<div class="bubble-dance h-2 w-2 rounded-full bg-gray-500" style="animation-delay: 0.4s"></div>
</div>

<style>
	@keyframes bubble-dance {
		0%,
		100% {
			transform: translateY(0px) scale(1);
		}
		25% {
			transform: translateY(-4px) scale(1.05);
		}
		50% {
			transform: translateY(-2px) scale(0.95);
		}
		75% {
			transform: translateY(-6px) scale(1.02);
		}
	}

	.bubble-dance {
		animation: bubble-dance 1.5s ease-in-out infinite;
	}
</style>
