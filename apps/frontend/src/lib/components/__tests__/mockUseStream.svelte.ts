/**
 * Reactive mock state for `useStream` and `useMessageMetadata`, using Svelte 5 $state so that
 * components re-render when helpers mutate it in tests.
 */

// Loose function type for mock callbacks that don't care about their arguments
type AnyFn = (...args: unknown[]) => unknown;

export const mockStreamCallbacks: {
	submit: AnyFn;
	stop: () => void;
} = {
	submit: () => {},
	stop: () => {}
};

/** What `useMessageMetadata` reports for a message id. */
export interface MockMessageMetadata {
	optimisticStatus?: 'pending' | 'sent' | 'failed';
}

let _messages = $state<Record<string, unknown>[]>([]);
let _isLoading = $state(false);
let _isThreadLoading = $state(false);
let _error = $state<unknown>(null);
let _values = $state<Record<string, unknown>>({});
let _metadata = $state<Record<string, MockMessageMetadata>>({});

export const mockStream = {
	get messages() {
		return _messages;
	},
	get isLoading() {
		return _isLoading;
	},
	get isThreadLoading() {
		return _isThreadLoading;
	},
	get error() {
		return _error;
	},
	get values() {
		return _values;
	},
	get submit() {
		return mockStreamCallbacks.submit;
	},
	get stop() {
		return mockStreamCallbacks.stop;
	}
};

type ChannelEvent = { method: string; params: { data: unknown } };
// A plain list: the listeners are callbacks, not state a component renders.
const channelListeners: Array<(event: ChannelEvent) => void> = [];

/** Delivers a server `values` event to every `useChannelEffect` listener. */
export function emitValues(data: Record<string, unknown>) {
	for (const listener of channelListeners) listener({ method: 'values', params: { data } });
}

/**
 * Stand-ins for the `@langchain/svelte` composables `Conversation` uses besides `useStream`:
 * `useMessageMetadata` reads `setMetadata`'s entries, `useChannelEffect` gets `emitValues`'s events.
 */
export const mockSelectors = {
	useMessageMetadata(_stream: unknown, getId: () => string | undefined) {
		return {
			get current() {
				const id = getId();
				return id === undefined ? undefined : _metadata[id];
			}
		};
	},
	useChannelEffect(
		_stream: unknown,
		_channels: unknown,
		{ onEvent }: { onEvent: (event: ChannelEvent) => void }
	) {
		channelListeners.push(onEvent);
	}
};

export function setMetadata(id: string, metadata: MockMessageMetadata) {
	_metadata = { ..._metadata, [id]: metadata };
}

export function setMessages(msgs: Record<string, unknown>[]) {
	_messages = [...msgs];
}

export function setIsLoading(val: boolean) {
	_isLoading = val;
}

export function setIsThreadLoading(val: boolean) {
	_isThreadLoading = val;
}

export function setError(err: unknown) {
	_error = err;
}

export function setValues(vals: Record<string, unknown>) {
	_values = { ...vals };
}

export function resetMock() {
	_messages = [];
	_isLoading = false;
	_isThreadLoading = false;
	_error = null;
	_values = {};
	_metadata = {};
	channelListeners.length = 0;
	mockStreamCallbacks.submit = () => {};
	mockStreamCallbacks.stop = () => {};
}
