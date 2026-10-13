import { expect, type Locator } from '@playwright/test';

/** Mirrors `Message.type` in `@svelte-langgraph/client`. */
export type MessageType = 'ai' | 'user' | 'tool';

/**
 * ChatSurfacePage encapsulates one mounted chat surface — composer plus message list —
 * scoped to any container `Locator`: `app.main` on `/chat` (see `ChatPage`, which extends
 * this), or an embedding card such as `/demo/embedded`'s.
 *
 * Messages are located by the `data-message-type` attribute ChatMessage/ChatToolMessage
 * render from `message.type`, never by styling classes: AI and user bubbles BOTH carry
 * Tailwind's `.prose`, so a class-based "AI reply" locator also matches the user's own
 * bubble and lets a spec pass with no reply at all. The e2e ESLint config forbids
 * reintroducing `.prose` selectors.
 */
export class ChatSurfacePage {
	readonly root: Locator;

	// Composer
	readonly textInput: Locator;
	// Icon-only composer buttons, located by accessible name (English default labels).
	readonly sendButton: Locator;
	readonly stopButton: Locator;

	// Message list
	/** Every rendered message, whatever its type. */
	readonly messages: Locator;
	readonly aiMessages: Locator;
	readonly userMessages: Locator;
	readonly toolMessages: Locator;
	/** The newest rendered AI message (including a reasoning-only one). */
	readonly lastAiMessage: Locator;

	constructor(root: Locator) {
		this.root = root;

		this.textInput = root.getByRole('textbox', { name: 'Ask your agent…' });
		this.sendButton = root.getByRole('button', { name: 'Send message' });
		this.stopButton = root.getByRole('button', { name: 'Stop generating' });

		this.messages = root.locator('[data-message-type]');
		this.aiMessages = this.messagesOfType('ai');
		this.userMessages = this.messagesOfType('user');
		this.toolMessages = this.messagesOfType('tool');
		this.lastAiMessage = this.aiMessages.last();
	}

	messagesOfType(type: MessageType): Locator {
		return this.root.locator(`[data-message-type="${type}"]`);
	}

	/** AI messages whose text contains `text`. */
	aiMessage(text: string | RegExp): Locator {
		return this.aiMessages.filter({ hasText: text });
	}

	/** The user's own messages whose text contains `text`. */
	userMessage(text: string | RegExp): Locator {
		return this.userMessages.filter({ hasText: text });
	}

	/**
	 * Asserts the run actually produced a reply: an AI message containing `text` becomes
	 * visible, then the composer input is re-enabled (run finished). The ai-mock backend
	 * echoes the user's input, so callers typically pass (the head of) what they sent.
	 *
	 * `timeout` applies to each wait; the default tolerates first-token latency against a
	 * freshly-started backend. Returns the newest matching AI message.
	 */
	async expectAiReply(
		text: string | RegExp,
		{ timeout = 30_000 }: { timeout?: number } = {}
	): Promise<Locator> {
		const reply = this.aiMessage(text).last();
		await expect(reply).toBeVisible({ timeout });
		await expect(this.textInput).toBeEnabled({ timeout });
		return reply;
	}
}
