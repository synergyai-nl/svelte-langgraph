<script>
	import { SignIn, SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/stores';

	import { MessagesOutline, ArrowRightOutline } from 'flowbite-svelte-icons';
	import {
		Alert,
		Button,
		Navbar,
		NavBrand,
		NavLi,
		NavUl,
		NavHamburger,
		DarkMode,
		Heading,
		Dropdown,
		DropdownHeader,
		DropdownGroup,
		DropdownItem,
		Avatar
	} from 'flowbite-svelte';
</script>

<Navbar>
	<NavBrand href="/">
		<MessagesOutline class="me-3 h-6 sm:h-9" />
		<span class="self-center whitespace-nowrap text-xl font-semibold dark:text-white">
			My AI Chat UI
		</span>
	</NavBrand>
	<div class="flex items-center md:order-2">
		{#if $page.data.session}
			{#if $page.data.session.user?.image}
				<Avatar id="avatar-menu" src={$page.data.session.user.image} />
			{:else}
				<Avatar id="avatar-menu" />
			{/if}
		{:else}
			<SignIn provider="descope"><Button slot="submitButton" size="sm">Sign in</Button></SignIn>
		{/if}
		<NavHamburger />
	</div>
	{#if $page.data.session}
		<Dropdown placement="bottom" triggeredBy="#avatar-menu">
			<DropdownHeader>
				<span class="block text-sm">{$page.data.session.user?.name ?? 'User'}</span>
				<span class="block truncate text-sm font-medium">
					{$page.data.session.user?.email ?? 'email'}
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
		<NavLi href="/demo">Demo</NavLi>
	</NavUl>
</Navbar>

<div class="text-center">
	<Heading tag="h1" class="mb-4 text-4xl font-extrabold  md:text-5xl lg:text-6xl">
		My AI Chat UI
	</Heading>

	<div class="p-8">
		{#if !$page.data.session}
			<Alert color="green">
				<p class="mb-4 mt-2 text-sm">You are not signed in</p>
				<SignIn provider="descope">
					<Button size="xs" color="green" slot="submitButton">
						Sign in <ArrowRightOutline class="ms-2 h-6 w-6" />
					</Button>
				</SignIn>
			</Alert>
		{/if}
	</div>
</div>
