<script lang="ts">
	import '../app.tailwind.css';

	import { SignIn, SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	import { MessagesOutline } from 'flowbite-svelte-icons';
	import {
		Button,
		Navbar,
		NavBrand,
		NavLi,
		NavUl,
		NavHamburger,
		Dropdown,
		DropdownHeader,
		DropdownItem,
		DropdownDivider,
		Avatar,
		DarkMode
	} from 'flowbite-svelte';

	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

	let { children } = $props();
</script>

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

				<DropdownItem href="/dashboard">
					<span>{m.nav_dashboard()}</span>
				</DropdownItem>

				<DropdownItem href="/profile">
					<span>{m.nav_profile()}</span>
				</DropdownItem>

				<DropdownDivider />

				<SignOut
					options={{
						redirectTo: '/',
						redirect: true
					}}
				>
					<DropdownItem
						slot="submitButton"
						class="!flex !w-full !items-center !justify-start text-red-600 dark:text-red-500"
					>
						<span>{m.auth_sign_out()}</span>
					</DropdownItem>
				</SignOut>
			</Dropdown>
		{:else}
			<SignIn provider="descope">
				<Button slot="submitButton" size="sm">{m.auth_sign_in()}</Button>
			</SignIn>
		{/if}
		<LanguageSwitcher class="ml-3 p-2" />
		<DarkMode class="ml-3" />
		<NavHamburger class="ml-3" />
	</div>

	<NavUl>
		<NavLi href="/">{m.nav_home()}</NavLi>
		<NavLi href="/chat">{m.nav_chat()}</NavLi>
		<NavLi href="/demo">{m.nav_paraglide()}</NavLi>
	</NavUl>
</Navbar>

{@render children()}
