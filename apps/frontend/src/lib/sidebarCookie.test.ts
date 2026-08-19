import { describe, it, expect } from 'vitest';
import { parseSidebarCookie } from './sidebarCookie.js';

describe('parseSidebarCookie', () => {
	it('returns null when the cookie is absent', () => {
		expect(parseSidebarCookie('')).toBeNull();
		expect(parseSidebarCookie('other=1; another=2')).toBeNull();
	});

	it('returns true for an explicit "true" value', () => {
		expect(parseSidebarCookie('sidebar_state=true')).toBe(true);
	});

	it('returns false for an explicit "false" value', () => {
		expect(parseSidebarCookie('sidebar_state=false')).toBe(false);
	});

	it('resolves a present-but-unrecognised value to true, not null', () => {
		// Parity with the server's `cookies.get(SIDEBAR_COOKIE_NAME) !== 'false'`: only an
		// explicit "false" collapses the sidebar. A stricter `=== 'true'` check here would make
		// server and client disagree on a garbage cookie.
		expect(parseSidebarCookie('sidebar_state=garbage')).toBe(true);
	});

	it('finds the cookie among several, tolerating leading spaces', () => {
		expect(parseSidebarCookie('other=1; sidebar_state=false; another=2')).toBe(false);
		expect(parseSidebarCookie('  other=1;   sidebar_state=false  ;  another=2')).toBe(false);
	});

	it('does not match a cookie whose name merely ends with sidebar_state', () => {
		expect(parseSidebarCookie('other_sidebar_state=false')).toBeNull();
	});
});
