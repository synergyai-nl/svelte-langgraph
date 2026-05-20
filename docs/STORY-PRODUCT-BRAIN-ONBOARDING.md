# Story: Product Brain onboarding and reorganisation

A short narrative of how we (Randy + Cursor agent) worked with Product Brain to get our product knowledge into the right shape. For team review and to reuse the approach next time.

---

## 1. Starting point: “Hello Product Brain”

We opened a chat and said hello to the Product Brain MCP. The agent called `start` to begin a session. Product Brain wasn’t connected in that first chat (only the browser MCP was), so the agent couldn’t call it. Instead, the agent reported that PB wasn’t available and suggested enabling it or trying again in another session.

**Takeaway:** MCP server availability depends on the chat/session. The project-scoped name (`project-0-svelte-langgraph-Product Brain`) was only discovered later when PB was enabled.

---

## 2. You shared the product doc

You pasted a long product document: purpose (what we do, what we really do, why we do it), product vision (differentiation, MVP, current state), product strategy (target users, competitive position, business model, technical constraints), roadmap (immediate, near-term, longer-term, use-case approach), and goals 2026 (outcomes and metrics).

The agent still couldn’t call Product Brain in that session. So we did two things in the repo:

- **`docs/PRODUCT.md`** — The full content as the single source of truth, structured with clear sections (Purpose, Vision, Strategy, Roadmap, Goals). This gave us a stable reference and a way to feed PB later.
- **`docs/product-brain-capture.json`** — Sixteen entries with `title` and `body`, ready for capture once PB was connected. You were told: “When PB is connected, call start then capture each entry; then commit.”

**Takeaway:** When the target system (PB) isn’t available, writing to the repo (PRODUCT.md + a capture payload) kept progress and made the actual capture a matter of “run the list” later.

---

## 3. “Start Product Brain — it should work now”

You enabled Product Brain and asked to start it. The agent tried `Product Brain` first and got “server does not exist.” It then tried the project-scoped name `project-0-svelte-langgraph-Product Brain` and `start` succeeded. PB returned a brief for the Svelte Langgraph workspace and suggested filling in product vision, purpose, and roles.

**Takeaway:** In this setup, the correct server name is the project-scoped one. The agent has no way to discover it except by trying; documenting it (e.g. in a playbook) would help the next time.

---

## 4. Capturing the 16 entries

You said “yes” to capturing the content. The agent:

1. Tried `capture` with `title` and `body` → validation error: need `name` and `description`.
2. Tried again without `collection` → “Collection is required.”
3. Called `collections` with `action: list` to see available collections and their purposes.
4. Captured all 16 entries with `collection: "strategy"`, `name`, and `description`. PB committed them as STR-1 … STR-16 and auto-linked some of them.

So in one pass we had the whole product doc in Product Brain, but everything lived in **strategy**. That was fast but not yet right by type.

**Takeaway:** Having the capture schema (name, description, collection) and the collection list up front would have avoided the first two failed calls. The repo already had the content; the missing piece was “which collection per piece?”

---

## 5. “Poorly organised — not all is strategy”

You pointed out that not everything we captured is strategy. We stepped back and did **discovery and mapping** in the repo:

- **`docs/PRODUCT-COLLECTIONS-MAP.md`** — We broke the content into categories (Purpose, Product Vision, Product Strategy, Product Roadmap, Goals 2026) and proposed a Product Brain collection for each item, with short rationale:
  - **Strategy:** purpose, vision, target users, competitive position, business model, roadmap direction, goals.
  - **Features:** current capabilities (OIDC, OpenAI-compatible) and concrete deliverables (Shadcn migration, nav bar mobile).
  - **Decisions:** the LangGraph choice (what we chose and why).
  - **Standards:** the use-case development approach (how we do discovery).

No PB calls yet; we only aligned on “what goes where.”

**Takeaway:** Doing the categorisation and collection map *before* bulk capture (or in a separate step like this) would have given us the right buckets from the start and avoided “all strategy, then re-organise.”

---

## 6. Update existing items, split, put in the right place

You asked to update existing items, split where needed, and put everything in the right place, and to be told when the chain was ready.

We couldn’t “move” entries between collections in PB from the agent. So we:

