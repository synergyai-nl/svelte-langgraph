import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

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
	},
	{
		// SLG-164: AI and user bubbles BOTH carry Tailwind's `prose` typography classes, so a
		// class-based selector can match the user's own message and pass with no AI reply.
		// Locate messages through ChatSurfacePage (`chat.aiMessages`, `expectAiReply`, …),
		// which uses the app's `data-message-type` attribute.
		//
		// The pattern only matches CSS selector syntax — a `.prose…` class selector (`.prose`,
		// `.prose-invert`, `div.prose`, `:not(.prose-invert)`) or a `[class…prose…]` attribute
		// selector — so string/template literals that merely contain the word "prose" (test
		// titles, prompts) are not flagged.
		files: ['src/**/*.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				...[
					'Literal[value=/\\.prose\\b|\\[class[^\\]]*prose/]',
					'TemplateElement[value.raw=/\\.prose\\b|\\[class[^\\]]*prose/]'
				].map((selector) => ({
					selector,
					message:
						'Do not select chat messages by `prose` classes (they match user bubbles too); use the ChatSurfacePage message locators instead.'
				}))
			]
		}
	}
);
