import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { fly } from 'svelte/transition';
import { renderWithProviders } from './__tests__/render';
import ChatMessagesHost from './__tests__/ChatMessagesHost.svelte';
import ChatMessages from './ChatMessages.svelte';
import { aUserMessage } from './__tests__/fixtures';

vi.mock('svelte/transition', async (importOriginal) => {
	const actual = await importOriginal<typeof import('svelte/transition')>();
	return { ...actual, fly: vi.fn(actual.fly) };
});

const WINDOW_CHUNK_SIZE = 40;

function messagesFixture(count: number, offset = 0) {
	return Array.from({ length: count }, (_, i) =>
		aUserMessage({ id: `msg-${offset + i}`, text: `Message number ${offset + i}` })
	);
}

function baseProps(overrides: Record<string, unknown> = {}) {
	return {
		messages: [],
		finalAnswerStarted: true,
		onEdit: vi.fn(),
		onRegenerate: vi.fn(),
		...overrides
	};
}

function renderMessages(overrides: Record<string, unknown> = {}) {
	return renderWithProviders(ChatMessages, baseProps(overrides));
}

// renderWithProviders' TestProviders wraps components as `{ component, props }`, which trips
// testing-library's rerender() — it treats any argument with a `props` key as its deprecated
// `rerender({ props: {...} })` form and silently unwraps it, discarding the update. Tests that
// need to update props after mount use ChatMessagesHost instead, which spreads ChatMessages'
// props directly so rerender() sees them as top-level props.
function renderMessagesForRerender(overrides: Record<string, unknown> = {}) {
	return render(ChatMessagesHost, baseProps(overrides));
}

// jsdom does not provide requestAnimationFrame; stub it onto setTimeout so the reveal chain's
// $effect can drain deterministically under fake timers.
beforeEach(() => {
	vi.useFakeTimers();
	vi.stubGlobal(
		'requestAnimationFrame',
		(cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number
	);
	vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('ChatMessages chunked hydration', () => {
	// Rendering 130 markdown-parsed messages is genuinely slow in jsdom; a generous timeout
	// keeps this stable when the suite runs alongside builds (moon check).
	test(
		'renders only the newest chunk synchronously for a large backlog, then reveals the rest',
		{ timeout: 15000 },
		async () => {
			const messages = messagesFixture(130);
			renderMessages({ messages });

			expect(screen.getByText('Message number 129')).toBeInTheDocument();
			expect(screen.getByText('Message number 90')).toBeInTheDocument();
			expect(screen.queryByText('Message number 89')).not.toBeInTheDocument();
			expect(screen.queryByText('Message number 0')).not.toBeInTheDocument();

			await vi.runAllTimersAsync();
			await tick();

			// Sentinels across the reveal chunks; per-message assertions over the full list
			// would dominate the test's runtime for no extra coverage.
			for (const i of [0, 45, 89, 90, 129]) {
				expect(screen.getByText(`Message number ${i}`)).toBeInTheDocument();
			}
			expect(screen.getAllByText(/^Message number \d+$/)).toHaveLength(130);
		}
	);

	test('a message appended mid-expansion is immediately visible', async () => {
		const messages = messagesFixture(130);
		const { rerender } = renderMessagesForRerender({ messages });

		expect(screen.queryByText('Message number 0')).not.toBeInTheDocument();

		const appended = [...messages, aUserMessage({ id: 'msg-130', text: 'Message number 130' })];
		await rerender(baseProps({ messages: appended }));
		await tick();

		expect(screen.getByText('Message number 130')).toBeInTheDocument();
		// still mid-expansion — the backlog before the append hasn't fully revealed yet
		expect(screen.queryByText('Message number 0')).not.toBeInTheDocument();
	});

	test('shrinking messages below the initial count mid-expansion snaps to full reveal', async () => {
		const messages = messagesFixture(130);
		const { rerender } = renderMessagesForRerender({ messages });

		expect(screen.queryByText('Message number 0')).not.toBeInTheDocument();

		const shrunk = messages.slice(0, 5);
		await rerender(baseProps({ messages: shrunk }));
		await tick();

		for (let i = 0; i < 5; i++) {
			expect(screen.getByText(`Message number ${i}`)).toBeInTheDocument();
		}
	});

	test('renders everything synchronously when at or under the chunk size', () => {
		const messages = messagesFixture(WINDOW_CHUNK_SIZE);
		renderMessages({ messages });

		for (let i = 0; i < WINDOW_CHUNK_SIZE; i++) {
			expect(screen.getByText(`Message number ${i}`)).toBeInTheDocument();
		}
	});
});

describe('ChatMessages transition gating', () => {
	test('backlog rows mount with no intro animation; a later appended row animates in', async () => {
		const flyMock = vi.mocked(fly);
		// One more than the chunk size so revealFrom starts > 0 — this keeps the trailing
		// error/waiting slot's own transition (which follows revealFrom, not isBacklog) at
		// duration 0 too, so every call at mount is uniformly backlog.
		const messages = messagesFixture(WINDOW_CHUNK_SIZE + 1);
		const { rerender } = renderMessagesForRerender({ messages });
		await tick();

		expect(flyMock.mock.calls.length).toBeGreaterThan(0);
		expect(flyMock.mock.calls.every(([, params]) => params?.duration === 0)).toBe(true);

		flyMock.mockClear();

		const appended = [
			...messages,
			aUserMessage({
				id: `msg-${WINDOW_CHUNK_SIZE + 1}`,
				text: `Message number ${WINDOW_CHUNK_SIZE + 1}`
			})
		];
		await rerender(baseProps({ messages: appended }));
		await tick();

		const appendedCall = flyMock.mock.calls.find(([, params]) => params?.duration === 800);
		expect(appendedCall).toBeDefined();
	});
});
