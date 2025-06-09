<script lang="ts">
	import '../app.tailwind.css';

	import { SignIn, SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/state';

	import { MessagesOutline, ArrowRightOutline } from 'flowbite-svelte-icons';
	import {
		Button,
		Navbar,
		NavBrand,
		NavLi,
		NavUl,
		NavHamburger,
		Dropdown,
		DropdownHeader,
		Avatar
	} from 'flowbite-svelte';

	let { children } = $props();
</script>

<Navbar>
	<NavBrand href="/">
		<MessagesOutline class="me-3 h-6 sm:h-9" />
		<span class="self-center whitespace-nowrap text-xl font-semibold dark:text-white">
			My AI Chat UI
		</span>
	</NavBrand>
	<div class="flex items-center md:order-2">
		{#if page.data.session}
			{#if page.data.session.user?.image}
				<Avatar id="avatar-menu" src={page.data.session.user.image} />
			{:else}
				<Avatar id="avatar-menu" />
			{/if}
		{:else}
			<SignIn provider="descope"><Button slot="submitButton" size="sm">Sign in</Button></SignIn>
		{/if}
		<NavHamburger />
	</div>
	{#if page.data.session}
		<Dropdown placement="bottom" triggeredBy="#avatar-menu">
			<DropdownHeader>
				<span class="block text-sm">{page.data.session.user?.name ?? 'User'}</span>
				<span class="block truncate text-sm font-medium">
					{page.data.session.user?.email ?? 'email'}
				</span>
			</DropdownHeader>
			<!--
			<DropdownGroup>
				<DropdownItem>Dashboard</DropdownItem>
				<DropdownItem>Settings</DropdownItem>
				<DropdownItem>Earnings</DropdownItem>
			</DropdownGroup>
			-->
			<SignOut>
				<DropdownHeader>Sign out</DropdownHeader>
			</SignOut>
		</Dropdown>
	{/if}
	<NavUl>
		<NavLi href="/">Home</NavLi>
		<NavLi href="/chat">Chat</NavLi>
		<NavLi href="/demo">Paraglide</NavLi>
	</NavUl>
</Navbar>

{@render children()}
