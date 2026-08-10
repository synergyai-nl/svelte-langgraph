# svelte-langgraph

[![CI](https://github.com/synergyai-nl/svelte-langgraph/actions/workflows/ci.yml/badge.svg)](https://github.com/synergyai-nl/svelte-langgraph/actions/workflows/ci.yml)
[![Maintainability](https://qlty.sh/gh/synergyai-nl/projects/svelte-langgraph/maintainability.svg)](https://qlty.sh/gh/synergyai-nl/projects/svelte-langgraph)
[![Code Coverage](https://qlty.sh/gh/synergyai-nl/projects/svelte-langgraph/coverage.svg)](https://qlty.sh/gh/synergyai-nl/projects/svelte-langgraph)

Opinionated SvelteKit-based LLM frontend for LangGraph server.

## Demo
https://svelte-langgraph-demo.synergyai.nl/

## Architecture

- **Backend**: Python 3.12 + LangGraph server for AI workflow management
- **Frontend**: SvelteKit + TypeScript with Tailwind CSS and shadcn/bits-ui components
- **Authentication**: Generic OIDC (OpenID Connect) integration
- **Internationalization**: Paraglide-JS for multi-language support

## Prerequisites

This repo uses [Proto](https://moonrepo.dev/docs/proto/install) with `.prototools` to pin **moon** (^1.41.8) and **pnpm**. Moon installs and manages the rest of the toolchain (Python 3.12, Node.js, [uv](https://docs.astral.sh/uv/)).

1. **Install Proto** — see the [Proto installation guide](https://moonrepo.dev/docs/proto/install), or:

   ```bash
   bash <(curl -fsSL https://moonrepo.dev/install/proto.sh)
   ```

2. **Clone the repo and install pinned tools**:

   ```bash
   git clone https://github.com/synergyai-nl/svelte-langgraph.git
   cd svelte-langgraph
   proto install
   ```

3. **Ensure PATH** includes Proto and uv:

   ```bash
   export PATH="$HOME/.proto/bin:$HOME/.local/bin:$PATH"
   ```

   Add that line to your shell profile (e.g. `~/.zshrc`) for persistence.

4. **First-time setup** (if needed):

   ```bash
   moon setup
   ```

Do not run `pnpm install` or `pnpm dev` at the repo root — use `moon` tasks instead (see Getting Started).

## Configuration

The monorepo uses a single `.env` file at the root to configure both frontend and backend. Copy the example file and update it with your values:

```bash
cp .env.example .env
```

### Environment Variables

The `.env` file is organized into sections:

**Common Variables:**
- `AUTH_OIDC_ISSUER` - Your OIDC provider's issuer URL (e.g., `http://localhost:8080` for local mock)

**Backend Variables:**
- `OPENAI_API_KEY` - Your OpenAI-compatible API key (e.g., OpenAI, OpenRouter)
- `OPENAI_BASE_URL` - OpenAI-compatible API base URL (optional, defaults to OpenAI)
- `CHAT_MODEL_NAME` - OpenAI-compatible model to use (defaults to `gpt-4o-mini`)
- `LANGSMITH_API_KEY` - Your LangSmith API key for tracing (optional)
- `LANGSMITH_ENDPOINT` - LangSmith endpoint URL (optional, defaults to EU region)

**Frontend Variables:**
- `AUTH_TRUST_HOST` - Enable auth trust host (set to `true` for development)
- `AUTH_OIDC_CLIENT_ID` - Your OIDC client ID (e.g., `svelte-langgraph`)
- `AUTH_OIDC_CLIENT_SECRET` - Your OIDC client secret
- `AUTH_SECRET` - Random string for session encryption (generate with `npx auth secret`)
- `PUBLIC_LANGGRAPH_API_URL` - URL of your LangGraph server (typically `http://localhost:2024`)
- `PUBLIC_SENTRY_DSN` - Public DSN for Sentry error tracking (optional)

### AI Provider Configuration

This application supports multiple OpenAI-compatible providers. Configure your preferred provider using the environment variables above.

#### Using OpenAI (Default)

To use OpenAI directly (no additional configuration needed):

```bash
# .env
OPENAI_API_KEY=your_openai_api_key
# OPENAI_BASE_URL not needed for OpenAI (uses default)
CHAT_MODEL_NAME=gpt-4o-mini  # Default OpenAI model
```

Popular OpenAI models:

- `gpt-4o-mini` - Fast, cost-effective model (default)
- `gpt-4o` - Most capable model
- `gpt-3.5-turbo` - Legacy model

#### Using OpenRouter

OpenRouter provides access to multiple AI models including free options:

```bash
# .env
OPENAI_API_KEY=your_openrouter_api_key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
CHAT_MODEL_NAME=x-ai/grok-4-fast:free  # Free Grok model
```

Popular OpenRouter models:

- `x-ai/grok-4-fast:free` - Free Grok model
- `meta-llama/llama-3.2-3b-instruct:free` - Free Llama model
- `anthropic/claude-3.5-sonnet` - Claude 3.5 Sonnet (paid)

#### Using Ollama

For local AI models using Ollama:

```bash
# .env
OPENAI_API_KEY=ollama  # Can be any value for local usage
OPENAI_BASE_URL=http://localhost:11434/v1
CHAT_MODEL_NAME=llama3.2  # Your local Ollama model
```

### Reasoning / Thinking Display

The frontend shows LLM reasoning/thinking tokens in a collapsible block above AI messages, when the model provides them. Reasoning is picked up from `additional_kwargs.reasoning_content` (OpenRouter) and from `{type: "reasoning"}` / `{type: "thinking"}` content blocks (langchain v1 standard / Anthropic-native).

By default, `CHAT_MODEL_NAME` is routed through the generic OpenAI-compatible path (`OPENAI_API_KEY`/`OPENAI_BASE_URL`), unchanged from before. To use a langchain-native provider integration instead, prefix `CHAT_MODEL_NAME` with a provider known to `init_chat_model` (e.g. `openrouter:deepseek/deepseek-r1`); it's then routed through that provider's integration instead of the generic path. Provider-specific options go in `CHAT_MODEL_KWARGS` (JSON) and are forwarded to `init_chat_model` as keyword args (with defaults like `temperature=0.9` applied; reserved keys like `model`/`model_provider` are rejected).

To enable reasoning output via OpenRouter — the `openrouter:` prefix and API key alone are not enough, OpenRouter only emits reasoning tokens when explicitly requested via the `reasoning` key in `CHAT_MODEL_KWARGS`:

```bash
# .env
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_API_BASE=https://openrouter.ai/api/v1
CHAT_MODEL_NAME=openrouter:deepseek/deepseek-r1
CHAT_MODEL_KWARGS="{\"reasoning\": {\"effort\": \"medium\"}}"
```

`CHAT_MODEL_KWARGS` must be valid JSON, which requires double-quoted keys/strings. Wrap the value in double quotes and escape the inner ones as above; an unquoted value (`CHAT_MODEL_KWARGS={"reasoning": ...}`) fails to parse when loaded via moon's `envFile` task option (used by `moon backend:dev`/`moon backend:up`) and breaks on word-splitting if the variable is ever exported as a shell variable instead.

**Caveat:** the generic OpenAI-compatible path (`ChatOpenAI` pointed at OpenRouter via `OPENAI_BASE_URL`) drops reasoning tokens entirely — a known langchain limitation ([langchain#34328](https://github.com/langchain-ai/langchain/issues/34328)). Reasoning display requires the `openrouter:` prefix above. Other langchain-integrated providers can expose reasoning the same way once their integration package is added to the backend dependencies.

## Getting Started

1. **Install pinned tools** (from the repo root):

   ```bash
   proto install
   ```

2. **Configure environment**:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your API keys and auth settings (see Configuration above).

3. **Start the full local stack**:

   ```bash
   moon :dev :oidc-mock
   ```

   This starts the frontend, LangGraph backend, and OIDC mock provider with hot reload:
   - **Frontend** at `http://localhost:5173`
   - **Backend** LangGraph server at `http://localhost:2024`
   - **OIDC mock provider** at `http://localhost:8080`

### Local Development with OIDC Mock Provider

For local development and testing, the project includes a mock OIDC provider using `oidc-provider-mock`. This lightweight Python-based mock server simulates a real OIDC provider, allowing you to develop and test authentication flows without needing to set up a full OAuth2/OIDC provider.

The OIDC mock is **not** started by `moon :dev` alone — include `:oidc-mock` (as above) or run `moon backend:oidc-mock` in a separate terminal alongside `moon :dev`.

**What it does:**
- Provides a complete OIDC discovery endpoint (`.well-known/openid-configuration`)
- Issues JWT tokens with configurable user claims
- Supports the authorization code flow with PKCE
- No client registration required - accepts any client ID/secret

**Configuration:**
- **Issuer**: `http://localhost:8080`
- **Client ID**: Any value (e.g., `svelte-langgraph`)
- **Client Secret**: Any value (e.g., `secret`)
- **Test User**: `test-user` (subject claim in JWT)

Make sure your `.env` file points to the OIDC mock provider (see Configuration section above).

### Run local checks

Run all checks (linting, type checking, formatting, building, unit and E2E tests):

```bash
moon check --all
```

This currently requires Docker to be running for the LangGraph server build.

## Tooling

### Backend Development

The backend uses LangGraph for AI workflow orchestration with the following key dependencies:

- LangChain with OpenAI-compatible integration (OpenRouter, OpenAI, etc.)
- Authlib for OIDC/JWT authentication
- Python-dotenv for environment management

### Frontend Development

The frontend is built with modern web technologies:

- SvelteKit for the application framework
- Tailwind CSS for styling
- shadcn/bits-ui for UI components
- Playwright for end-to-end testing
- Vitest for unit testing

### End to end testing

End to end tests are written using Playwright with fixtures and page object models. They live in their own project in `e2e/`.

They can be run with:

```
moon e2e:test
```

Or, interactively, with:

```
moon e2e:test-ui
```

## Production

To run a Docker build of the project, use Docker Compose:

```
docker compose build
```

To run it:

```
docker compose up [--build]
```

For now, we will not be running the backend in Docker, so to test with the dev backend, it's required to make it available to the Docker container and inform the Docker container of your IP:

```
moon backend:dev -- --host 0.0.0.0
```

And in a different terminal:

```
PUBLIC_LANGGRAPH_API_URL=http://host.docker.internal:2024 docker compose up --build
```

### Internationalization with Paraglide

This project uses [Paraglide-JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) for type-safe internationalization. Paraglide offers a developer-friendly approach where you can:

- **Add or modify translations** without touching code - just edit JSON files
- **Add new languages** by creating a new JSON file and updating one config line
- **Change locale names** (e.g., "English" → "Inglés") without any code changes

#### Message Files

All translations are stored in `apps/frontend/messages/`:

Each file contains key-value pairs for all UI text:
```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "hello_world": "Hello, {name}!",
  "local_name": "English"
}
```

The `local_name` key is special - it defines how each language refers to itself in the language switcher.

#### Adding a New Language

1. Create a new JSON file in `apps/frontend/messages/` (e.g., `fr.json` for French)
2. Copy the structure from `en.json` and translate all values
3. Add the locale code to `apps/frontend/project.inlang/settings.json`:
```json
{
  "locales": ["en", "nl", "hi", "fr"]
}
```

That's it! The language will automatically appear in the language switcher with the name specified in `local_name`.
