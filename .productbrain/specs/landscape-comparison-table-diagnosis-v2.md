# Diagnosis v2: Landscape table visual regressions

**Phase:** Diagnose (LOOP)  
**Date:** 2026-05-22  
**Trigger:** User screenshot — ghosting, black blocks, unnecessary collapse

## Symptoms (user report)

| Symptom | Visible evidence |
|---------|------------------|
| Icons bleed through first column | Checkmarks visible behind "Python", "OIDC" text |
| Black rectangles on row labels | Solid dark blocks on first column, not matching row |
| Table "collapses" on large phones | Cramped scrollport despite available width |
| Style change vs desktop | First column looks like different component |

## Root causes (ranked)

### 1. Semi-transparent sticky backgrounds (PRIMARY — ghosting)

Sticky cells used `bg-muted/30`, `bg-muted/10` — **30% and 10% opacity**. Scrolled icon cells remain visible underneath. Playwright only checked DOM visibility, not opacity/stacking.

**Verdict:** Implementation defect vs spec intent ("solid backgrounds on sticky cells").

### 2. Mismatched opaque color on row headers (PRIMARY — black blocks)

Even rows used `max-md:bg-background` on `<th>` only, while `<tr>` had **no** opaque fill (transparent). Dark theme `--background` is `0 0% 5%` — reads as black blocks against transparent/icon cells.

Striped rows used `max-md:bg-muted/10` on `<th>` — still transparent → ghosting.

**Verdict:** Sticky `<th>` must share the **same opaque** background as its `<tr>` (applied to full row).

### 3. `max-md` (768px) + `max-h` scrollport (collapse)

- Sticky/scroll mode activates for **all** viewports `< 768px`, even when section width could show more table.
- `max-h-[min(70vh,32rem)]` + `overflow-auto` creates a **short boxed** scroll area — feels collapsed on tall phones.
- Table `min-w-[800px]` inside ~702px container at 750px viewport **requires** horizontal scroll — correct; but max-h is not.

**Verdict:** Drop vertical clamp; use **horizontal-only** overflow when compact; use **container query** so compact mode tracks **container width**, not viewport `md`.

### 4. Header band inconsistency

`<tr class="bg-muted/30">` + sticky `bg-muted/30` — translucent header; corner cell double-stacked with sticky classes.

**Fix:** Solid `bg-muted` for header row and all sticky header cells.

## Fix contract (Deliver)

1. Opaque row backgrounds on entire `<tr>`; sticky `<th>` uses same class (`bg-inherit` or duplicate token).
2. No `/10` or `/30` on sticky surfaces.
3. Wrapper: `@container`; compact when `@max-[50rem]` (~800px container): `overflow-x-auto` only, no max-height.
4. Sticky classes scoped to compact container query only.
5. Re-run unit + E2E tests; manual dark-mode check.

## DEC-6 status

Plan A remains valid after opacity/breakpoint fix. Split header not required unless sticky top fails after removing max-h (acceptable trade: page vertical scroll may not pin header due to page `overflow-hidden`).
