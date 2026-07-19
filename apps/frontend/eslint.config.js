import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript-eslint';

/**
 * Resolve a sibling of this config file, falling back to the invocation cwd.
 *
 * qlty's eslint driver runs a staged copy of this config from its tool cache
 * (with cwd set at the real project dir), so import.meta.url can point at a
 * directory that doesn't contain our siblings; conversely, invoking eslint
 * from the repo root makes bare process.cwd() resolution wrong. Prefer the
 * config file's own directory whenever the sibling actually exists there.
 */
const configDir = path.dirname(fileURLToPath(import.meta.url));
function resolveSibling(name) {
	const candidate = path.join(configDir, name);
	return fs.existsSync(candidate) ? candidate : path.resolve(process.cwd(), name);
}

const gitignorePath = resolveSibling('.gitignore');

/*
 * svelte.config.js imports build-only packages (e.g. @sveltejs/adapter-node)
 * that aren't installed in qlty's eslint sandbox; a failed import must not
 * take down linting. eslint-plugin-svelte treats svelteConfig as an optional
 * hint (falling back to its own static analysis of the config file), so
 * degrade to undefined instead.
 */
let svelteConfig;
try {
	svelteConfig = (await import(pathToFileURL(resolveSibling('svelte.config.js')).href)).default;
} catch (err) {
	if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
}

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: { 'no-undef': 'off' }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
