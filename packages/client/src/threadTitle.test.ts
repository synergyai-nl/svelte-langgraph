import { describe, it, expect } from 'vitest';
import { selectOpeningExchange } from './threadTitle';

describe('selectOpeningExchange', () => {
	it('returns the first human message and first non-empty AI message, in order', () => {
		const messages = [
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' }
		];

		expect(selectOpeningExchange(messages)).toEqual(messages);
	});

	it('returns fewer than 2 entries when the AI reply has not arrived yet', () => {
		const messages = [{ type: 'human', content: 'Hello', id: 'user-1' }];

		expect(selectOpeningExchange(messages)).toEqual(messages);
	});

	it('skips an empty-content AI message (e.g. a tool-call-only turn) for a later non-empty one', () => {
		const messages = [
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: '', id: 'ai-1', tool_calls: [{ id: 'tc-1' }] },
			{ type: 'tool', content: 'tool result', id: 'tool-1' },
			{ type: 'ai', content: 'Here is the answer', id: 'ai-2' }
		];

		expect(selectOpeningExchange(messages)).toEqual([
			messages[0],
			{ type: 'ai', content: 'Here is the answer', id: 'ai-2' }
		]);
	});

	it('ignores later human/ai messages beyond the opening exchange', () => {
		const messages = [
			{ type: 'human', content: 'Hello', id: 'user-1' },
			{ type: 'ai', content: 'Hi there!', id: 'ai-1' },
			{ type: 'human', content: 'A follow-up', id: 'user-2' },
			{ type: 'ai', content: 'Another reply', id: 'ai-2' }
		];

		expect(selectOpeningExchange(messages)).toEqual([messages[0], messages[1]]);
	});

	it('returns an empty array with no messages', () => {
		expect(selectOpeningExchange([])).toEqual([]);
	});
});
