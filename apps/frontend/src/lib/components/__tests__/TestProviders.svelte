<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { Component } from 'svelte';

	interface Props {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		component: Component<any>;
		props: Record<string, unknown>;
	}

	let { component: Inner, props: componentProps }: Props = $props();
</script>

<Tooltip.Provider>
	<Inner {...componentProps} />
</Tooltip.Provider>
