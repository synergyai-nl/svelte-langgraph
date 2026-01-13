<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		onclick?: (event: MouseEvent) => void;
	}

	let { children, onclick }: Props = $props();

	let formElement: HTMLFormElement;

	function handleClick(event: MouseEvent) {
		onclick?.(event);
		formElement?.requestSubmit();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			formElement?.requestSubmit();
		}
	}
</script>

<form bind:this={formElement} method="POST" action="/signout" use:enhance style="display: none;">
	<input type="hidden" name="redirectTo" value="/" />
	<input type="hidden" name="redirect" value="true" />
</form>

<div role="button" tabindex="0" onclick={handleClick} onkeydown={handleKeyDown}>
	{@render children()}
</div>
