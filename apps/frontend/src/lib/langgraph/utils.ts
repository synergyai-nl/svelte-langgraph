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
		return {
			type: 'ai',
			text,
			id: (item.id as string) || crypto.randomUUID(),
			...(thinking ? { thinking } : {})
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
