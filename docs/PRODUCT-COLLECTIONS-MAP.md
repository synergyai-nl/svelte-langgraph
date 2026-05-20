# Product Brain: Categories and Collection Mapping

Breakdown of product content by **category**, with a proposed **Product Brain collection** for each and short rationale. Adjust the right-hand column, then we can recapture or move entries in PB.

---

## 1. Purpose

| Item | Content (summary) | Proposed collection | Rationale |
|------|------------------|---------------------|-----------|
| **What We Do** | Generic Svelte front end for LangGraph, fully customizable, OAuth; full app now, app-in-app later; "I just want an agent with tools" | **strategy** | Vision: what we're building and for whom. Strategy holds vision and purpose. |
| **What We Really Do** | Solve developer problem (stable, secure, Pythonic front end); 10x cheaper to maintain; fill Svelte ecosystem gap | **strategy** | Value proposition and purpose. Belongs with vision. |
| **Why We Do It** | Mathijs, Dhruv, Randy motivations (landscape, 5-year apps, Chainlit pain, OSS, Svelte, accessibility, simplicity) | **strategy** | Rationale for the product. Could alternatively be **principles** if rewritten as "We believe…" statements. |

---

## 2. Product Vision

| Item | Content (summary) | Proposed collection | Rationale |
|------|------------------|---------------------|-----------|
| **Open Source Differentiation** | vs Chainlit: quality, minimalism, security, small feature set, only LangGraph/Svelte/OpenAI/OIDC, 2-year security support | **strategy** | Strategic positioning. How we differentiate. |
| **MVP Requirements** | Define MVP from conversation; simple true website; early for SEO; "Chainlit + Svelte" + GitHub; comparison page | **strategy** | MVP scope and launch goals. Strategy (goals) or could feed **features** as concrete deliverables. |
| **Current State** | OIDC login; any OpenAI-compatible provider/endpoint | **features** | What the product *can do today*. Features = user-facing capabilities. |

---

## 3. Product Strategy

| Item | Content (summary) | Proposed collection | Rationale |
|------|------------------|---------------------|-----------|
| **Target Users** | Devs, product people, boutique agencies, SaaS/Chainlit teams, LLM builders, CX bots, small agencies | **strategy** | Audience segments. Strategy holds audience and segments. |
| **Competitive Position** | Not replacing all of Chainlit; compete on quality over quantity, security, long-term maintainability | **strategy** | How we compete. Strategic direction. |
| **Business Model Consideration** | Customers vs users (OSS); market large/unsaturated; path: struggle → consulting | **strategy** | Business model and monetization direction. |
| **Technical Constraints Discussed** | Married to LangGraph (constraint); ADK etc.; *chose* LangGraph (protocol, provider-agnostic, OSS server); future: other backends | **decisions** | Records a *choice* with rationale and alternatives. Decisions = "what we chose and why." |

---

## 4. Product Roadmap

| Item | Content (summary) | Proposed collection | Rationale |
|------|------------------|---------------------|-----------|
| **Immediate (Current Sprint)** | Flow → Shadcn CDN migration; nav bar (mobile); 2–3 tickets, done by end Jan | **features** | Concrete deliverables and work items. Features with status/scope. |
| **Near-term** | UI/UX scoping ticket; define use cases before abstractions; website launch | **strategy** or **features** | Time-bound goals (strategy) or deliverables (features). Proposal: **strategy** for "define use cases, website launch"; **features** for specific deliverables when you create them. |
| **Longer-term (2-year)** | Release schedule; security support policy; app-within-app (web components); other backend protocols | **strategy** | Longer-term direction and goals. Strategy with horizon. |
| **Use Case Development Approach** | Start with specific use cases, then patterns; "agentic use case… Claude with MCPs"; user profiles; end users vs DX | **standards** | How we do product discovery and scoping. Standards = conventions the team follows. |

---

## 5. Goals 2026

| Item | Content (summary) | Proposed collection | Rationale |
|------|------------------|---------------------|-----------|
| **Outcomes** | Dhruv: more time; Mathijs: grand success = full-time team; Randy: launch, contributors, inbound | **strategy** | Outcomes and goals. Strategy holds goals. |
| **Metrics** | Live product; people using/contributing; inbound; ultimate: team lives off it (order: Dhruv, Mathijs, Randy) | **strategy** | Measurable goals. Strategy holds goals and metrics. |

---

## Summary: Collection counts

| Collection | Entries |
|------------|---------|
| **strategy** | Purpose (3), Vision (2), Strategy (3), Roadmap near/long (2), Goals (2) → **12** |
| **features** | Current State (1), Immediate roadmap (1) → **2** |
| **decisions** | Technical constraints / LangGraph choice → **1** |
| **standards** | Use case development approach → **1** |

---

## Next steps

1. **You:** Confirm or change the mapping (e.g. move "Why We Do It" to principles, or split roadmap into more features).
2. **Then:** In Product Brain we can:
   - **Option A:** Add new entries in the correct collections and leave the old STR-* entries as-is (or delete if PB supports it).
   - **Option B:** Use `update-entry` to change collection where PB allows.
   - **Option C:** Delete/archive the current STR-1…STR-16 and recapture once with the right collection per item.

Once you confirm the map, we can do Option A or C (Option B only if PB supports moving between collections).
