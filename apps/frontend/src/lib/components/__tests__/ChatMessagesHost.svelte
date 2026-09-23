<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import MessagesList from '../chat/MessagesList.svelte';
	import type { ComponentProps } from 'svelte';

	let props: ComponentProps<typeof MessagesList> = $props();
</script>

<!--
	renderWithProviders' TestProviders wraps components in a `{ component, props }` shape, but
	testing-library's `rerender` unwraps any argument with a `props` key (its deprecated
	`rerender({ props: {...} })` form) — colliding with TestProviders' own `props` field and
	silently discarding updates. This host spreads MessagesList's props directly so rerender()
	can update them without hitting that collision.
-->
<Tooltip.Provider>
	<MessagesList {...props} />
</Tooltip.Provider>
