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

const TOOL_CALL_BLOCKS = ['tool_call', 'tool_use', 'tool_call_chunk'];
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * The calls an AI message makes, from its content blocks, then `tool_calls`. On the stream the
 * SDK sets `content` to its blocks and derives `tool_calls` and the chunks from them, but while a
 * call streams `tool_calls` covers only the chunks, so a call finished before it is read from its
 * block; a stored message's `tool_calls` is complete. `invalid_tool_calls` is not read: no tool
 * answers such a call. Expects messages as the SDK hands them over, not raw dicts with calls only
 * in `additional_kwargs`. A call is listed once it has an id and a name: a tool result names its
 * call by id, so an id-less call cannot be matched to its result.
 */
function extractToolCalls(item: Record<string, unknown>): { id: string; name: string }[] {
	const blocks = asArray(item.content).filter((b) =>
		TOOL_CALL_BLOCKS.includes((b as { type?: string })?.type ?? '')
	);
	const calls = new Map<string, string>();
	for (const c of [...blocks, ...asArray(item.tool_calls)]) {
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
