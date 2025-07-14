<style>
	@keyframes bubble-dance {
		0%, 100% { transform: translateY(0px) scale(1); }
		25% { transform: translateY(-4px) scale(1.05); }
		50% { transform: translateY(-2px) scale(0.95); }
		75% { transform: translateY(-6px) scale(1.02); }
	}

	.bubble-dance {
		animation: bubble-dance 1.5s ease-in-out infinite;
	}
</style>

<div class="absolute -top-3 left-4 flex gap-1">
	<div class="w-2 h-2 bg-gray-500 rounded-full bubble-dance" style="animation-delay: 0s"></div>
	<div class="w-2 h-2 bg-gray-500 rounded-full bubble-dance" style="animation-delay: 0.2s"></div>
	<div class="w-2 h-2 bg-gray-500 rounded-full bubble-dance" style="animation-delay: 0.4s"></div>
</div>