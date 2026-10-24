/**
 * How long before expiry the backend token counts as expired. The browser fetches a new token
 * inside this window, and the token endpoint refreshes with the provider inside it, so a request
 * never leaves with a token that could expire in flight. Shared by both; no server code here.
 */
export const SKEW_MS = 30_000;
