<script lang="ts">
	import { locale, availableLocales } from '$lib/stores/locale';
	import { setLocale, type Locale } from '$lib/paraglide/runtime.js';
	import { Button, Dropdown, DropdownItem } from 'flowbite-svelte';
	import { ChevronDownOutline } from 'flowbite-svelte-icons';

	const localeNames: Record<string, string> = {
		en: 'English',
		nl: 'Dutch',
		hi: 'हिन्दी'
	};

	let currentLocale = $derived($locale);

	async function switchLanguage(newLocale: Locale) {
		try {
			setLocale(newLocale, { reload: true });
		} catch (err) {
			console.warn('Language switch failed, fallback reload:', err);
			setLocale('en', { reload: true });
		}
	}
</script>

<Button>
	{localeNames[currentLocale] || currentLocale}
	<ChevronDownOutline class="ms-2 h-6 w-6 text-white dark:text-white" />
</Button>
<Dropdown>
	{#each availableLocales as localeCode (localeCode)}
		<DropdownItem onclick={() => switchLanguage(localeCode)}>
			<span
				class="flex w-full items-center justify-between text-sm font-medium text-gray-900 dark:text-white"
			>
				{localeNames[localeCode as Locale] || localeCode}
				{#if $locale === localeCode}
					<span class=" ml-2">✓</span>
				{/if}
			</span>
		</DropdownItem>
	{/each}
</Dropdown>
