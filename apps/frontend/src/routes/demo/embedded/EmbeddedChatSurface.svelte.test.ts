import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

import LangGraphHost from '$lib/components/chat/__tests__/LangGraphHost.svelte';
import { makeContext, makeMockClient } from '$lib/components/chat/__tests__/testContext.js';
import EmbeddedChatSurface from './EmbeddedChatSurface.svelte';

describe('EmbeddedChatSurface', () => {
	it('creates the first thread on mount, exactly once', async () => {
		const ctx = makeContext({ client: makeMockClient(), assistantId: 'asst-1' });
		const createThread = vi.spyOn(ctx, 'createThread').mockResolvedValue(false);

		render(LangGraphHost, { ctx, component: EmbeddedChatSurface });

		await waitFor(() => expect(createThread).toHaveBeenCalledTimes(1));
	});

	it('does not attempt creation without a client', async () => {
		const ctx = makeContext();
		const createThread = vi.spyOn(ctx, 'createThread');

		render(LangGraphHost, { ctx, component: EmbeddedChatSurface });

		await waitFor(() => expect(createThread).not.toHaveBeenCalled());
	});

	it('surfaces a failed creation with a retry, without auto-retry looping', async () => {
		const create = vi.fn().mockRejectedValue(new Error('boom'));
		const ctx = makeContext({
			client: makeMockClient({ threads: { create } }),
			assistantId: 'asst-1'
		});

		render(LangGraphHost, { ctx, component: EmbeddedChatSurface });

		const alert = await screen.findByText("Couldn't start a new chat.");
		expect(alert).toBeInTheDocument();
		// The mount effect is gated on `!ctx.createThreadError`: the failure must not put it in
		// a create → fail → create loop.
		expect(create).toHaveBeenCalledTimes(1);

		await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
		await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
	});

	it('offers a retry when assistant resolution failed', async () => {
		const ctx = makeContext({ client: makeMockClient(), assistantId: 'asst-1' });
		ctx.setError(new Error('resolution timed out'));
		vi.spyOn(ctx, 'createThread').mockResolvedValue(false);
		const retryResolution = vi.spyOn(ctx, 'retryResolution');

		render(LangGraphHost, { ctx, component: EmbeddedChatSurface });

		expect(screen.getByRole('alert')).toHaveTextContent('resolution timed out');
		await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
		expect(retryResolution).toHaveBeenCalledTimes(1);
	});
});
