/**
 * Frontend-driven thread titling (SLG-117): triggers a separate, stateless run of the `"title"`
 * graph and writes the result into thread metadata, once, the first time a thread has a
 * complete opening exchange and no title yet.
 */
import type { Client } from '@langchain/langgraph-sdk';
import { extractTextFromContent } from './utils';

type RawMessage = Record<string, unknown>;

/**
 * First human message + first non-empty AI message, in that order — the opening exchange a
 * thread's topic is derived from. Returns fewer than 2 entries while incomplete (e.g. no AI
 * reply yet). `messages` is `unknown[]` and cast internally since `stream.messages`'s real SDK
 * type has no index signature.
 */
export function selectOpeningExchange(messages: readonly unknown[]): RawMessage[] {
	const items = messages as readonly RawMessage[];
	const human = items.find((m) => m.type === 'human');
	const ai = items.find((m) => m.type === 'ai' && extractTextFromContent(m.content).length > 0);
	return [human, ai].filter((m): m is RawMessage => m != null);
}

export interface ThreadTitlerOptions {
	client: Client;
	threadId: string;
	/** Lazily resolves the "title" graph's assistant id; caching is the caller's job. */
	resolveTitleAssistantId: () => Promise<string>;
	/** Called once, right after a title is freshly written to thread metadata. */
	onTitled?: () => void;
}

export interface ThreadTitler {
	/**
	 * Trigger titling from `messages` (raw SDK message objects, i.e. `stream.messages`). Safe to
	 * call on every settle/backfill: no-ops unless there's a complete opening exchange, and
	 * single-flights per mount.
	 */
	ensureThreadTitle(messages: readonly unknown[]): Promise<void>;
}

/**
 * Two accepted residual races, left as-is: (a) a concurrent rename landing in the brief
 * re-check->PATCH window (the title run itself is bracketed by a fresh `threads.get`), and
 * (b) two tabs both generating for the same untitled thread — harmless, since temperature=0
 * makes the titles near-identical and the second PATCH a same-value write.
 */
export function createThreadTitler({
	client,
	threadId,
	resolveTitleAssistantId,
	onTitled
}: ThreadTitlerOptions): ThreadTitler {
	let running = false;
	let knownTitled = false;

	async function hasStoredTitle(): Promise<boolean> {
		const thread = await client.threads.get(threadId);
		const storedTitle = thread.metadata?.title;
		return typeof storedTitle === 'string' && storedTitle.length > 0;
	}

	async function ensureThreadTitle(messages: readonly unknown[]): Promise<void> {
		if (running || knownTitled) return;
		const exchange = selectOpeningExchange(messages);
		if (exchange.length < 2) return;

		running = true;
		try {
			// Write-only-when-absent: user renames and other clients always win.
			if (await hasStoredTitle()) {
				knownTitled = true;
				return;
			}

			const assistantId = await resolveTitleAssistantId();
			const result = await client.runs.wait(null, assistantId, { input: { messages: exchange } });
			const title = (result as { title?: unknown } | null)?.title;
			if (typeof title === 'string' && title.length > 0) {
				// Re-check: the title run takes seconds, plenty of time for a rename to land.
				if (await hasStoredTitle()) {
					knownTitled = true;
					return;
				}
				await client.threads.update(threadId, { metadata: { title } });
				knownTitled = true;
				onTitled?.();
			}
			// Empty/null title: fall through to `finally`, which resets `running` so the next
			// trigger (e.g. a later settle) retries.
		} catch {
			// Cosmetic feature — never surface as a chat error. `running` reset below lets retry.
		} finally {
			running = false;
		}
	}

	return { ensureThreadTitle };
}
