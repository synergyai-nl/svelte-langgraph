<script lang="ts">
	import '../app.tailwind.css';

	import { SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';
	import {
		Button,
		Navbar,
		NavBrand,
		NavLi,
		NavUl,
		NavHamburger,
		Dropdown,
		DropdownHeader,
		DropdownDivider
	} from 'flowbite-svelte';
	import { Avatar, AvatarImage, AvatarFallback } from '$lib/components/ui/avatar';
	import { ModeWatcher, toggleMode, mode } from 'mode-watcher';

	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import SignInButton from '$lib/auth/components/SignInButton.svelte';
	import { LogOut, MessagesSquare, Moon, Sun } from 'lucide-svelte';

	type SessionUser = {
		name?: string | null;
		email?: string | null;
	};

	function getInitials(name?: string | null) {
		if (!name) return 'U';
		const parts = name.trim().split(/\s+/).filter(Boolean);
		if (parts.length === 0) return 'U';
		return parts
			.slice(0, 2)
			.map((p) => p[0]!.toUpperCase())
			.join('');
	}

	function getDisplayName(user?: SessionUser | null) {
		if (user?.name && user.name.trim().length > 0) return user.name;
		if (user?.email) {
			const localPart = user.email.split('@')[0] ?? user.email;
			return localPart || user.email;
		}
		return m.user_fallback();
	}

	let { children } = $props();
</script>

<ModeWatcher />
<Navbar>
	<NavBrand href="/">
		<MessagesSquare class="me-3 h-6 sm:h-9" />
		<span class="self-center text-xl font-semibold whitespace-nowrap dark:text-white">
			{m.app_title()}
		</span>
	</NavBrand>

	<div class="flex items-center md:order-2">
		{#if page.data.session}
			<Button color="alternative" class="rounded-full p-1 pr-4" id="avatar-menu-button">
				<Avatar class="mr-2 h-8 w-8">
					<AvatarImage
						src={page.data.session.user?.image ?? undefined}
						alt={getDisplayName(page.data.session.user)}
					/>
					<AvatarFallback>
						{getInitials(page.data.session.user?.name ?? page.data.session.user?.email ?? null)}
					</AvatarFallback>
				</Avatar>
				<span class="hidden text-sm font-medium text-gray-800 sm:inline dark:text-white">
					{getDisplayName(page.data.session.user)}
				</span>
			</Button>

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
						<Sun class="text-primary-500 h-5 w-5" />
					{:else}
						<Moon class="text-primary-600 h-5 w-5" />
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
						<LogOut
							class="text-primary-500 dark:text-primary-600 pointer-events-none h-5 w-5 shrink-0 rotate-180"
						/>
					</div>
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
