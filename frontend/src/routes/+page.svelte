<script>
	import { SignIn, SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/stores';

	import { Alert } from 'flowbite-svelte';
</script>

<h1>SvelteKit Auth Example</h1>
<div class="p-8">
	{#if $page.data.session}
		<Alert>
			<span class="font-medium">Info alert!</span>
			<span class="signedInText">
				<small>Signed in as</small><br />
				<strong>{$page.data.session.user?.name ?? 'User'}</strong>
			</span>
		</Alert>

		<SignOut>
			<div slot="submitButton" class="buttonPrimary">Sign out</div>
		</SignOut>
	{:else}
		<Alert>
			<span class="font-medium">Info alert!</span>
			<span class="notSignedInText">You are not signed in</span>
		</Alert>

		<SignIn>
			<div slot="submitButton" class="buttonPrimary">Sign in</div>
		</SignIn>

		<SignIn provider="descope" />
	{/if}
</div>
