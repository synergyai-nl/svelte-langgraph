<script lang="ts">
	import LoginModal from '$lib/components/LoginModal.svelte';

	let show_login_dialog = $state(true);
</script>

<LoginModal bind:open={show_login_dialog} />
