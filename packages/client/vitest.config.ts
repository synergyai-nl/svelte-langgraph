import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'client',
					environment: 'jsdom',
					include: ['src/**/*.svelte.{spec,test}.{js,ts}']
				},
				plugins: [svelte()]
			},
			{
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{spec,test}.{js,ts}'],
					exclude: ['src/**/*.svelte.{spec,test}.{js,ts}']
				},
				plugins: [svelte()]
			}
		]
	}
});
