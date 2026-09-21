export type AuthFailure = 'AUTH_REQUIRED' | 'AUTH_REFRESH_FAILED' | 'AUTH_UNAVAILABLE';
type TokenResult = { accessToken: string } | { status: number; code: AuthFailure };

interface AuthenticatedFetchOptions {
	backendUrl: string;
	onAuthState: (failure: AuthFailure | null) => void;
	fetch?: typeof globalThis.fetch;
}

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

function tokenFailure(status: number, body: Record<string, unknown>): TokenResult {
	const code: AuthFailure =
		status === 401
			? body.code === 'AUTH_REFRESH_FAILED'
				? 'AUTH_REFRESH_FAILED'
				: 'AUTH_REQUIRED'
			: 'AUTH_UNAVAILABLE';
	return { status: status === 401 ? 401 : 503, code };
}

function tokenResult(response: Response, body: Record<string, unknown>): TokenResult {
	const accessToken = body.accessToken;
	const expiresAt = body.expiresAt;
	if (!response.ok) return tokenFailure(response.status, body);
	if (typeof accessToken !== 'string' || !accessToken) return tokenFailure(response.status, body);
	if (typeof expiresAt !== 'string') return tokenFailure(response.status, body);
	const expiry = Date.parse(expiresAt);
	if (!Number.isFinite(expiry) || expiry <= Date.now()) return tokenFailure(response.status, body);
	return { accessToken };
}

function assertBackendDestination(destination: URL, backend: URL): void {
	const prefix = backend.pathname.replace(/\/$/, '');
	const matchesPath =
		destination.pathname === prefix || destination.pathname.startsWith(`${prefix}/`);
	if (destination.origin !== backend.origin || !matchesPath) {
		throw new Error('Refusing to send backend credentials to another destination');
	}
}

class AuthenticatedTransport {
	readonly #backend: URL;
	readonly #onAuthState: (failure: AuthFailure | null) => void;
	readonly #nativeFetch: typeof globalThis.fetch;
	#pending: Promise<TokenResult> | undefined;
	#lookupController: AbortController | undefined;
	#disposed = false;

	constructor({ backendUrl, onAuthState, fetch = globalThis.fetch }: AuthenticatedFetchOptions) {
		this.#backend = new URL(backendUrl);
		this.#onAuthState = onAuthState;
		this.#nativeFetch = fetch;
	}

	readonly fetch: typeof globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		assertBackendDestination(new URL(request.url), this.#backend);
		request.signal.throwIfAborted();
		const result = await waitFor(this.#token(), request.signal);
		request.signal.throwIfAborted();
		if (this.#disposed) throw new DOMException('Transport disposed', 'AbortError');
		if ('code' in result) return Response.json({ code: result.code }, { status: result.status });

		const headers = new Headers(request.headers);
		headers.set('Authorization', `Bearer ${result.accessToken}`);
		const response = await this.#nativeFetch(
			new Request(request, { headers, credentials: 'omit', redirect: 'error' })
		);
		if (response.status === 401) this.#notify('AUTH_REQUIRED');
		return response;
	};

	async retry(): Promise<boolean> {
		const recovered = 'accessToken' in (await this.#token());
		// Background requests cannot establish that a previously failed operation recovered.
		if (recovered) this.#notify(null);
		return recovered;
	}

	dispose(): void {
		this.#disposed = true;
		this.#lookupController?.abort();
	}

	#notify(failure: AuthFailure | null): void {
		if (!this.#disposed) this.#onAuthState(failure);
	}

	async #lookup(): Promise<TokenResult> {
		const controller = new AbortController();
		this.#lookupController = controller;
		try {
			const response = await this.#nativeFetch('/api/backend-token', {
				method: 'POST',
				credentials: 'same-origin',
				cache: 'no-store',
				signal: controller.signal
			});
			const body = (await response.json()) as Record<string, unknown>;
			const result = tokenResult(response, body);
			if ('code' in result) this.#notify(result.code);
			return result;
		} catch {
			this.#notify('AUTH_UNAVAILABLE');
			return { status: 503, code: 'AUTH_UNAVAILABLE' };
		} finally {
			this.#lookupController = undefined;
		}
	}

	#token(): Promise<TokenResult> {
		if (this.#disposed) return Promise.reject(new DOMException('Transport disposed', 'AbortError'));
		return (this.#pending ??= this.#lookup().finally(() => {
			this.#pending = undefined;
		}));
	}
}

export function createAuthenticatedFetch(options: AuthenticatedFetchOptions) {
	const transport = new AuthenticatedTransport(options);
	return {
		fetch: transport.fetch,
		retry: () => transport.retry(),
		dispose: () => transport.dispose()
	};
}
