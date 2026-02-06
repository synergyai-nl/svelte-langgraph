<script lang="ts">
	import { getLocale, setLocale, locales, type Locale } from '$lib/paraglide/runtime.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import { Globe } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { cn } from '$lib/utils.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let { class: className = '' } = $props();

	async function switchLanguage(newLocale: Locale) {
		try {
			setLocale(newLocale, { reload: true });
		} catch (err) {
			console.warn('Language switch failed, fallback reload:', err);
			setLocale('en', { reload: true });
		}
	}
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} class={cn('', className)} variant="outline" size="sm">
						<Globe size={16} />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>

			<DropdownMenu.Content align="end">
				{#each locales as localeCode (localeCode)}
					<DropdownMenu.Item onclick={() => switchLanguage(localeCode)}>
						{m.local_name({}, { locale: localeCode })}
						{#if getLocale() === localeCode}
							<span class="ml-auto">✓</span>
						{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Tooltip.Trigger>
	<Tooltip.Content>
		{m.local_name({}, { locale: getLocale() })}
	</Tooltip.Content>
</Tooltip.Root>
