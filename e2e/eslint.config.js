import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import globals from 'globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';

/*
 * Prefer the config file's own directory when the sibling exists there
 * (correct when eslint is invoked from the repo root or another cwd), and
 * fall back to the invocation cwd for qlty's eslint driver, which runs a
 * staged copy of this config from its tool cache with cwd at the project dir.
 */
const configDir = path.dirname(fileURLToPath(import.meta.url));
const siblingGitignore = path.join(configDir, '.gitignore');
const gitignorePath = fs.existsSync(siblingGitignore)
	? siblingGitignore
	: path.resolve(process.cwd(), '.gitignore');

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: { 'no-undef': 'off' }
	}
);
