<script lang="ts">
	import '../app.tailwind.css';

	import { SignIn, SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { theme } from '$lib/stores/theme';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	import { MessagesOutline } from 'flowbite-svelte-icons';
	import {
		UserCircleSolid,
		ClipboardListSolid,
		ArrowRightAltSolid
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
		DropdownItem,
		Avatar
	} from 'flowbite-svelte';

	let { children } = $props();
	
	onMount(() => {
		theme.initTheme();
	});
</script>

<Navbar>
	<NavBrand href="/">
		<MessagesOutline class="me-3 h-6 sm:h-9" />
		<span class="self-center whitespace-nowrap text-xl font-semibold dark:text-white">
			My AI Chat UI
		</span>
	</NavBrand>

	<div class="flex items-center gap-3 md:order-2 relative group">
		<!-- Theme Toggle -->
		<ThemeToggle />
		
		{#if page.data.session}
			<button
				id="avatar-menu"
				class="flex items-center space-x-2 rounded-full hover:ring-2 focus:ring-2 ring-blue-500 transition duration-150"
			>
				{#if page.data.session.user?.image}
					<Avatar src={page.data.session.user.image} />
				{:else}
					<Avatar />
				{/if}
				<span class="hidden sm:inline text-sm font-medium text-gray-800 dark:text-white">
					Hi, {page.data.session.user?.name?.split(' ')[0] ?? 'User'}
				</span>
			</button>

			<Dropdown
				placement="bottom-end"
				triggeredBy="#avatar-menu"
				class="w-56 z-50"
				simple
			>
				<!-- Header -->
				<DropdownHeader>
					<div class="flex flex-col">
						<span class="text-sm font-semibold text-gray-900 dark:text-white">
							{page.data.session.user?.name ?? 'User'}
						</span>
						<span class="text-xs truncate text-gray-500 dark:text-gray-400">
							{page.data.session.user?.email ?? 'email@example.com'}
						</span>
					</div>
				</DropdownHeader>

				<!-- Dashboard -->
				<DropdownItem href="/dashboard" class="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
					<ClipboardListSolid class="h-4 w-4 shrink-0" />
					<span class="text-sm">Dashboard</span>
				</DropdownItem>

				<!-- Profile -->
				<DropdownItem href="/profile" class="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700">
					<UserCircleSolid class="h-4 w-4 shrink-0" />
					<span class="text-sm">Profile</span>
				</DropdownItem>

				<!-- Sign Out -->
				<SignOut>
					<DropdownItem class="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-600/10">
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

		<NavHamburger />
	</div>

	<NavUl>
		<NavLi href="/">Home</NavLi>
		<NavLi href="/chat">Chat</NavLi>
		<NavLi href="/demo">Paraglide</NavLi>
	</NavUl>
</Navbar>

{@render children()}
