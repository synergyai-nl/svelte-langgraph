# svelte-langgraph Setup Guide

This project is now set up and ready for development.

## Prerequisites Installed

- **moon** (v1.41.7) – monorepo orchestration
- **uv** – Python package manager
- **pnpm** – Node.js package manager
- **Python 3.12** – via uv
- **Node.js 24** – via proto (moon setup)

## Quick Start

### 1. Add your OpenAI API key (required for chat)

Edit `.env` and set:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

For local models (Ollama) or OpenRouter, see the main [README.md](./README.md#ai-provider-configuration).

### 2. Start development servers

Ensure proto and uv are in your PATH, then:

```bash
export PATH="$HOME/.proto/bin:$HOME/.local/bin:$PATH"
pnpm dev
```

Or add to your `~/.zshrc` for persistence:

```bash
# svelte-langgraph
export PATH="$HOME/.proto/bin:$HOME/.local/bin:$PATH"
```

### 3. Access the app

| Service        | URL                          |
|----------------|------------------------------|
| Frontend       | http://localhost:5173        |
| LangGraph API  | http://localhost:2024        |
| OIDC Mock      | http://localhost:8080        |

> **Note:** If port 5173 is in use, Vite will use 5174 instead.

## Useful Commands

```bash
# Run all checks (lint, format, build, test)
pnpm exec moon check --all

# Run E2E tests
pnpm exec moon run e2e:test

# Run E2E tests with UI
pnpm exec moon run e2e:test-ui
```

## Troubleshooting

**"No interpreter found for Python ==3.12.*"**
- Ensure `UV_PYTHON_INSTALL=always` is set when running moon
- Or run `uv python install 3.12` once

**"vite: No such file or directory"**
- Run `pnpm install` from the project root
- Ensure `$HOME/.proto/bin` is in your PATH (moon uses proto's Node.js)
