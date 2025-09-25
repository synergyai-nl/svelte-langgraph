import { getLocale, locales } from '$lib/paraglide/runtime.js';
import { writable } from 'svelte/store';

export const locale = writable(getLocale());

// Export available locales for the language switcher
export const availableLocales = locales;
