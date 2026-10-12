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
	/** `Conversation`'s sr-only status while a thread's history loads (see `ConversationLabels`). */
	historyLoading?: string;
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
 * Use the result only for the strings a component renders itself — never forward its nested
 * scopes to a child; forward `labelOverrides` instead (see there for why).
 *
 * The merge is shallow per scope: a nested scope provided by `context` or `prop` replaces the
 * corresponding default scope wholesale rather than being merged key-by-key. Every component with
 * nested scopes (e.g. `AIMessageActions`'s `feedback`) forwards its explicit override for that
 * scope down to the owning child as the child's own `labels` prop, and the child merges it again
 * against its own context scope and defaults there — re-merging at each level makes a deep merge
 * here redundant.
 */
export function resolveLabels<T extends object>(
	defaults: T,
	context: DeepPartial<T> | undefined,
	prop: DeepPartial<T> | undefined
): T {
	// `Object.assign` + an explicit cast, rather than an object-spread literal, sidesteps a
	// TypeScript inference trap: spreading `Partial<T> | undefined` after a required `T` would
	// otherwise widen already-required property types to include `undefined`, even though every
	// property this actually returns is fully populated.
	return Object.assign({}, defaults, definedEntries(context), definedEntries(prop)) as T;
}

/**
 * The explicit overrides an aggregating component forwards to a child: its own context scope
 * merged with its `labels` prop (prop wins), with NO defaults filled in — `undefined` when
 * neither is given. Forward `labelOverrides(...).<childScope>` as the child's `labels` prop,
 * never `resolveLabels(...).<childScope>`.
 *
 * Forwarding the resolved scope used to clobber provider leaf overrides: since a child's prop
 * beats its context scope, a fully default-filled forwarded scope silently replaced e.g.
 * `<LangGraph labels={{ aiActions: { regenerate: 'Regénérer' } }}>` with the English default
 * whenever `AIMessageActions` rendered through `Conversation`/`MessagesList`/`ChatMessage`
 * rather than directly. Forwarding only what was explicitly set gives every leaf the precedence
 * defaults < its own provider (leaf) scope < an explicit override forwarded from an ancestor
 * (a provider aggregate such as `labels.messagesList.message.aiActions`, or an ancestor's
 * `labels` prop). Shallow per scope, exactly like `resolveLabels`: an ancestor override for a
 * nested scope replaces the context's same nested scope wholesale, but the leaf's own context
 * scope still fills any key that override leaves unset.
 */
export function labelOverrides<T extends object>(
	context: DeepPartial<T> | undefined,
	prop: DeepPartial<T> | undefined
): DeepPartial<T> | undefined {
	if (!context && !prop) return undefined;
	return Object.assign({}, definedEntries(context), definedEntries(prop));
}

// A caller building a partial from conditional values (e.g. `{ copy: maybeString }`) can end up
// with keys explicitly set to `undefined`; copying those over the defaults would blank the label
// instead of falling back, so drop them before merging.
function definedEntries<T extends object>(partial: T | undefined): Partial<T> | undefined {
	if (!partial) return partial;
	return Object.fromEntries(
		Object.entries(partial).filter(([, value]) => value !== undefined)
	) as Partial<T>;
}
