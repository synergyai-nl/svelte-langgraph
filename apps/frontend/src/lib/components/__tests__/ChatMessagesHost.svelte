<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import ChatMessages from '../ChatMessages.svelte';
	import type { ComponentProps } from 'svelte';

	let props: ComponentProps<typeof ChatMessages> = $props();
</script>

<!--
	renderWithProviders' TestProviders wraps components in a `{ component, props }` shape, but
	testing-library's `rerender` unwraps any argument with a `props` key (its deprecated
	`rerender({ props: {...} })` form) — colliding with TestProviders' own `props` field and
	silently discarding updates. This host spreads ChatMessages' props directly so rerender()
	can update them without hitting that collision.
-->
<Tooltip.Provider>
	<ChatMessages {...props} />
</Tooltip.Provider>
