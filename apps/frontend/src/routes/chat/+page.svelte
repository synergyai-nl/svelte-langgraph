<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SignIn } from '@auth/sveltekit/components';
	import { redirect } from '@sveltejs/kit';
	import { Button, Heading, Modal, P } from 'flowbite-svelte';
	import { ExclamationCircleOutline } from 'flowbite-svelte-icons';
	import { onMount } from 'svelte';

	let show_login_dialog = $state(false);

	onMount(() => {
		if (!page.data.session) show_login_dialog = true;
	});
</script>

<!-- Smooth conditional login modal -->
<Modal
	title="Login required"
	size="xs"
	bind:open={show_login_dialog}
	onclose={() => {
		goto('/');
	}}
>
	<div class="text-center">
		<ExclamationCircleOutline class="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-200" />
		<h3 class="mb-5 text-lg font-normal text-gray-500 dark:text-gray-400">
			Please sign in to continue.
		</h3>
		<SignIn provider="descope">
			<Button slot="submitButton" size="sm">Sign in</Button>
		</SignIn>
	</div>
</Modal>

<Heading>Welcome to the chat</Heading>
<P>I'm a cookie monster.</P>
