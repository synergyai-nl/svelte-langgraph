/**
 * Await a direct title request and write the result to the originating thread.
 * The request belongs to this component's lifetime; no background run is created.
 */
import type { Client } from '@langchain/langgraph-sdk';
import { extractTextFromContent } from './utils';

type RawMessage = Record<string, unknown>;

export interface TitleMessage {
	type: 'human' | 'ai';
	content: string;
}

export interface TitleClient extends Client {
	generateTitle(messages: TitleMessage[], signal: AbortSignal): Promise<{ title: string | null }>;
}

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
	client: TitleClient;
	threadId: string;
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
	dispose(): void;
}

async function hasStoredTitle(client: TitleClient, threadId: string): Promise<boolean> {
	const thread = await client.threads.get(threadId);
	const storedTitle = thread.metadata?.title;
	return typeof storedTitle === 'string' && storedTitle.length > 0;
}

async function attemptTitle(
	{ client, threadId }: ThreadTitlerOptions,
	exchange: RawMessage[],
	signal: AbortSignal
): Promise<'stored' | 'written' | null> {
	if (await hasStoredTitle(client, threadId)) return 'stored';
	if (signal.aborted) return null;

	const result = await client.generateTitle(
		exchange.map((message) => ({
			type: message.type as TitleMessage['type'],
			content: extractTextFromContent(message.content)
		})),
		signal
	);
	const title = (result as { title?: unknown } | null)?.title;
	if (signal.aborted || typeof title !== 'string' || title.length === 0) return null;

	// Preserve renames made during generation. A rename can still race the final GET-to-PATCH
	// window, and separate tabs can generate and write different titles concurrently.
	if (await hasStoredTitle(client, threadId)) return 'stored';
	if (signal.aborted) return null;
	await client.threads.update(threadId, { metadata: { title } });
	return 'written';
}

export function createThreadTitler({
	client,
	threadId,
	onTitled
}: ThreadTitlerOptions): ThreadTitler {
	let running = false;
	let knownTitled = false;
	const controller = new AbortController();

	async function ensureThreadTitle(messages: readonly unknown[]): Promise<void> {
		if (controller.signal.aborted || running || knownTitled) return;
		const exchange = selectOpeningExchange(messages);
		if (exchange.length < 2) return;

		running = true;
		try {
			const outcome = await attemptTitle({ client, threadId }, exchange, controller.signal);
			knownTitled = outcome !== null;
			if (outcome === 'written' && !controller.signal.aborted) onTitled?.();
		} catch {
			// Cosmetic feature — never surface as a chat error. `running` reset below lets retry.
		} finally {
			running = false;
		}
	}

	return { ensureThreadTitle, dispose: () => controller.abort() };
}