- **Left all 16 strategy entries (STR-1 … STR-16)** as the strategic narrative.
- **Created new entries in the right collections:**
  - **Features:** FEAT-1 (OIDC login), FEAT-2 (OpenAI-compatible provider), FEAT-3 (Shadcn CDN migration), FEAT-4 (Navigation bar mobile).
  - **Decisions:** DEC-1 (LangGraph as primary backend protocol), with rationale and context.
  - **Standards:** STD-1 (Use case development approach).
- **Tried to update STR-6, STR-10, STR-11, STR-13** so they acted as short pointers to the new entries. The `update-entry` tool only applied the `name` field for these strategy entries; it did not update the main description/body. So those four strategy entries kept their original text; the “pointer” wording couldn’t be set from the agent.

We ran **session-wrapup**. No uncommitted drafts; the chain was in a good state for you to use.

**Takeaway:** Splitting was done by “create in the right collection and keep strategy as summary.” A way to update description (or to “move”/reclassify) from the agent would have let us turn STR-6/10/11/13 into clear pointers and reduce duplication.

---

## 7. Retro: what went well, what didn’t, how to improve

You asked for a discovery-interview style retro: what went well, what didn’t, and how we might improve — with no MCP, just the agent’s perspective.

The agent wrote a short retro that covered:

- **Went well:** Reliable PB behaviour once connected; clear collection purposes; single-step capture-and-commit; auto-linking and quality hints; having PRODUCT.md and the collection map as a shared reference.
- **Didn’t go well:** Server name discovery by failure; no upfront tool schema (learned from errors); `update-entry` not updating description for strategy; bulk capture into one collection leading to rework; no “move” or “reclassify” in the workflow.
- **Improvements:** A “Product Brain playbook” (server name, capture params, when to use which collection, update-entry behaviour); better schema/agent guide for PB tools; workflow that does structure/map first, then capture by collection in small batches; using something like Context7 to explore how others do agent–knowledge-base onboarding and retros.

That retro was shared in chat; the narrative above is the story version for the team.

---

## 8. What’s in the repo and in Product Brain now

**Repo:**

- **`docs/PRODUCT.md`** — Single source of truth for product (purpose, vision, strategy, roadmap, goals).
- **`docs/PRODUCT-COLLECTIONS-MAP.md`** — Categories and proposed PB collection per item (for review and future captures).
- **`docs/product-brain-capture.json`** — Original 16-entry capture payload (kept for reference).
- **`docs/STORY-PRODUCT-BRAIN-ONBOARDING.md`** — This story.

**Product Brain (chain):**

- **Strategy (16):** STR-1 … STR-16 — purpose, vision, target users, competitive position, business model, technical constraints (summary), roadmap (immediate/near/longer, use-case pointer), goals 2026.
- **Features (4):** FEAT-1 (OIDC), FEAT-2 (OpenAI-compatible), FEAT-3 (Shadcn migration), FEAT-4 (Nav bar mobile).
- **Decisions (1):** DEC-1 (LangGraph as primary backend protocol).
- **Standards (1):** STD-1 (Use case development approach).

Relations were created by PB (e.g. STD-1 governing STR-13; features and decision linked to strategy). STR-6, STR-10, STR-11, STR-13 still have their original descriptions; the “canonical” content for current state, technical choice, immediate deliverables, and use-case approach lives in the features/decisions/standards entries.

---

## 9. For the team: how to reuse this

1. **Before bulk capture:** Decide categories and map them to PB collections (use or adapt PRODUCT-COLLECTIONS-MAP.md). Capture in small batches by collection so nothing is “all in strategy” by default.
2. **Server name:** When using the agent with Product Brain, the working server name in this project is `project-0-svelte-langgraph-Product Brain`. Put that in a playbook or README if others will run captures.
3. **Capture params:** Use `name`, `description`, and `collection` for every capture. Get the collection list once (`collections` with `action: list`) and refer to it when mapping content.
4. **Splitting / re-organising:** Create new entries in the right collection; keep or trim strategy entries as summaries. If PB later supports updating description or moving entries from the API, use that to turn strategy entries into clear pointers and avoid duplication.
5. **Source of truth:** Keep PRODUCT.md (or equivalent) in the repo and treat Product Brain as the structured, queryable reflection of that — so the team can align in docs first, then sync to the chain.

If you want, we can turn section 9 into a short “Product Brain playbook” checklist (e.g. in CLAUDE.md or a separate PLAYBOOK-PRODUCT-BRAIN.md) so the next run is even smoother.
