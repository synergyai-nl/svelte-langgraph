<script lang="ts">
	import { getLocale, setLocale, locales, type Locale } from '$lib/paraglide/runtime.js';
	import { Button, Dropdown, DropdownItem } from 'flowbite-svelte';
	import { GlobeOutline } from 'flowbite-svelte-icons';

	let { class: className = '' } = $props();

	const localeNames: Record<string, string> = {
		en: 'English',
		nl: 'Dutch',
		hi: 'हिन्दी'
	};

	async function switchLanguage(newLocale: Locale) {
		try {
			setLocale(newLocale, { reload: true });
		} catch (err) {
			console.warn('Language switch failed, fallback reload:', err);
			setLocale('en', { reload: true });
		}
	}
</script>

<Button class={className} color="light" outline={false}>
	<GlobeOutline />
</Button>
<Dropdown simple>
	{#each locales as localeCode (localeCode)}
		<DropdownItem onclick={() => switchLanguage(localeCode)}>
			<span
				class="flex w-full items-center justify-between text-sm font-medium text-gray-900 dark:text-white"
			>
				{localeNames[localeCode as Locale] || localeCode}
				{#if getLocale() === localeCode}
					<span class=" ml-2">✓</span>
				{/if}
			</span>
		</DropdownItem>
	{/each}
</Dropdown>
