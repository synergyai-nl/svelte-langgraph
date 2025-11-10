<script lang="ts">
	import '../app.tailwind.css';

	import { SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
	import { onMount } from 'svelte';

	import {
		ArrowLeftToBracketOutline,
		MessagesOutline,
		MoonSolid,
		SunSolid
	} from 'flowbite-svelte-icons';
	import {
		Button,
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

	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';

	let { children } = $props();

	let isDarkMode = $state(false);

	// Initialize theme immediately
	onMount(() => {
		// Check localStorage first, then fall back to system preference
		const savedTheme = localStorage.getItem('theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

		isDarkMode = savedTheme === 'dark' || (!savedTheme && prefersDark);

		if (isDarkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}

		// Listen for system preference changes only if no saved preference
		if (!savedTheme) {
			const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			const updateTheme = (e: MediaQueryListEvent) => {
				isDarkMode = e.matches;
				if (e.matches) {
					document.documentElement.classList.add('dark');
				} else {
					document.documentElement.classList.remove('dark');
				}
			};

			mediaQuery.addEventListener('change', updateTheme);

			return () => {
				mediaQuery.removeEventListener('change', updateTheme);
			};
		}
	});

	function toggleTheme() {
		isDarkMode = !isDarkMode;
		if (isDarkMode) {
			document.documentElement.classList.add('dark');
			localStorage.setItem('theme', 'dark');
		} else {
			document.documentElement.classList.remove('dark');
			localStorage.setItem('theme', 'light');
		}
	}
</script>

<svelte:head>
	<script>
		(function () {
			const savedTheme = localStorage.getItem('theme');
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

			if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
				document.documentElement.classList.add('dark');
			}
		})();
	</script>
</svelte:head>

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
			<Button color="alternative" class="rounded-full p-1 pr-4" id="avatar-menu-button">
				<Avatar
					src={page.data.session.user?.image ? page.data.session.user.image : undefined}
					size="sm"
					class="me-2"
				/>

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
					onclick={toggleTheme}
				>
					<span>{isDarkMode ? m.light_mode() : m.dark_mode()}</span>
					{#if isDarkMode}
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
					<button
						slot="submitButton"
						type="submit"
						class="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 dark:text-red-500 dark:hover:bg-gray-600"
					>
						<span>{m.auth_sign_out()}</span>
						<ArrowLeftToBracketOutline class="h-5 w-5 shrink-0" />
					</button>
				</SignOut>
			</Dropdown>
		{:else}
			<SignInButton />
		{/if}
		<LanguageSwitcher class="ml-3 p-2" />
		<NavHamburger class="ml-3" />
	</div>

	<NavUl>
		<NavLi href="/">{m.nav_home()}</NavLi>
		<NavLi href="/chat">{m.nav_chat()}</NavLi>
	</NavUl>
</Navbar>

{@render children()}
