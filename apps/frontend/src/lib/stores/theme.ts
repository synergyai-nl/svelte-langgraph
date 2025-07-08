import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark' | 'system';

// Create the theme store
function createThemeStore() {
	const { subscribe, set, update } = writable<Theme>('system');

	return {
		subscribe,
		setTheme: (theme: Theme) => {
			set(theme);
			if (browser) {
				document.cookie = `theme=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
				localStorage.setItem('theme', theme);
				applyTheme(theme);
			}
		},
		initTheme: () => {
			if (!browser) return;
			
			// Try to get theme from cookie first, then localStorage, then system preference
			const cookieTheme = getCookieValue('theme') as Theme;
			const localTheme = localStorage.getItem('theme') as Theme;
			const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
			
			const savedTheme = cookieTheme || localTheme || systemTheme;
			set(savedTheme);
			applyTheme(savedTheme);
		}
	};
}

export const theme = createThemeStore();

// Apply theme to document
function applyTheme(currentTheme: Theme) {
	if (!browser) return;
	
	const html = document.documentElement;
	const isDarkMode = currentTheme === 'dark' || 
		(currentTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
	
	if (isDarkMode) {
		html.classList.add('dark');
	} else {
		html.classList.remove('dark');
	}
}

// Helper function to get cookie value
function getCookieValue(name: string): string | null {
	if (!browser) return null;
	
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);
	if (parts.length === 2) {
		return parts.pop()?.split(';').shift() || null;
	}
	return null;
}

// Listen for system theme changes
if (browser) {
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		theme.subscribe(currentTheme => {
			if (currentTheme === 'system') {
				applyTheme('system');
			}
		})();
	});
}
