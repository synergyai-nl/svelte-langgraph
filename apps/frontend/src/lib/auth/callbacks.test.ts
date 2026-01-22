import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the config module
vi.mock('./config', () => ({
	getProviderConfig: vi.fn()
}));

import { getProviderConfig } from './config';
import type { Session } from '@auth/sveltekit';
import type { JWT } from '@auth/core/jwt';

// Mock config values
const mockConfig = {
	clientId: 'test-client-id',
	clientSecret: 'test-client-secret',
	issuer: 'https://auth.example.com'
};

// Mock discovery response
const discoveryResponse = {
	token_endpoint: 'https://auth.example.com/oauth/token'
};

// Mock token refresh response
const tokenRefreshResponse = {
	id_token: 'new-id-token-xyz',
	expires_in: 3600,
	refresh_token: 'new-refresh-token'
};

describe('sessionCallback', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('should add id_token as accessToken when present', async () => {
		const { sessionCallback } = await import('./callbacks');

		const session = { user: { name: 'Test User' } } as Session;
		const token = { id_token: 'test-id-token-abc' } as JWT;

		const result = await sessionCallback({ session, token });

		expect(result).toEqual({
			user: { name: 'Test User' },
			accessToken: 'test-id-token-abc'
		});
	});

	it('should return session unchanged when no id_token', async () => {
		const { sessionCallback } = await import('./callbacks');

		const session = { user: { name: 'Test User' } } as Session;
		const token = { sub: 'user-123' } as JWT;

		const result = await sessionCallback({ session, token });

		expect(result).toBe(session);
	});
});

