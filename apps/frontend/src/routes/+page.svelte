<script>
	import { SignIn, SignOut } from '@auth/sveltekit/components';
	import { page } from '$app/stores';

	import { ArrowRightOutline } from 'flowbite-svelte-icons';
	import { Alert, Button, Heading } from 'flowbite-svelte';
</script>

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
