<script lang="ts">
	import '../app.tailwind.css';

	import { SignIn, SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/state';

	import { MessagesOutline } from 'flowbite-svelte-icons';
	import { UserCircleSolid, ClipboardListSolid, ArrowRightToBracketOutline } from 'flowbite-svelte-icons';
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

	let { children } = $props();
</script>

<Navbar>
	<NavBrand href="/">
		<MessagesOutline class="me-3 h-6 sm:h-9" />
		<span class="self-center text-xl font-semibold whitespace-nowrap dark:text-white">
			My AI Chat UI
		</span>
	</NavBrand>

	<div class="flex items-center md:order-2">
		{#if page.data.session}
			<!-- Avatar Button -->
			<Button
				color="alternative"
				class="!p-1 rounded-full"
				id="avatar-menu-button"
			>
				{#if page.data.session.user?.image}
					<Avatar src={page.data.session.user.image} size="sm" />
				{:else}
					<Avatar size="sm" />
				{/if}
				<span class="sr-only">Open user menu</span>
			</Button>

			<!-- Dropdown Menu -->
			<Dropdown triggeredBy="#avatar-menu-button" placement="bottom-end" simple>
				<DropdownHeader>
					<span class="block text-sm font-medium text-gray-900 dark:text-white">
						{page.data.session.user?.name ?? 'User'}
					</span>
					<span class="block truncate text-sm text-gray-500 dark:text-gray-400">
						{page.data.session.user?.email ?? 'email@example.com'}
					</span>
				</DropdownHeader>
				
				<DropdownDivider />
				
				<DropdownItem href="/dashboard">
					<ClipboardListSolid class="me-2 h-4 w-4" />
					Dashboard
				</DropdownItem>
				
				<DropdownItem href="/profile">
					<UserCircleSolid class="me-2 h-4 w-4 " />
					Profile
				</DropdownItem>
				
				<DropdownDivider />
				
				<SignOut callbackUrl="/">
					<DropdownItem slot="submitButton" class="text-red-600 dark:text-red-500 w-full">
						<ArrowRightToBracketOutline class="me-2 h-4 w-4" />
						Sign out
					</DropdownItem>
				</SignOut>
			</Dropdown>
		{:else}
			<SignIn provider="descope">
				<Button slot="submitButton" size="sm">Sign in</Button>
			</SignIn>
		{/if}
		
		<DarkMode class="ml-3" />
		<NavHamburger class="ml-3" />
	</div>

	<NavUl>
		<NavLi href="/">Home</NavLi>
		<NavLi href="/chat">Chat</NavLi>
		<NavLi href="/demo">Paraglide</NavLi>
	</NavUl>
</Navbar>

{@render children()}
