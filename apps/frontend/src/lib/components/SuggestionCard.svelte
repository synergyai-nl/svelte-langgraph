<script lang="ts">
	interface Props {
		title: string;
		description: string;
		suggestedText: string;
		onclick: () => void;
	}

	let { title, description, suggestedText, onclick }: Props = $props();
</script>

<button 
	class="p-6 text-left border border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md transition-all duration-200 bg-white dark:bg-gray-800"
	{onclick}
>
	<h3 class="font-medium text-gray-900 dark:text-white mb-2">{title}</h3>
	<p class="text-sm text-gray-600 dark:text-gray-400">{description}</p>
</button>