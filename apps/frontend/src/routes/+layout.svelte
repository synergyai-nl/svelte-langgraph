<script lang="ts">
	import '../app.tailwind.css';

	import { SignIn, SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/state';

	import { MessagesOutline } from 'flowbite-svelte-icons';
	import { UserCircleSolid, ClipboardListSolid, ArrowRightAltSolid } from 'flowbite-svelte-icons';
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
		Avatar,
		DarkMode
	} from 'flowbite-svelte';
	import { Toaster } from 'svelte-french-toast';

	let { children } = $props();
</script>

<Navbar>
	<NavBrand href="/">
		<MessagesOutline class="me-3 h-6 sm:h-9" />
		<span class="self-center text-xl font-semibold whitespace-nowrap dark:text-white">
			My AI Chat UI
		</span>
	</NavBrand>

	<div class="group relative flex items-center md:order-2">
		{#if page.data.session}
			<button
				id="avatar-menu"
				class="flex items-center space-x-2 rounded-full ring-blue-500 transition duration-150 hover:ring-2 focus:ring-2"
			>
				{#if page.data.session.user?.image}
					<Avatar src={page.data.session.user.image} />
				{:else}
					<Avatar />
				{/if}
				<span class="hidden text-sm font-medium text-gray-800 sm:inline dark:text-white">
					Hi, {page.data.session.user?.name?.split(' ')[0] ?? 'User'}
				</span>
			</button>

			<Dropdown placement="bottom-end" triggeredBy="#avatar-menu" class="z-50 w-56" simple>
				<!-- Header -->
				<DropdownHeader>
					<div class="flex flex-col">
						<span class="text-sm font-semibold text-gray-900 dark:text-white">
							{page.data.session.user?.name ?? 'User'}
						</span>
						<span class="truncate text-xs text-gray-500 dark:text-gray-400">
							{page.data.session.user?.email ?? 'email@example.com'}
						</span>
					</div>
				</DropdownHeader>

				<!-- Dashboard -->
				<DropdownItem
					href="/dashboard"
					class="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
				>
					<ClipboardListSolid class="h-4 w-4 shrink-0" />
					<span class="text-sm">Dashboard</span>
				</DropdownItem>

				<!-- Profile -->
				<DropdownItem
					href="/profile"
					class="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700"
				>
					<UserCircleSolid class="h-4 w-4 shrink-0" />
					<span class="text-sm">Profile</span>
				</DropdownItem>

				<!-- Sign Out -->
				<SignOut>
					<DropdownItem
						class="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-600/10"
					>
						<ArrowRightAltSolid class="h-4 w-4 shrink-0" />
						<span class="text-sm">Sign out</span>
					</DropdownItem>
				</SignOut>
			</Dropdown>
		{:else}
			<SignIn provider="descope">
				<Button slot="submitButton" size="sm">Sign in</Button>
			</SignIn>
		{/if}
		<DarkMode />

		<NavHamburger />
	</div>

	<NavUl>
		<NavLi href="/">Home</NavLi>
		<NavLi href="/chat">Chat</NavLi>
		<NavLi href="/demo">Paraglide</NavLi>
	</NavUl>
</Navbar>

<Toaster
  position="top-center"
  toastOptions={{
    duration: 4000,
    className: 'mt-0 rounded-b-2xl px-4 py-2 text-sm shadow-md bg-white text-gray-900 dark:bg-zinc-900 dark:text-white'
  }}
/>

{@render children()}
