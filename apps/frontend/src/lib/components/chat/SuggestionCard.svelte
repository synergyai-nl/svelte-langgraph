<script lang="ts">
	interface Props {
		title: string;
		description: string;
		onclick: () => void;
	}

	let { title, description, onclick }: Props = $props();
</script>

<button
	class="rounded-xl border border-gray-200 bg-white p-6 text-left transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600"
	{onclick}
>
	<h3 class="mb-2 font-medium text-gray-900 dark:text-white">{title}</h3>
	<p class="text-sm text-gray-600 dark:text-gray-400">{description}</p>
</button>
