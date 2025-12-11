<script lang="ts">
	import '../app.tailwind.css';

	import { SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	import {
		ArrowLeftToBracketOutline,
		MessagesOutline,
		MoonSolid,
		SunSolid
	} from 'flowbite-svelte-icons';
	import {
		Navbar,
		NavBrand,
		NavLi,
		NavUl,
		NavHamburger,
		Dropdown,
		DropdownHeader,
		DropdownDivider,
		Avatar
	} from 'flowbite-svelte';
	import { Button } from '$lib/components/ui/button';

	import { ModeWatcher, toggleMode, mode } from 'mode-watcher';

	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';

	import * as Tooltip from '$lib/components/ui/tooltip/index.js';

	let { children } = $props();
</script>

<ModeWatcher />
<Navbar>
	<NavBrand href="/">
		<MessagesOutline class="me-3 h-6 sm:h-9" />
		<span class="self-center text-xl font-semibold whitespace-nowrap dark:text-white">
			{m.app_title()}
		</span>
	</NavBrand>

	<div class="flex items-center md:order-2">
		{#if page.data.session}
			<!-- Avatar Button -->
			<Button variant="default" class="rounded-full p-1 pr-4" id="avatar-menu-button">
				<Avatar src={page.data.session.user?.image ?? undefined} size="sm" class="mr-2" />

				<span class="hidden text-sm font-medium text-gray-800 sm:inline dark:text-white">
					{page.data.session.user?.name ?? m.user_fallback()}
				</span>
			</Button>

			<!-- Dropdown Menu -->
			<Dropdown triggeredBy="#avatar-menu-button" placement="bottom-end" simple>
				<DropdownHeader>
					<span class="block text-sm font-medium text-gray-900 dark:text-white">
						{page.data.session.user?.name ?? m.user_fallback()}
					</span>
					<span class="block truncate text-sm text-gray-500 dark:text-gray-400">
						{page.data.session.user?.email ?? m.email_fallback()}
					</span>
				</DropdownHeader>

				<DropdownDivider />
				<button
					type="button"
					class="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-600"
					onclick={toggleMode}
				>
					<span>{mode.current === 'light' ? m.light_mode() : m.dark_mode()}</span>
					{#if mode.current === 'light'}
						<SunSolid class="text-primary-500 h-5 w-5" />
					{:else}
						<MoonSolid class="text-primary-600 h-5 w-5" />
					{/if}
				</button>
				<DropdownDivider />

				<SignOut
					options={{
						redirectTo: '/',
						redirect: true
					}}
				>
					<div
						slot="submitButton"
						class="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600"
					>
						<span>{m.auth_sign_out()}</span>
						<ArrowLeftToBracketOutline
							class="text-primary-500 dark:text-primary-600 pointer-events-none h-5 w-5 shrink-0"
						/>
					</div>
				</SignOut>
			</Dropdown>
		{:else}
			<SignInButton />
		{/if}
		<LanguageSwitcher class="ml-3" />
		<NavHamburger class="ml-3" />
	</div>

	<NavUl>
		<NavLi href="/">{m.nav_home()}</NavLi>
		<NavLi href="/chat">{m.nav_chat()}</NavLi>
	</NavUl>
</Navbar>

<Tooltip.Provider>
	{@render children()}
</Tooltip.Provider>
