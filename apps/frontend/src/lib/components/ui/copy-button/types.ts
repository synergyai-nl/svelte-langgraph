import type { Snippet } from 'svelte';
import type { ButtonSize, ButtonVariant } from '../button';
import type { UseClipboard } from '../../../hooks/use-clipboard.svelte';

export type CopyButtonProps = {
	ref?: HTMLButtonElement | null;
	text: string;
	size?: ButtonSize;
	variant?: ButtonVariant;
	icon?: Snippet<[]>;
	animationDuration?: number;
	onCopy?: (status: UseClipboard['status']) => void;
	class?: string;
	tabindex?: number;
	children?: Snippet;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
};
