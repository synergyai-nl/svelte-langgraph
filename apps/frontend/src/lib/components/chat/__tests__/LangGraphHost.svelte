<script lang="ts">
	/**
	 * Generic `<LangGraph>` context stub for mounting a single chat component under test.
	 *
	 * Mounting the real `<LangGraph>` provider drags in real client/assistant resolution
	 * (`createClient`, `getOrCreateAssistant`) and its wiring effects — more than most component
	 * tests need. This host instead constructs (or accepts a pre-built) `LangGraphContext` and sets
	 * it directly via `setLangGraphContext`, then renders `component` with every other prop
	 * forwarded verbatim — so a test can spy on `ctx.threadList.refresh`/`ctx.setThreadLoading`/etc.
	 * *before* mounting, by building its own `LangGraphContext` and passing it as `ctx`.
	 *
	 * `component`/`ctx` are pulled out of the props bag and everything else is spread onto the
	 * inner component directly (not nested under a `props` key, unlike `TestProviders`) — so
	 * `rerender({ threadId: 'new-id' })` on this host's render result works without the key
	 * collision `ChatMessagesHost.svelte` documents for the nested shape.
	 *
	 * Always wraps `Tooltip.Provider` + `Sidebar.Provider`, mirroring `LangGraph.svelte`'s own
	 * wrapper — needed by `ThreadList` (rendered by `ChatSurface`'s `sidebar` prop) and harmless for
	 * components that don't touch sidebar context.
	 */
	import * as Tooltip from '$lib/components/ui/tooltip';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { LangGraphContext, setLangGraphContext } from '../langGraphContext.svelte.js';
	import type { Component } from 'svelte';

	interface HostProps {
		/** Pre-built context (e.g. with client/assistantId/spies already wired up). Falls back to a fresh, empty one. */
		ctx?: LangGraphContext;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		component: Component<any>;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let { ctx: ctxProp, component: Inner, ...innerProps }: HostProps & Record<string, any> = $props();

	const ctx = ctxProp ?? new LangGraphContext();
	setLangGraphContext(ctx);
</script>

<Tooltip.Provider>
	<Sidebar.Provider>
		<Inner {...innerProps} />
	</Sidebar.Provider>
</Tooltip.Provider>
