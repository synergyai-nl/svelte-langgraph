# Diagnosis: Landscape comparison table — sticky axes on narrow viewports

**Phase:** Diagnose (LOOP)  
**Output version:** v1  
**Date:** 2026-05-22  
**Scope:** `apps/frontend/src/routes/+page.svelte` lines 518–618 (The landscape section)  
**Chain:** DEC-6, INS-6, STR-8, PRI-2

## Problem statement

On narrow viewports, users scroll the landscape comparison grid and lose all context: row labels (first column) and column headers (tool names) scroll out of view. The screenshot shows only status icons with no way to know which row or column they belong to. Expected behavior: first column and header row remain fixed while the data area scrolls horizontally and vertically.

## Symptom evidence

| Observation | Source | Verdict |
|-------------|--------|---------|
| Horizontal scroll hides row labels | User screenshot + DOM path to landscape section | Confirmed |
| No column headers visible in scrolled state | Image: icon-only grid | Confirmed |
| Table is ~800px wide inside ~342px scrollport | INS-6 | Confirmed |
| Implementation is inline div grid, not a component | `+page.svelte` 532–592 | Confirmed |
| No `position: sticky` anywhere on table cells | Grep: no sticky in landscape block | Confirmed |
| Prior decision chose split sticky header + scroll-sync | DEC-6 (unverified) | Recorded — not implemented |

## Current implementation (as-built)

```text
section (py-24)
  └── div.mx-auto.max-w-5xl.px-6
        └── div.overflow-x-auto          ← horizontal scroll only
              └── div.min-w-[800px].overflow-hidden.rounded-xl.border
                    ├── div.grid.grid-cols-6 (header row, divs)
                    └── {#each} div.grid.grid-cols-6 (data rows, divs)
```

- **Not a component:** markup and `comparison` data helpers live in `+page.svelte`.
- **Not semantic HTML:** CSS grid on `div`s (INS-6: breaks table a11y for row/column headers).
- **Scroll model:** `overflow-x-auto` on wrapper; vertical scroll is the **page**, not the table.
- **Sticky:** none — every cell scrolls away with its axis.
- **Ancestors:** page root `div.overflow-hidden` (line 289) may interfere with viewport-level `sticky top` on descendants.

## Root causes (ranked)

1. **Sticky behavior was never implemented** — only horizontal overflow was added. The bad UX is the default outcome of a wide grid in a narrow scrollport, not a regression from a broken sticky attempt.

2. **Wrong scroll/sticky coupling (DEC-6)** — `overflow-x-auto` on an ancestor creates a horizontal scrollport but does not give `thead { position: sticky; top: 0 }` a reliable vertical sticky context when the user scrolls the page. Chain already captured: need restructure (split header + scroll-sync **or** a single `overflow: auto` scrollport for both axes).

3. **Non-table markup** — div grid cannot use native `<th scope="row|col">`, `headers` associations, or screen-reader table navigation. Row labels are plain text in the first grid cell, not row headers.

4. **Forced min-width without axis anchors** — `min-w-[800px]` correctly forces horizontal scroll on mobile but without sticky first column/header the scroll is unusable (INS-6 prerequisite: sticky + wrapper restructure).

5. **Architecture gap** — marketing components exist (`HeroTerminal`, `StackLogos`) but landscape table was left inline; no reusable contract for responsive scroll/sticky behavior.

## What is NOT the problem

- Comparison data or copy (Chain STR-8: honest comparison is aligned).
- Column count or icon semantics (`yes` / `partial` / `no`).
- Desktop layout when viewport ≥ table width — grid reads fine at full width.

## Expected behavior (acceptance sketch for Shape/Spec)

| Viewport | Scroll | First column | Header row | Corner (empty) |
|----------|--------|--------------|------------|----------------|
| **Wide (desktop)** | None required if table fits | Normal flow | Normal flow | Normal |
| **Narrow (mobile)** | Horizontal + vertical within table scrollport (or page vertical with proven sticky) | `sticky left-0`, opaque background, z-index above body cells | `sticky top-0`, opaque background, z-index above body | `sticky top-0 left-0`, highest z-index |

User-facing checks:

- Scroll right → tool column icons move; row labels stay visible.
- Scroll down → data rows move; tool names stay visible.
- Scroll both → corner + label column + header row remain readable; no “icon soup” state.

## Recommended delivery direction (for Spec — not implemented here)

### P0 — Extract real component

- New: `apps/frontend/src/lib/components/marketing/LandscapeComparisonTable.svelte`
- Move `ComparisonRow`, column metadata, `getRowCells`, status icon/color helpers into component (or colocated module).
- `+page.svelte` passes `comparison` (+ optional `ecosystemLinks` if kept in section).

### P0 — Semantic `<table>` + sticky cells

- Replace div grid with `<table>`, `<thead>`, `<tbody>`, `<th scope="col">`, `<th scope="row">`.
- Narrow breakpoint: wrapper with `overflow-auto` (both axes) and `min-w-[800px]` on table; apply Tailwind sticky utilities:
  - `sticky left-0 z-20 bg-*` on row-header cells
  - `sticky top-0 z-10 bg-*` on column headers
  - `sticky top-0 left-0 z-30` on corner cell
- Solid backgrounds on sticky cells (match row stripe / `bg-muted/30`) so scrolled content does not show through.

### P0 — Validate DEC-6 path

If `sticky top` fails inside `overflow-x-auto` during implementation testing:

- Implement DEC-6 **split sticky header**: duplicate header row above scroll body; sync `scrollLeft` via `transform: translateX(-${scrollLeft}px)` on header track.
- Do not ship without manual proof on iOS Safari + Chrome mobile (common sticky bugs).

### P1 — Desktop simplification

- `@media (min-width: …)` or Tailwind `md:`: remove inner scroll wrapper when table fits; no sticky needed.

### P1 — E2E

- Playwright: narrow viewport, scroll table, assert first row label and one column header remain in viewport (data-testid on sticky cells).

### Out of scope (this bet)

- Chain `landscape` collection population.
- Changing comparison rows or competitive copy.

## Evidence ledger (diagnose phase)

```text
Claim: Bad mobile UX is caused by missing sticky + scroll structure, not bad data
Evidence: +page.svelte 532-592 — overflow-x-auto only, no sticky classes
Verdict: PASS
Chain: INS-6
Blocker: none for Shape

Claim: DEC-6 documents required technical approach but is not in code
Evidence: pb get DEC-6; grep sticky in apps/frontend — no landscape sticky
Verdict: PASS
Chain: DEC-6
Blocker: none for Spec (must reconcile implementation vs decision)

Claim: Table should become a marketing component
Evidence: HeroTerminal/StackLogos pattern; inline 60+ lines in route
Verdict: PASS
Chain: PRI-2 (maintainability)
Blocker: none for Deliver

Claim: Page overflow-hidden may block viewport sticky for header
Evidence: +page.svelte line 289 overflow-hidden; table only overflow-x-auto
Verdict: PASS (risk) — prefer table-local overflow-auto scrollport on mobile
Chain: —
Blocker: verify in Deliver, not Diagnose
```

## Phase boundary

| Field | Value |
|-------|-------|
| **Current phase** | Diagnose → complete |
| **Next phase** | Shape (component API + responsive scroll model) → Spec (acceptance + DEC-6 reconciliation) |
| **Blockers** | None for Shape |
| **Chain updates needed** | None for diagnose; verify DEC-6 after implementation choice |

## Stop When

User invoked LOOP with **diagnose first** — stop here. Shape/Spec/Deliver require explicit continuation or `Stop When: Full Delivery`.
