export type AuthFailure = 'AUTH_REQUIRED' | 'AUTH_REFRESH_FAILED' | 'AUTH_UNAVAILABLE';
type TokenResult = { accessToken: string } | { status: number; code: AuthFailure };

/** Each waiter can cancel independently while the shared lookup finishes for other callers. */
function waitFor<T>(pending: Promise<T>, signal?: AbortSignal | null): Promise<T> {
	if (!signal) return pending;
	signal.throwIfAborted();
	return new Promise((resolve, reject) => {
		const abort = () => {
			cleanup();
			reject(signal.reason);
		};
		const cleanup = () => signal.removeEventListener('abort', abort);
		signal.addEventListener('abort', abort, { once: true });
		pending.then(
			(value) => {
				cleanup();
				resolve(value);
			},
			(error) => {
				cleanup();
				reject(error);
			}
		);
	});
}

export function createAuthenticatedFetch({
	backendUrl,
	onAuthState,
	fetch: nativeFetch = globalThis.fetch
}: {
	backendUrl: string;
	onAuthState: (failure: AuthFailure | null) => void;
	fetch?: typeof globalThis.fetch;
}) {
	const backend = new URL(backendUrl);
	let pending: Promise<TokenResult> | undefined;
	let lookupController: AbortController | undefined;
	let disposed = false;

	async function lookup(): Promise<TokenResult> {
		const controller = new AbortController();
		lookupController = controller;
		const timeout = setTimeout(() => controller.abort(), 5000);
		try {
			const response = await nativeFetch('/api/backend-token', {
				method: 'POST',
				credentials: 'same-origin',
				cache: 'no-store',
				signal: controller.signal
			});
			const body = await response.json();
			if (
				response.ok &&
				typeof body.accessToken === 'string' &&
				body.accessToken &&
				Date.parse(body.expiresAt) > Date.now()
			) {
				return { accessToken: body.accessToken };
			}
			const code: AuthFailure =
				response.status === 401
					? body.code === 'AUTH_REFRESH_FAILED'
						? 'AUTH_REFRESH_FAILED'
						: 'AUTH_REQUIRED'
					: 'AUTH_UNAVAILABLE';
			if (!disposed) onAuthState(code);
			return { status: response.status === 401 ? 401 : 503, code };
		} catch {
			if (!disposed) onAuthState('AUTH_UNAVAILABLE');
			return { status: 503, code: 'AUTH_UNAVAILABLE' };
		} finally {
			clearTimeout(timeout);
			lookupController = undefined;
		}
	}

	function token(): Promise<TokenResult> {
		if (disposed) return Promise.reject(new DOMException('Transport disposed', 'AbortError'));
		return (pending ??= lookup().finally(() => {
			pending = undefined;
		}));
	}

	const authenticatedFetch: typeof globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		const destination = new URL(request.url);
		const prefix = backend.pathname.replace(/\/$/, '');
		if (
			destination.origin !== backend.origin ||
			!(destination.pathname === prefix || destination.pathname.startsWith(`${prefix}/`))
		) {
			throw new Error('Refusing to send backend credentials to another destination');
		}
		request.signal.throwIfAborted();
		const result = await waitFor(token(), request.signal);
		request.signal.throwIfAborted();
		if (disposed) throw new DOMException('Transport disposed', 'AbortError');
		if ('code' in result) return Response.json({ code: result.code }, { status: result.status });
		const headers = new Headers(request.headers);
		headers.set('Authorization', `Bearer ${result.accessToken}`);
		const response = await nativeFetch(
			new Request(request, { headers, credentials: 'omit', redirect: 'error' })
		);
		if (response.status === 401 && !disposed) onAuthState('AUTH_REQUIRED');
		return response;
	};

	return {
		fetch: authenticatedFetch,
		retry: async () => {
			const recovered = 'accessToken' in (await token());
			// Background requests cannot establish that a previously failed operation recovered.
			if (recovered && !disposed) onAuthState(null);
			return recovered;
		},
		dispose() {
			disposed = true;
			lookupController?.abort();
		}
	};
}
