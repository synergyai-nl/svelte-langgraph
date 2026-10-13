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
		files: ['src/**/*.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				...['Literal[value=/\\bprose\\b/]', 'TemplateElement[value.raw=/\\bprose\\b/]'].map(
					(selector) => ({
						selector,
						message:
							'Do not select chat messages by `prose` classes (they match user bubbles too); use the ChatSurfacePage message locators instead.'
					})
				)
			]
		}
	}
);
