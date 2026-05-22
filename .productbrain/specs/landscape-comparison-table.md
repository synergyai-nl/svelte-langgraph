# Spec: Landscape comparison table component

**Phase:** Spec (LOOP)  
**Output version:** v1  
**Date:** 2026-05-22  
**Status:** Ready for reviewer sign-off → Chain capture  
**Upstream:** `.productbrain/specs/landscape-comparison-table-diagnosis.md` (v1)  
**Chain:** DEC-6, INS-6, DEC-5, STR-8, PRI-2, PRI-1, STD-1

---

## Problem

Homepage landscape comparison loses row labels and column headers on narrow viewports when users scroll. Users see disconnected status icons (see diagnosis screenshot). The table must remain navigable: sticky first column + sticky header on small screens; normal full table on wide screens.

## Outcome

| Metric | Target |
|--------|--------|
| Mobile usability | After H/V scroll, ≥1 row label and ≥1 column header remain visible in the table scrollport |
| Maintainability | Table logic lives in one `$lib` marketing component, not inline in `+page.svelte` |
| Honest comparison | STR-8 — copy/data unchanged; UX fix only |
| A11y | Screen readers can navigate as a data table with named rows/columns |

**Guardrails:** No comparison copy changes; no new dependencies; no i18n for homepage body; DEC-5 — section-level `border-t` not added (in-component borders OK).

---

## Product Model Fit

| Question | Answer |
|----------|--------|
| Pattern | **Extend** existing marketing component pattern (`HeroTerminal`, `StackLogos` in `$lib/components/marketing/`) |
| Bespoke? | No — concrete homepage use case with fixed column schema; one component, typed props |
| Abstraction level | Single component + optional colocated types module; **no** generic snippet-table framework (PRI-1) |

**Verdict:** PASS — reuse `$lib/components/marketing/` + Svelte 5 `$props()` interface.

---

## Impact Pack

| Area | Effect |
|------|--------|
| **Users** | Mobile visitors can read competitive comparison without losing context |
| **Surface** | `+page.svelte` landscape section (~60 lines → component import); new `LandscapeComparisonTable.svelte` |
| **Regression** | Desktop layout must match current visual (icons, stripes, links, primary column emphasis) |
| **A11y** | Upgrade div grid → semantic `<table>` (INS-6) |
| **Governance** | Reconciles DEC-6: try CSS-first sticky; DEC-6 split-header is **fallback**, not default |
| **Tests** | Vitest smoke + Playwright narrow-viewport scroll proof (CLAUDE.md: chat UX needs E2E; landscape is homepage UX) |
| **Follow-up** | Populate Chain `landscape` collection — out of scope |

---

## Technical approach (DEC-6 reconciliation)

### Plan A — Primary (CSS sticky in unified scrollport)

On viewports below `md` (768px):

- Wrapper: `overflow-auto` (both axes), optional `max-h-[min(70vh,32rem)]` so vertical scroll happens **inside** the table region (avoids page `overflow-hidden` breaking viewport sticky).
- Table: `min-w-[800px]`, semantic `<table>`, `border-collapse` / existing border tokens.
- Sticky cells (Tailwind):
  - Corner: `sticky top-0 left-0 z-30` + solid `bg-muted/30`
  - Column headers: `sticky top-0 z-20` + `bg-muted/30`
  - Row headers: `sticky left-0 z-20` + row stripe background (`bg-background` / `bg-muted/10`)
  - Body cells: default z-0
- Shadow on sticky right edge of first column: `shadow-[4px_0_8px_-2px_rgba(0,0,0,0.15)]` (or design-token equivalent) so scroll bleed is obvious.

On `md` and up:

- Wrapper: no overflow clamp; table displays as today (no sticky required when fully visible).

### Plan B — Fallback (DEC-6 split header + scroll-sync)

**Trigger:** Plan A fails manual QA on **iOS Safari** or **Chrome Android** (header does not stay visible when scrolling vertically inside scrollport).

- Duplicate header row in a sibling `overflow-hidden` track above body scrollport.
- `bind:this` on body scroll container; `onscroll` sets `transform: translateX(-${scrollLeft}px)` on header track (DEC-6).
- `$effect` cleanup not required for `onscroll` on element; use `onscroll` attribute or action with destroy cleanup per Svelte docs.
- Document result in Chain (`DEC` update or `INS` if Plan A works and DEC-6 scope narrows).

**Spec authority:** Ship Plan A first; Plan B only if Plan A fails acceptance item A5.

---

## Svelte / SvelteKit best practices (Context7 — Svelte 5.46)

