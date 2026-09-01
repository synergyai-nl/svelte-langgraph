<script lang="ts">
	/**
	 * `<LangGraph>` here (see `+page.svelte`) is given no `activeThreadId`/`onThreadChange`, so it
	 * runs in uncontrolled ("internal") thread-selection mode — the point of the demo: a
	 * router-free embed has no URL to read a thread id from or push one into. Something still has
	 * to create the first thread, though, so this component does it on mount. Must be a child of
	 * `<LangGraph>` to read its context — same constraint as `routes/chat/ThreadListSidebar.svelte`.
	 *
	 * `ctx.createThread()` both creates the thread AND selects it (`LangGraphContext#createThread`
	 * calls `selectThread` internally), so `ChatSurface` below picks it up on its own via its
	 * existing fallback to `ctx.activeThreadId` — no `threadId` prop needs to be threaded through
	 * here.
	 */
	import ChatSurface from '$lib/components/chat/ChatSurface.svelte';
	import ChatLoader from '$lib/components/ChatLoader.svelte';
	import { useLangGraphOptional } from '$lib/components/chat/langGraphContext.svelte.js';

	const ctx = useLangGraphOptional();

	// Gated on `!ctx.createThreadError`, not just `!ctx.creatingThread`: without it, a failed
	// creation would retry on every reactive tick forever (`creatingThread` flips false again,
	// `activeThreadId` is still null, so the condition would immediately go true again). The error
	// surfaces below instead, with a manual retry.
	$effect(() => {
		if (ctx?.client && !ctx.activeThreadId && !ctx.creatingThread && !ctx.createThreadError) {
			ctx.createThread();
		}
	});
</script>

{#if ctx?.error}
	<p class="text-destructive p-4 text-sm" role="alert">
		Something went wrong: {ctx.error instanceof Error ? ctx.error.message : String(ctx.error)}
	</p>
{:else if ctx?.createThreadError}
	<div class="flex h-full flex-col items-center justify-center gap-2 p-4 text-sm">
		<p class="text-destructive" role="alert">Couldn't start a new chat.</p>
		<button type="button" class="underline" onclick={() => ctx?.createThread()}>Try again</button>
	</div>
{:else if ctx?.assistantId && ctx?.client}
	<!-- Same gate `routes/chat/[threadID]/+page.svelte` uses before rendering `<ChatSurface>`:
	     `activeThreadId` above can go true (thread created) before assistant resolution — a
	     separate, independently-async effect inside `<LangGraph>` — finishes, and `<Conversation>`
	     throws if mounted without a resolved `assistantId`. -->
	<ChatSurface
		introTitle="Embedded chat demo"
		intro="This <ChatSurface> is mounted with no sidebar and no router — drop it into any container."
	/>
{:else}
	<ChatLoader />
{/if}
