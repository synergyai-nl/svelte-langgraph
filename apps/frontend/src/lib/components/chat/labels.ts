import type { ThreadListLabels } from './ThreadList/ThreadList.svelte';
import type { ComposerLabels } from './Composer.svelte';
import type { MessagesListLabels } from './MessagesList.svelte';
import type { ChatMessageLabels } from './ChatMessage.svelte';
import type { ChatToolMessageLabels } from './ChatToolMessage.svelte';
import type { ChatErrorMessageLabels } from './ChatErrorMessage.svelte';
import type { ThinkingBlockLabels } from './ThinkingBlock.svelte';
import type { AIMessageActionsLabels } from './AIMessageActions.svelte';
import type { UserMessageActionsLabels } from './UserMessageActions.svelte';
import type { UserMessageEditLabels } from './UserMessageEdit.svelte';
import type { FeedbackButtonsLabels } from './FeedbackButtons.svelte';

/**
 * Recursively-optional version of a labels type, so a caller can override a single nested
 * string without restating an entire scope.
 */
export type DeepPartial<T> = {
	[K in keyof T]?: T[K] extends (...args: never[]) => unknown
		? T[K]
		: T[K] extends object
			? DeepPartial<T[K]>
			: T[K];
};

/**
 * Aggregates every chat component's labels under one type, keyed by component name. Every
 * component resolves its own scope independently (see `resolveLabels`); this type exists so a
 * single object — today assembled from localized message strings at the route/`Chat.svelte`
 * level, eventually a `<LangGraph>` context value (PR 3) — can describe overrides for the whole
 * tree at once, regardless of how deeply a component is nested inside another.
 *
 * Only components that actually render label strings (directly or by aggregating their
 * children's) get an entry — e.g. `Suggestions`, `SubmitButton`, `StateField`, and `ChatWaiting`
 * take their text as data/props already and have nothing to localize here.
 */
export interface LangGraphLabels {
	threadList?: DeepPartial<ThreadListLabels>;
	composer?: DeepPartial<ComposerLabels>;
	messagesList?: DeepPartial<MessagesListLabels>;
	message?: DeepPartial<ChatMessageLabels>;
	toolMessage?: DeepPartial<ChatToolMessageLabels>;
	errorMessage?: DeepPartial<ChatErrorMessageLabels>;
	thinking?: DeepPartial<ThinkingBlockLabels>;
	aiActions?: DeepPartial<AIMessageActionsLabels>;
	userActions?: DeepPartial<UserMessageActionsLabels>;
	userEdit?: DeepPartial<UserMessageEditLabels>;
	feedback?: DeepPartial<FeedbackButtonsLabels>;
}

/**
 * Merges a component's default labels with an optional context-supplied partial and an optional
 * prop-supplied partial, in that precedence order (prop wins over context wins over default).
 *
 * The merge is shallow per scope: a nested scope provided by `context` or `prop` replaces the
 * corresponding default scope wholesale rather than being merged key-by-key. That is deliberate —
 * every component with nested scopes (e.g. `AIMessageActions`'s `feedback`) forwards the resolved
 * nested value down to the owning child as that child's own `labels` prop, and the child resolves
 * it again against its own defaults there. Re-merging at each level makes a deep merge here
 * redundant.
 *
 * `context` is always `undefined` until the `<LangGraph>` provider lands (PR 3); the parameter
 * exists now so components don't need to change shape when it arrives.
 */
export function resolveLabels<T extends object>(
	defaults: T,
	context: DeepPartial<T> | undefined,
	prop: DeepPartial<T> | undefined
): T {
	// `Object.assign` + an explicit cast, rather than an object-spread literal, sidesteps a
	// TypeScript inference trap: spreading `Partial<T> | undefined` after a required `T` would
	// otherwise widen already-required property types to include `undefined`, even though every
	// property this actually returns is fully populated (each optional source only ever
	// contributes keys it truly has — `Object.assign` skips `undefined` sources entirely).
	return Object.assign({}, defaults, context, prop) as T;
}