Source: [svelte.dev](https://svelte.dev) via Context7 `/websites/svelte_dev_svelte`, aligned with repo patterns.

| Practice | Application |
|----------|-------------|
| **`$props()` + typed `interface Props`** | `comparison: ComparisonRow[]` required; optional `class` for wrapper (`StackLogos` pattern) |
| **No `$bindable` unless needed** | Read-only data from parent; no two-way binding |
| **`bind:this` only for Plan B** | DOM ref for scroll container; read `scrollLeft` in handler, not in template |
| **`$effect` + cleanup** | Only if using listeners added in script; prefer `onscroll` on element for scroll-sync |
| **`{#each}` keyed** | `(row.label)` as today |
| **`@const` for derived icon** | Keep `statusIcon(status)` inside `{#each}` |
| **`$lib/...` import** | `import LandscapeComparisonTable from '$lib/components/marketing/LandscapeComparisonTable.svelte'` |
| **`cn()` from `$lib/utils`** | Merge wrapper classes |
| **Avoid over-abstraction** | Fixed 6-column schema in component; do **not** build generic `{#snippet row()}` table (snippet pattern is for reusable Table primitives — unnecessary here) |
| **A11y compiler rules** | External links: `href`, `rel="noopener noreferrer"`; status cells: `aria-label` text, not icon-only silence |
| **Touch scroll** | Use native overflow scroll; no `preventDefault` on touch |

---

## Component contract

### File

`apps/frontend/src/lib/components/marketing/LandscapeComparisonTable.svelte`

Optional: `landscape-comparison.ts` colocated types + `statusLabel(status)` helper if script block grows.

### Props

```typescript
type CellStatus = 'yes' | 'no' | 'partial';

interface ComparisonRow {
  label: string;
  svelteLanggraph: CellStatus;
  langflow: CellStatus;
  chainlit: CellStatus;
  openWebui: CellStatus;
  customReact: CellStatus;
}

interface Props {
  rows: ComparisonRow[];
  class?: string;
}
```

Move `comparison` array from `+page.svelte` **or** keep data in page and pass `rows={comparison}` — prefer keeping data in page (single source for marketing copy edits), helpers (`getRowCells`, `statusIcon`, `statusColor`) move into component as private functions.

### Column metadata

Internal constant array for header labels + link hrefs (Langflow, Chainlit, Open WebUI external; Custom React text-only). Matches current markup.

### Markup structure

```html
<div role="region" aria-label="Tool comparison" class="...scroll wrapper...">
  <table class="min-w-[800px] w-full">
    <caption class="sr-only">Comparison of agent UI tools across features</caption>
    <thead>...</thead>
    <tbody>...</tbody>
  </table>
</div>
```

- `<th scope="col">` for tool headers; empty corner `<th scope="col">` with `aria-hidden="true"` or visually empty.
- `<th scope="row">` for feature labels.
- Data cells: `<td>` with icon + `aria-label="{statusLabel(status)} for {toolName}"` (e.g. "Supported for Langflow").

### Visual parity

- Header band: `bg-muted/30`, `border-b`
- Row stripe: odd/even same as current `i % 2 === 1 ? 'bg-muted/10'`
- `text-primary-600` on svelte-langgraph column header
- `ExternalLink` icon on linked tools
- Rounded border container: `rounded-xl border overflow-hidden` on outer wrapper

---

## Acceptance criteria (fail-able)

| ID | Criterion | Proof |
|----|-----------|-------|
| A1 | `LandscapeComparisonTable` exists under `$lib/components/marketing/` | File path |
| A2 | `+page.svelte` uses component; inline div grid removed | Diff |
| A3 | Semantic `<table>` with `scope` on headers | DOM / test |
| A4 | **Desktop (`md+`):** table looks equivalent to current (screenshot or visual check) | Manual / Playwright full-width |
| A5 | **Mobile (`<md`, ~375px):** scroll right → first column labels remain visible | Manual iOS + Chrome OR Playwright |
| A6 | **Mobile:** scroll down → column tool names remain visible | Manual OR Playwright |
| A7 | **Mobile:** scroll both axes → no icon-only dead zone; corner cell covers intersection | Manual |
| A8 | Status cells expose text for AT (`aria-label` or visible text) | `getByRole('cell')` / axe optional |
| A9 | `moon frontend:lint` and `moon frontend:typecheck` pass | Command output |
| A10 | Vitest: component renders first row label + table role | `LandscapeComparisonTable.svelte.test.ts` |
| A11 | E2E: narrow viewport scroll keeps sticky context | `e2e/src/homepage.spec.ts` (new) |

---

## Exclusions

- Changing comparison rows, tool list, or footnote copy
- Chain `landscape` collection entries
- i18n / Paraglide for table strings
- Plan B unless A5/A6 fail on target mobile browsers
- Refactoring page root `overflow-hidden` (unless required; prefer table-local scrollport first)

---

## Open risks

| Risk | Mitigation |
|------|------------|
| iOS sticky + overflow bugs | Plan B (DEC-6); test on real device |
| `max-h` scrollport feels cramped | Tune `max-h` or use full section height; user test |
| Sticky background bleed | Explicit `bg-*` on every sticky cell per stripe row |

---

## Reviewer sign-off (Spec phase)

| Reviewer | Verdict | Notes |
|----------|---------|-------|
| Chain Steward | SIGN-OFF | Aligns DEC-6/INS-6/STR-8; Plan A/B order explicit |
| Domain / User Job | SIGN-OFF | Fixes mobile comparison reading job |
| Systems Architect | SIGN-OFF | Extends marketing component pattern; no new deps |
| Delivery Quality | SIGN-OFF | Acceptance + tests enumerated |
| Risk/Safety | NOT APPLICABLE | No auth/data exposure |

**Spec loop status:** PASS — pending human Chain capture of this file.

---

## Chain capture (after human confirms)

```
pb capture "SPEC: Landscape comparison table — see .productbrain/specs/landscape-comparison-table.md"
```

Link from work item when created.
