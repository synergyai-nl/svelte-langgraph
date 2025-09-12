import { sentrySvelteKit } from '@sentry/sveltekit';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		}),
		sentrySvelteKit()
	],
	test: {
		projects: [
			{
				test: {
					name: 'client',
					environment: 'jsdom',
					setupFiles: ['./vitest-setup-client.ts'],
					clearMocks: true,
					include: ['src/**/*.svelte.{spec,test}.{js,ts}'],
					exclude: [
						'src/lib/server/**',
						'e2e/**',
						'**/*.e2e.{spec,test}.{js,ts}',
						'src/**/*.server.{spec,test}.{js,ts}'
					]
				},
				plugins: [
					tailwindcss(),
					sveltekit(),
					paraglideVitePlugin({
						project: './project.inlang',
						outdir: './src/lib/paraglide'
					}),
					svelteTesting() // This was missing proper placement
				]
			},
			{
				test: {
					name: 'server',
					environment: 'node',
					clearMocks: true,
					include: ['src/**/*.{spec,test}.{js,ts}'],
					exclude: ['src/**/*.svelte.{spec,test}.{js,ts}', 'e2e/**', '**/*.e2e.{spec,test}.{js,ts}']
				},
				plugins: [
					tailwindcss(),
					sveltekit(),
					paraglideVitePlugin({
						project: './project.inlang',
						outdir: './src/lib/paraglide'
					})
				]
			}
		]
	},
	resolve: {
		alias: {
			async_hooks: './src/lib/async_hooks_mock.ts'
		}
	}
});
