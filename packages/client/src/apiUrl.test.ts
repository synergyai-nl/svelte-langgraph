import { describe, test, expect } from 'vitest';
import { apiEndpoint, normalizeApiUrl } from './apiUrl';

describe('normalizeApiUrl', () => {
	test.each([
		['no trailing slash', 'https://backend.test', 'https://backend.test/'],
		['one trailing slash', 'https://backend.test/', 'https://backend.test/'],
		['several trailing slashes', 'https://backend.test///', 'https://backend.test/'],
		['surrounding whitespace', '  https://backend.test/  ', 'https://backend.test/'],
		['a base path', 'https://backend.test/api', 'https://backend.test/api/'],
		['a port', 'http://localhost:2026', 'http://localhost:2026/']
	])('normalises %s', (_label, configured, expected) => {
		expect(normalizeApiUrl(configured)).toBe(expected);
	});

	test.each([
		['unset', undefined],
		['empty', ''],
		['whitespace only', '   '],
		// Relative: the SDK reads these as "use your default host" and a bare
		// fetch as "same origin", so one value would send requests to two places.
		['a lone slash', '/'],
		['only slashes', '//'],
		['no scheme', 'backend.test'],
		['an absolute path', '/api'],
		// Routes resolve against the path, so these would be silently dropped.
		['a query', 'https://backend.test/?x=1'],
		['a fragment', 'https://backend.test/#top']
	])('refuses %s', (_label, configured) => {
		expect(() => normalizeApiUrl(configured)).toThrow(/LangGraph API URL/);
	});
});

describe('apiEndpoint', () => {
	test.each([
		['https://backend.test', 'https://backend.test/feedback'],
		['https://backend.test//', 'https://backend.test/feedback'],
		// Without the base's trailing slash, URL resolution would replace "api".
		['https://backend.test/api', 'https://backend.test/api/feedback']
	])('resolves a route under %s', (configured, expected) => {
		expect(apiEndpoint(configured, 'feedback')).toBe(expected);
	});

	test('refuses a rooted route, which would drop the base path', () => {
		expect(() => apiEndpoint('https://backend.test', '/feedback')).toThrow(/relative/);
	});
});
