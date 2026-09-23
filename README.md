# SLG-133 preview screenshots

Screenshots of the actual local app at commit `0affdc8cd26ec8a46849b0709fbe2acff8db0a90` (the combined PR #292–#295 stack), captured in Chromium on 2026-09-23.

The app ran with the real backend and an isolated disposable PostgreSQL database, the repository’s test OIDC provider, and deterministic mocked AI responses. These are UI preview illustrations, not evidence of a live-model evaluation. Mathijs has not personally tested the implementation in a browser yet.

- `full-page-chat.png`: thread history, messages, state field, and composer at 1440 × 1000.
- `embedded-chat.png`: the same chat surface in a fixed-height card at 1440 × 900.
- `embedded-chat-mobile.png`: embedded card at 390 × 844, captured by resizing the desktop browser viewport.
- `demo-overview.png`: demo navigation and available integration patterns at 1440 × 1100.

Related pull requests: [#293](https://github.com/synergyai-nl/svelte-langgraph/pull/293), [#294](https://github.com/synergyai-nl/svelte-langgraph/pull/294), [#295](https://github.com/synergyai-nl/svelte-langgraph/pull/295).

This branch contains review assets only.
