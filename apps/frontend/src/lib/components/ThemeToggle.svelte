<script lang="ts">
	import { theme, type Theme } from '$lib/stores/theme';
	import { Button, Dropdown, DropdownItem } from 'flowbite-svelte';
	import { ChevronDownOutline } from 'flowbite-svelte-icons';

	let currentTheme: Theme;
	theme.subscribe(value => currentTheme = value);

	const themes: { value: Theme; label: string; icon: string }[] = [
		{ value: 'light', label: 'Light', icon: '☀️' },
		{ value: 'dark', label: 'Dark', icon: '🌙' },
		{ value: 'system', label: 'System', icon: '💻' }
	];

	function getThemeIcon(themeValue: Theme): string {
		return themes.find(t => t.value === themeValue)?.icon || '💻';
	}

	function getThemeLabel(themeValue: Theme): string {
		return themes.find(t => t.value === themeValue)?.label || 'System';
	}
</script>

<Button 
	class="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
	size="sm"
>
	<span class="text-sm">{getThemeIcon(currentTheme)}</span>
	<span class="hidden sm:inline text-sm">{getThemeLabel(currentTheme)}</span>
	<ChevronDownOutline class="w-3 h-3" />
</Button>

<Dropdown class="w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
	{#each themes as themeOption}
		<DropdownItem
			class="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 {currentTheme === themeOption.value ? 'bg-gray-50 dark:bg-gray-700' : ''}"
			on:click={() => theme.setTheme(themeOption.value)}
		>
			<span class="text-base">{themeOption.icon}</span>
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">{themeOption.label}</span>
			{#if currentTheme === themeOption.value}
				<span class="ml-auto text-gray-500 dark:text-gray-400">✓</span>
			{/if}
		</DropdownItem>
	{/each}
</Dropdown>