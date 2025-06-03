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
		Heading
	} from 'flowbite-svelte';
</script>

<Navbar>
	<NavBrand href="/">
		<MessagesOutline class="me-3 h-6 sm:h-9" />
		<span class="self-center text-xl font-semibold whitespace-nowrap dark:text-white"
			>My AI Chat UI</span
		>
	</NavBrand>
	<div class="flex items-center md:order-2">
		<DarkMode />
		<NavHamburger />
	</div>
	<NavUl>
		<NavLi href="/">Home</NavLi>
		<NavLi href="/about">About</NavLi>
		<NavLi href="/docs/components/navbar">Navbar</NavLi>
		<NavLi href="/pricing">Pricing</NavLi>
		<NavLi href="/contact">Contact</NavLi>
	</NavUl>
</Navbar>

<div class="text-center">
	<Heading tag="h1" class="mb-4 text-4xl font-extrabold  md:text-5xl lg:text-6xl">
		My AI Chat UI
	</Heading>

	<div class="p-8">
		{#if $page.data.session}
			<Alert>
				<p class="mt-2 mb-4 text-sm">
					<small>Signed in as</small><br />
					<strong>{$page.data.session.user?.name ?? 'User'}</strong>
				</p>
				<SignOut>
					<Button slot="submitButton">Sign out <ArrowRightOutline class="ms-2 h-6 w-6" /></Button>
				</SignOut>
			</Alert>
		{:else}
			<Alert color="green">
				<p class="mt-2 mb-4 text-sm">You are not signed in</p>
				<SignIn provider="descope">
					<Button size="xs" color="green" slot="submitButton"
						>Sign in <ArrowRightOutline class="ms-2 h-6 w-6" /></Button
					>
				</SignIn>
			</Alert>
		{/if}
	</div>
</div>
