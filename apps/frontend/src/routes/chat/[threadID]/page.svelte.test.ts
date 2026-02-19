import { describe, test, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/svelte';
import { renderWithProviders } from '$lib/components/__tests__/render';
import type { Client, Thread } from '@langchain/langgraph-sdk';
import type { ThreadValues } from '$lib/langgraph/types';
import type { Session } from '@auth/sveltekit';

// Mock $app/state BEFORE imports (Vitest requirement)
const mockPage = {
	data: {
		session: null as Session | null
	},
	params: {
		threadID: 'thread-123'
	}
};

vi.mock('$app/state', () => ({
	page: mockPage
}));

// Mock LangGraph client functions
vi.mock('$lib/langgraph/client', () => ({
	createClient: vi.fn(),
	getOrCreateAssistant: vi.fn()
}));

// Mock i18n messages - must support both direct and namespace imports
const mockMessages = {
	chat_suggestion_0_title: vi.fn(() => 'Suggestion 0'),
	chat_suggestion_0_description: vi.fn(() => 'Desc 0'),
	chat_suggestion_0_text: vi.fn(() => 'Text 0'),
	chat_suggestion_1_title: vi.fn(() => 'Suggestion 1'),
	chat_suggestion_1_description: vi.fn(() => 'Desc 1'),
	chat_suggestion_1_text: vi.fn(() => 'Text 1'),
	chat_suggestion_2_title: vi.fn(() => 'Suggestion 2'),
	chat_suggestion_2_description: vi.fn(() => 'Desc 2'),
	chat_suggestion_2_text: vi.fn(() => 'Text 2'),
	chat_suggestion_3_title: vi.fn(() => 'Suggestion 3'),
	chat_suggestion_3_description: vi.fn(() => 'Desc 3'),
	chat_suggestion_3_text: vi.fn(() => 'Text 3'),
	chat_greeting_hello: vi.fn(({ name }: { name: string }) => `Hello, ${name}!`),
	chat_greeting_anonymous: vi.fn(() => 'Hello!'),
	chat_intro: vi.fn(() => 'How can I help?'),
	chat_input_placeholder: vi.fn(() => 'Message...'),
	login_modal_title: vi.fn(() => 'Sign In Required'),
	login_modal_message: vi.fn(() => 'Please sign in to continue'),
	auth_sign_in: vi.fn(() => 'Sign In'),
	error_try_again: vi.fn(() => 'Try Again'),
	error_return_home: vi.fn(() => 'Return Home')
};

vi.mock('$lib/paraglide/messages.js', () => ({
	...mockMessages,
	// Support namespace import (import * as m)
	m: mockMessages
}));

// Mock SvelteKit error function - don't throw since it's called from async effects
// and would cause unhandled rejections. We verify it was called with correct args.
const svelteKitError = vi.fn();

vi.mock('@sveltejs/kit', () => ({
	error: svelteKitError
}));

// Import AFTER mocking
const { createClient, getOrCreateAssistant } = await import('$lib/langgraph/client');
const PageComponent = (await import('./+page.svelte')).default;

// Mock data fixtures
const mockSession: Session = {
	user: {
		name: 'Test User',
		email: 'test@example.com',
		image: null
	},
	accessToken: 'mock-access-token',
	expires: '2099-01-01'
};

const mockClient = {
	threads: {
		get: vi.fn()
	}
} as unknown as Client;

const mockThread: Thread<ThreadValues> = {
	thread_id: 'thread-123',
	created_at: '2024-01-01',
	updated_at: '2024-01-01',
	metadata: {},
	status: 'idle',
	values: { messages: [] },
	interrupts: {}
};

// Helper functions
function renderChatPage(overrides: { session?: Session | null; threadID?: string } = {}) {
	const config = {
		session: mockSession,
		threadID: 'thread-123',
		...overrides
	};

	// Configure page store mock
	mockPage.data.session = config.session;
	mockPage.params.threadID = config.threadID;

	return renderWithProviders(PageComponent, {});
}

function mockSuccessfulInit(
	assistantId = 'assistant-1',
	thread: Thread<ThreadValues> = mockThread
) {
	vi.mocked(createClient).mockReturnValue(mockClient);
	vi.mocked(getOrCreateAssistant).mockResolvedValue(assistantId);
	vi.mocked(mockClient.threads.get).mockResolvedValue(thread);
}

function mockInitError(errorMessage = 'Init failed') {
	vi.mocked(createClient).mockReturnValue(mockClient);
	vi.mocked(getOrCreateAssistant).mockRejectedValue(new Error(errorMessage));
}

describe('Chat Thread Page', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		svelteKitError.mockClear();
	});

	describe('when initializing', () => {
		test('displays ChatLoader while waiting for assistant', async () => {
			vi.mocked(createClient).mockReturnValue(mockClient);
			vi.mocked(getOrCreateAssistant).mockImplementation(
				() => new Promise(() => {}) // Never resolves
			);

			renderChatPage();

			// ChatLoader displays loading skeletons with animate-pulse class
			const loadingElements = document.querySelectorAll('.animate-pulse');
			expect(loadingElements.length).toBeGreaterThan(0);
		});
	});

	describe('when successfully initialized', () => {
		beforeEach(() => {
			mockSuccessfulInit();
			renderChatPage();
		});

		test('displays Chat component', async () => {
			await waitFor(() => {
				expect(screen.getByPlaceholderText('Message...')).toBeInTheDocument();
			});
		});

		test('calls getOrCreateAssistant with correct args', async () => {
			await waitFor(() => {
				expect(getOrCreateAssistant).toHaveBeenCalledWith(mockClient, 'chat');
			});
		});

		test('fetches thread by ID from params', async () => {
			await waitFor(() => {
				expect(mockClient.threads.get).toHaveBeenCalledWith('thread-123');
			});
		});
	});

	describe('when initialization fails', () => {
		test('calls SvelteKit error on assistant creation failure', async () => {
			mockInitError('Assistant error');
			renderChatPage();

			await waitFor(() => {
				expect(svelteKitError).toHaveBeenCalledWith(500, {
					message: 'Error during generation'
				});
			});
		});

		test('calls SvelteKit error on thread fetch failure', async () => {
			vi.mocked(createClient).mockReturnValue(mockClient);
			vi.mocked(getOrCreateAssistant).mockResolvedValue('assistant-1');
			vi.mocked(mockClient.threads.get).mockRejectedValue(new Error('Thread error'));

			renderChatPage();

			await waitFor(() => {
				expect(svelteKitError).toHaveBeenCalledWith(500, {
					message: 'Error during generation'
				});
			});
		});
	});

	describe('when unauthenticated', () => {
		beforeEach(() => {
			renderChatPage({ session: null });
		});

		test('shows login dialog', () => {
			expect(screen.getByRole('dialog')).toBeVisible();
		});

		test('does not initialize client', () => {
			expect(createClient).not.toHaveBeenCalled();
		});

		test('does not fetch assistant or thread', () => {
			expect(getOrCreateAssistant).not.toHaveBeenCalled();
			expect(mockClient.threads.get).not.toHaveBeenCalled();
		});
	});

	describe('when thread ID changes', () => {
		test('fetches correct thread from route params', async () => {
			mockSuccessfulInit();
			renderChatPage({ threadID: 'custom-thread-456' });

			await waitFor(() => {
				expect(mockClient.threads.get).toHaveBeenCalledWith('custom-thread-456');
			});
		});
	});
});
