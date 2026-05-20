# Svelte Langgraph — Product

Single source of truth for purpose, vision, strategy, roadmap, and goals. Use this to align the team and to feed Product Brain when the MCP is connected.

---

## Purpose

### What We Do

- Build a **generic front end for LangGraph** based on Svelte in which **everything is fully customizable**. A toolkit to build agent front ends that works with generic OAuth.
- Initially as a **full app**; later also as an **app that runs within an app** (component within any Svelte or non-Svelte app, or as a web component, including authentication).
- Support the use case: **"I just want an agent with tools"** — any situation where you have an agent with tools and you want to chat with the agent.

### What We Really Do

- Solve the problem that **developers** face: getting a **stable, secure front end** that connects with a **Pythonic environment**. Current options are limited to TypeScript/React (non-Python) or Chainlit; fixed applications don’t support complex agent infrastructure.
- Make it **10x cheaper to maintain** AI agentic applications over long time periods. Reduce total cost of ownership for building long-term viable agentic AI solutions.
- Fill a **gap in the Svelte ecosystem** — Svelte is gaining traction but lacks strong options in the agentic AI space.

### Why We Do It

**Mathijs**

- AI/gen AI landscape is maturing with more stable patterns (MCP, tools concept, standardization).
- People are building AI solutions that will stay more or less the same for ~5 years.
- Current state: the only way things “work” is because everyone accepts that when AI is mentioned, “it needs to rain cash.”
- Personal: Chainlit switched their UI library over a weekend without discussion, breaking customizations; no security maintenance commitment. “I want to use this to build apps that will survive 5 years.”
- “It’s actually fun to craft a quality product… feels good to build that and take ownership.”

**Dhruv**

- Contributing to open source — “LLM already is a power contained to very few people.”
- Contributing to the Svelte community.
- Personal struggle finding a good open source front end that could be customized with Python comfort.
- The level of code quality and security Mathijs insists on will make a product that can pass enterprise compliance.

**Randy**

- Make it **accessible to everyone** to easily build reliable agentic AI applications.
- Open source means anyone can download and get started.
- **Simplicity**: one-click install, library that’s easy to add to applications.

---

## Product Vision

### Open Source Differentiation

- **Chainlit**: “Build tools for developers and enterprises that want to ship ambitious and reliable AI” — described as not living up to that (most code AI-generated, maintainers not understanding their own code).
- **What we do differently:**
  - Focus on **code quality and minimalism**.
  - **Security** focus.
  - **Small feature set done well** (vs. Chainlit’s many features).
  - Only LangGraph, only Svelte, only OpenAI API, only OpenID Connect — deliberate decisions to keep the codebase small and supported.
  - **Commitment to long-term security support** (e.g. 2 years vs. Chainlit’s “2 weeks”).

### MVP Requirements

- Use the conversation discussion to define the minimum set of requirements.
- Simple website that doesn’t say anything factually untrue.
- The earlier the website is online, the better for SEO.
- Mention “combining Chainlit with Svelte,” link to GitHub.
- Comparison between Chainlit and us.

### Current State (Already Achieved)

- Support **generic OIDC login** (OpenID Connect authentication).
- Support **any OpenAI-compatible provider or endpoint**.

---

## Product Strategy

### Target Users

- Developers and product people deciding to use the open source.
- Boutique agencies building AI applications.
- SaaS platform dev teams using Chainlit.
- Custom LLM application builders.
- Customer service bot builders (CX has “very, very big demand right now”).
- Small development agencies without budget for a custom front end.

### Competitive Position

- Not trying to replace all of Chainlit. Competing with **some** features of Chainlit with focus on:
  - **Quality over quantity** of features.
  - **Security and stability**.
  - **Long-term maintainability**.

### Business Model Consideration

- **Customers** (paying) and **users** (open source adopters) are different groups. Open source users may include competitors; “the market space is very large and mostly unsaturated.”
- Potential path: people try to build something with the front end, struggle, then ask for help → **consulting business**.

### Technical Constraints

- Being “married to LangGraph” is a potential constraint; other frameworks (e.g. Google ADK) are gaining traction.
- Chose LangGraph because: well-defined protocol, not married to any particular LLM provider, open source LangGraph server exists.
- Future consideration: supporting different backend protocols (challenging but not impossible).

---

## Product Roadmap

### Immediate (Current Sprint)

- Complete migration from Flow to Shadcn CDN.
- Navigation bar (mobile view).
- 2–3 tickets remaining, expected done by end of January including reviews.

### Near-term

- Randy to create scoping ticket for UI/UX prototype.
- Define **use cases** (specific user scenarios) before building abstractions.
- **Website launch**.

### Longer-term (e.g. 2-year horizon)

- Release schedule.
- Policy decisions on **security support commitment**.
- **App-within-app deployment** (web components).
- Potentially supporting **different backend protocols**.

### Use Case Development Approach

- Start with **specific use cases**, then find patterns.
- “Imagine an agentic use case… things you already do in Claude with MCPs.”
- Different user profiles have different needs (e.g. engineer vs. tourist).
- **End users** for UI/UX focus; **developer experience (DX)** is a separate concern.

---

## Goals 2026

### Outcomes

**Dhruv**

- Invest more time in the project.

**Mathijs**

- “Grand success” = enough money to hire Randy, Dhruv, and Mathijs off current main appointments to focus full-time.

**Randy**

- Launch open source with **actual people using it**.
- **People contributing** to it.
- **Getting inbound requests** based on it.

### Metrics

**Randy’s success signals**

- Something **live**.
- People **actually using** it.
- People **contributing** (including comments like “this is cool” or “can you build this?”).
- **Inbound requests** coming in.

**Ultimate metric**

- Team members can live full-time off this work (Dhruv first, Mathijs second, Randy third due to need for stability).
