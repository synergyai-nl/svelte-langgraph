# svelte-langgraph Setup Guide

This project is now set up and ready for development.

## Prerequisites Installed

- **Proto** – installs pinned tools from `.prototools`
- **moon** (^1.41.8) – monorepo orchestration
- **pnpm** – Node.js package manager
- **uv** – Python package manager
- **Python 3.12** – via uv
- **Node.js 24** – via proto (moon setup)

## Quick Start

### 1. Install Proto and pinned tools

If you have not already, install [Proto](https://moonrepo.dev/docs/proto/install) and run from the repo root:

```bash
proto install
export PATH="$HOME/.proto/bin:$HOME/.local/bin:$PATH"
moon setup   # first time only, if needed
```

Add the `export PATH=...` line to your `~/.zshrc` for persistence.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set your OpenAI API key (required for chat):

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

For local models (Ollama) or OpenRouter, see the main [README.md](./README.md#ai-provider-configuration).

### 3. Start development servers

```bash
moon :dev :oidc-mock
```

This starts the frontend, LangGraph backend, and OIDC mock provider with hot reload.

### 4. Access the app

| Service        | URL                          |
|----------------|------------------------------|
| Frontend       | http://localhost:5173        |
| LangGraph API  | http://localhost:2024        |
| OIDC Mock      | http://localhost:8080        |

> **Note:** If port 5173 is in use, Vite will use 5174 instead.

## Useful Commands

```bash
# Run all checks (lint, format, build, test)
moon check --all

# Run E2E tests
moon e2e:test

# Run E2E tests with UI
moon e2e:test-ui
```

## Troubleshooting

**"No interpreter found for Python ==3.12.*"**
- Ensure `UV_PYTHON_INSTALL=always` is set when running moon
- Or run `uv python install 3.12` once

**"vite: No such file or directory"**
- Run `moon setup` from the project root (do not use `pnpm install` at the repo root)
- Ensure `$HOME/.proto/bin` is in your PATH (moon uses proto's Node.js)
