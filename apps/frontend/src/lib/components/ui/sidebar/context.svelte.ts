import { getContext, setContext } from 'svelte';
import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
import { SIDEBAR_KEYBOARD_SHORTCUT } from './constants.js';

type Getter<T> = () => T;

export type SidebarStateProps = {
	/**
	 * A getter function that returns the current open state of the sidebar.
	 * We use a getter function here to support `bind:open` on the `Sidebar.Provider`
	 * component.
	 */
	open: Getter<boolean>;

	/**
	 * A function that sets the open state of the sidebar. To support `bind:open`, we need
	 * a source of truth for changing the open state to ensure it will be synced throughout
	 * the sub-components and any `bind:` references.
	 */
	setOpen: (open: boolean) => void;
};

class SidebarState {
	readonly props: SidebarStateProps;
	open = $derived.by(() => this.props.open());
	openMobile = $state(false);
	setOpen: SidebarStateProps['setOpen'];
	#isMobile: IsMobile;
	state = $derived.by(() => (this.open ? 'expanded' : 'collapsed'));

	// Count of mounted `Sidebar.Root` instances registered against this state (see `registerRoot`).
	// A `Provider` mounted with no `Root` inside it — an embeddable-API caller that renders its own
	// chrome without the sidebar UI (SLG-133) — has no chrome to react to the keyboard shortcut or
	// to a persisted open state, so both global side effects are gated on this being > 0.
	//
	// Deliberately a plain field, not `$state`: both readers (`handleShortcutKeydown`,
	// `Provider`'s `setOpen`) are imperative checks at event time, never a template/`$derived`
	// dependency. Making it reactive would let `Root`'s registering `$effect` read-and-write the
	// same tracked value in one run (`this.#registeredRoots++` reads then writes it) — Svelte
	// flags that as a self-triggering effect and throws `effect_update_depth_exceeded`.
	#registeredRoots = 0;

	constructor(props: SidebarStateProps) {
		this.setOpen = props.setOpen;
		this.#isMobile = new IsMobile();
		this.props = props;
	}

	// Convenience getter for checking if the sidebar is mobile
	// without this, we would need to use `sidebar.isMobile.current` everywhere
	get isMobile() {
		return this.#isMobile.current;
	}

	/** Whether at least one `Sidebar.Root` is currently mounted against this state. */
	get hasRegisteredRoot() {
		return this.#registeredRoots > 0;
	}

	/**
	 * Registers a mounted `Sidebar.Root`. Call from `Root`'s mount, and call the returned function
	 * from its cleanup — `$effect` in the caller is the natural fit for both.
	 */
	registerRoot = (): (() => void) => {
		this.#registeredRoots++;
		return () => {
			this.#registeredRoots--;
		};
	};

	// Event handler to apply to the `<svelte:window>`
	handleShortcutKeydown = (e: KeyboardEvent) => {
		if (!this.hasRegisteredRoot) return;
		if (e.key === SIDEBAR_KEYBOARD_SHORTCUT && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			this.toggle();
		}
	};

	setOpenMobile = (value: boolean) => {
		this.openMobile = value;
	};

	toggle = () => {
		return this.#isMobile.current ? (this.openMobile = !this.openMobile) : this.setOpen(!this.open);
	};
}

const SYMBOL_KEY = 'scn-sidebar';

/**
 * Instantiates a new `SidebarState` instance and sets it in the context.
 *
 * @param props The constructor props for the `SidebarState` class.
 * @returns  The `SidebarState` instance.
 */
export function setSidebar(props: SidebarStateProps): SidebarState {
	return setContext(Symbol.for(SYMBOL_KEY), new SidebarState(props));
}

/**
 * Retrieves the `SidebarState` instance from the context. This is a class instance,
 * so you cannot destructure it.
 * @returns The `SidebarState` instance.
 */
export function useSidebar(): SidebarState {
	return getContext(Symbol.for(SYMBOL_KEY));
}
