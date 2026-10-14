import { env } from '$env/dynamic/public';

/**
 * The configured backend base, with exactly one trailing slash so relative
 * routes resolve beneath it rather than replacing its last path segment.
 */
function baseUrl(): URL {
	const configured = env.PUBLIC_LANGGRAPH_API_URL?.trim();
	if (!configured) throw Error('Required PUBLIC_LANGGRAPH_API_URL is undefined');

	// Absolute only: the SDK and a bare fetch() resolve a relative value differently.
	let url: URL;
	try {
		url = new URL(configured);
	} catch {
		throw Error(`PUBLIC_LANGGRAPH_API_URL must be absolute, got "${configured}"`);
	}
	if (url.search || url.hash)
		throw Error('PUBLIC_LANGGRAPH_API_URL must not carry a query or fragment');

	url.pathname = url.pathname.replace(/\/*$/, '/');
	return url;
}

/** The backend base URL, for the SDK client. */
export function apiUrl(): string {
	return baseUrl().href;
}

/** A custom backend route, e.g. `apiEndpoint('feedback')`. */
export function apiEndpoint(route: string): string {
	// A leading slash would resolve from the origin and drop any base path.
	if (route.startsWith('/')) throw Error(`Route must be relative, got "${route}"`);
	return new URL(route, baseUrl()).href;
}
