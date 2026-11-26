import { InvalidData } from './errors';
import type { Message, UserMessage, AIMessage, ToolMessage } from './types';

/**
 * Extracts plain text from a LangGraph message content field.
 * Handles string content (legacy) and array content blocks (thinking-capable models).
 */
export function extractTextFromContent(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.filter(
				(b): b is { type: 'text'; text: string } => b?.type === 'text' && typeof b.text === 'string'
			)
			.map((b) => b.text)
			.join('');
	}
	return '';
}

/**
 * Extracts thinking/reasoning text from a LangGraph message.
 * Checks additional_kwargs.reasoning_content first (OpenAI/OpenRouter/LiteLLM format),
 * then checks the content array for reasoning/thinking blocks (langchain v1 standard /
 * Anthropic-native formats).
 */
export function extractThinkingFromContent(
	content: unknown,
	additionalKwargs?: Record<string, unknown>
): string | undefined {
	if (
		typeof additionalKwargs?.reasoning_content === 'string' &&
		additionalKwargs.reasoning_content
	) {
		return additionalKwargs.reasoning_content;
	}

	if (Array.isArray(content)) {
		const thinking = content
			.filter(
				(b): b is { type: 'reasoning' | 'thinking'; reasoning?: unknown; thinking?: unknown } =>
					b?.type === 'reasoning' || b?.type === 'thinking'
			)
			.map((b) => {
				const value = b.reasoning ?? b.thinking;
				return typeof value === 'string' ? value : '';
			})
			.join('');
		return thinking || undefined;
	}

	return undefined;
}

const TOOL_CALL_BLOCKS = new Set(['tool_call', 'tool_use', 'tool_call_chunk']);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * The calls an AI message makes, from its content blocks, `tool_calls`, `tool_call_chunks` and
 * `invalid_tool_calls`. Expects a message as the SDK hands it over (`@langchain/core` fields), not
 * a raw dict with calls only in `additional_kwargs.tool_calls`. While a message streams, its
 * `tool_calls` covers only the chunks still arriving, and a chunk whose arguments do not parse
 * moves to `invalid_tool_calls`, so all four are read to keep a listed call listed. A call is
 * listed once it has an id and a name: a tool result names its call by id, so a call without one
 * (`ToolCall.id` is optional) cannot be matched to its result; a streaming call may get it later.
 */
function extractToolCalls(item: Record<string, unknown>): { id: string; name: string }[] {
	const blocks = asArray(item.content).filter((b) =>
		TOOL_CALL_BLOCKS.has((b as { type?: string })?.type ?? '')
	);
	const calls = new Map<string, string>();
	// Blocks first: they keep the order the calls were made in while one is still streaming.
	const sources = [item.tool_calls, item.tool_call_chunks, item.invalid_tool_calls];
	for (const c of [...blocks, ...sources.flatMap(asArray)]) {
		const { id, name } = (c ?? {}) as { id?: unknown; name?: unknown };
		if (typeof id === 'string' && id && typeof name === 'string' && name && !calls.has(id))
			calls.set(id, name);
	}
	return [...calls].map(([id, name]) => ({ id, name }));
}

export function convertThreadMessage(item: Record<string, unknown>): Message {
	if (item.type === 'human') {
		return {
			type: 'user',
			text: typeof item.content === 'string' ? item.content : '',
			id: (item.id as string) || crypto.randomUUID()
		} as UserMessage;
	} else if (item.type === 'ai') {
		const additionalKwargs = item.additional_kwargs as Record<string, unknown> | undefined;
		const text = extractTextFromContent(item.content);
		const thinking = extractThinkingFromContent(item.content, additionalKwargs);
		const responseMetadata = item.response_metadata as Record<string, unknown> | undefined;
		const toolCalls = extractToolCalls(item);
		return {
			type: 'ai',
			text,
			id: (item.id as string) || crypto.randomUUID(),
			...(thinking ? { thinking } : {}),
			...(toolCalls.length ? { toolCalls } : {}),
			// A generated id would name nothing the backend knows.
			...(item.id && typeof responseMetadata?.run_id === 'string' ? { rateable: true } : {})
		} as AIMessage;
	} else if (item.type === 'tool') {
		return {
			type: 'tool',
			text: typeof item.content === 'string' ? item.content : '',
			tool_name: (item.name as string) || '',
			id: (item.tool_call_id as string) || (item.id as string) || '',
			status: (item.status as 'success' | 'error') || 'success'
		} as ToolMessage;
	}
	throw new InvalidData(`Unexpected message type: ${item.type}`, item);
}