describe('JWTCallback', () => {
	const originalFetch = global.fetch;
	let mockFetch: ReturnType<typeof vi.fn>;
	let dateNowSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetModules();
		mockFetch = vi.fn();
		global.fetch = mockFetch;
		vi.mocked(getProviderConfig).mockReturnValue(mockConfig);
	});

	afterEach(() => {
		global.fetch = originalFetch;
		dateNowSpy?.mockRestore();
	});

	describe('initial login (account present)', () => {
		it('should create token with id_token, expires_at, refresh_token', async () => {
			const { JWTCallback } = await import('./callbacks');

			// Mock Date.now to return a fixed timestamp
			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token = { sub: 'user-123' } as JWT;
			const account = {
				id_token: 'initial-id-token',
				expires_in: 3600,
				refresh_token: 'initial-refresh-token',
				provider: 'oidc',
				providerAccountId: 'user-123',
				type: 'oidc' as const
			};

			const result = await JWTCallback({ token, account });

			expect(result).toEqual({
				sub: 'user-123',
				id_token: 'initial-id-token',
				expires_at: 1700000000 + 3600, // Date.now() / 1000 + expires_in
				refresh_token: 'initial-refresh-token'
			});
		});

		it('should throw when account.expires_in is undefined', async () => {
			const { JWTCallback } = await import('./callbacks');

			const token = { sub: 'user-123' } as JWT;
			const account = {
				id_token: 'initial-id-token',
				expires_in: undefined,
				refresh_token: 'initial-refresh-token',
				provider: 'oidc',
				providerAccountId: 'user-123',
				type: 'oidc' as const
			};

			await expect(JWTCallback({ token, account })).rejects.toThrow(
				'Account has no expiration set.'
			);
		});
	});

	describe('token validation (no account)', () => {
		it('should return token unchanged when not expired', async () => {
			const { JWTCallback } = await import('./callbacks');

			// Set current time
			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token = {
				sub: 'user-123',
				id_token: 'valid-id-token',
				expires_at: 1700000000 + 3600, // expires in the future
				refresh_token: 'valid-refresh-token'
			} as JWT;

			const result = await JWTCallback({ token, account: null });

			expect(result).toBe(token);
		});

		it('should throw when expires_at is not a number', async () => {
			const { JWTCallback } = await import('./callbacks');

			const token = {
				sub: 'user-123',
				id_token: 'valid-id-token',
				expires_at: 'not-a-number',
				refresh_token: 'valid-refresh-token'
			} as unknown as JWT;

			await expect(JWTCallback({ token, account: null })).rejects.toThrow(
				'Token has no expiration set.'
			);
		});
	});

	describe('token refresh (expired token)', () => {
		it('should refresh token and return new values', async () => {
			const { JWTCallback } = await import('./callbacks');

			// Token expired 10 seconds ago
			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token = {
				sub: 'user-123',
				id_token: 'old-id-token',
				expires_at: 1700000000 - 10, // expired 10 seconds ago
				refresh_token: 'valid-refresh-token'
			} as JWT;

			// Mock fetch for discovery and token refresh
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(discoveryResponse)
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(tokenRefreshResponse)
				});

			const result = await JWTCallback({ token, account: null });

			expect(result).toEqual({
				sub: 'user-123',
				id_token: 'new-id-token-xyz',
				expires_at: 1700000000 + 3600,
				refresh_token: 'new-refresh-token'
			});

			// Verify discovery fetch
			expect(mockFetch).toHaveBeenCalledWith(
				'https://auth.example.com/.well-known/openid-configuration'
			);

			// Verify token refresh fetch
			expect(mockFetch).toHaveBeenCalledWith('https://auth.example.com/oauth/token', {
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: expect.any(URLSearchParams),
				method: 'POST'
			});

			// Verify the body params
			const refreshCall = mockFetch.mock.calls[1];
			const body = refreshCall[1].body as URLSearchParams;
			expect(body.get('client_id')).toBe('test-client-id');
			expect(body.get('client_secret')).toBe('test-client-secret');
			expect(body.get('grant_type')).toBe('refresh_token');
			expect(body.get('refresh_token')).toBe('valid-refresh-token');
		});

		it('should keep original refresh_token if not in response', async () => {
			const { JWTCallback } = await import('./callbacks');

			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token = {
				sub: 'user-123',
				id_token: 'old-id-token',
				expires_at: 1700000000 - 10,
				refresh_token: 'original-refresh-token'
			} as JWT;

			// Response without refresh_token
			const responseWithoutRefreshToken = {
				id_token: 'new-id-token-xyz',
				expires_in: 3600
			};

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(discoveryResponse)
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(responseWithoutRefreshToken)
				});

			const result = await JWTCallback({ token, account: null });

			expect(result.refresh_token).toBe('original-refresh-token');
		});

		it('should return token with error flag on refresh request failure', async () => {
			const { JWTCallback } = await import('./callbacks');

			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token = {
				sub: 'user-123',
				id_token: 'old-id-token',
				expires_at: 1700000000 - 10,
				refresh_token: 'valid-refresh-token'
			} as JWT;

			// Discovery succeeds, but token refresh fails
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(discoveryResponse)
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 401,
					statusText: 'Unauthorized'
				});

			const result = await JWTCallback({ token, account: null });

			expect(result).toEqual({
				...token,
				error: 'RefreshAccessTokenError'
			});
		});

		it('should return token with error flag when refresh_token is missing', async () => {
			const { JWTCallback } = await import('./callbacks');

			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token = {
				sub: 'user-123',
				id_token: 'old-id-token',
				expires_at: 1700000000 - 10
				// No refresh_token
			} as JWT;

			const result = await JWTCallback({ token, account: null });

			expect(result).toEqual({
				...token,
				error: 'RefreshAccessTokenError'
			});
		});

		it('should return token with error flag when response id_token is invalid', async () => {
			const { JWTCallback } = await import('./callbacks');

			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token = {
				sub: 'user-123',
				id_token: 'old-id-token',
				expires_at: 1700000000 - 10,
				refresh_token: 'valid-refresh-token'
			} as JWT;

			const invalidResponse = {
				id_token: 12345, // Should be string
				expires_in: 3600
			};

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(discoveryResponse)
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(invalidResponse)
				});

			const result = await JWTCallback({ token, account: null });

			expect(result).toEqual({
				...token,
				error: 'RefreshAccessTokenError'
			});
		});

		it('should return token with error flag when response expires_in is invalid', async () => {
			const { JWTCallback } = await import('./callbacks');

			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token = {
				sub: 'user-123',
				id_token: 'old-id-token',
				expires_at: 1700000000 - 10,
				refresh_token: 'valid-refresh-token'
			} as JWT;

			const invalidResponse = {
				id_token: 'new-id-token',
				expires_in: 'not-a-number' // Should be number
			};

			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(discoveryResponse)
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(invalidResponse)
				});

			const result = await JWTCallback({ token, account: null });

			expect(result).toEqual({
				...token,
				error: 'RefreshAccessTokenError'
			});
		});

		it('should cache token endpoint between calls', async () => {
			// Import once to share the module state
			const { JWTCallback } = await import('./callbacks');

			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token1 = {
				sub: 'user-123',
				id_token: 'old-id-token-1',
				expires_at: 1700000000 - 10,
				refresh_token: 'refresh-token-1'
			} as JWT;

			const token2 = {
				sub: 'user-456',
				id_token: 'old-id-token-2',
				expires_at: 1700000000 - 10,
				refresh_token: 'refresh-token-2'
			} as JWT;

			// First call: discovery + token refresh
			// Second call: only token refresh (cached discovery)
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(discoveryResponse)
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(tokenRefreshResponse)
				})
				.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(tokenRefreshResponse)
				});

			await JWTCallback({ token: token1, account: null });
			await JWTCallback({ token: token2, account: null });

			// Discovery should only be called once
			const discoveryCalls = mockFetch.mock.calls.filter((call) =>
				call[0].includes('.well-known/openid-configuration')
			);
			expect(discoveryCalls).toHaveLength(1);

			// Token refresh should be called twice
			const tokenCalls = mockFetch.mock.calls.filter((call) => call[0].includes('/oauth/token'));
			expect(tokenCalls).toHaveLength(2);
		});

		it('should return token with error flag when discovery endpoint fails', async () => {
			const { JWTCallback } = await import('./callbacks');

			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token = {
				sub: 'user-123',
				id_token: 'old-id-token',
				expires_at: 1700000000 - 10,
				refresh_token: 'valid-refresh-token'
			} as JWT;

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error'
			});

			const result = await JWTCallback({ token, account: null });

			expect(result).toEqual({
				...token,
				error: 'RefreshAccessTokenError'
			});
		});

		it('should return token with error flag when token_endpoint from discovery is invalid', async () => {
			const { JWTCallback } = await import('./callbacks');

			dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

			const token = {
				sub: 'user-123',
				id_token: 'old-id-token',
				expires_at: 1700000000 - 10,
				refresh_token: 'valid-refresh-token'
			} as JWT;

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ token_endpoint: null }) // Invalid
			});

			const result = await JWTCallback({ token, account: null });

			expect(result).toEqual({
				...token,
				error: 'RefreshAccessTokenError'
			});
		});
	});
});
