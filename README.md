# svelte-langgraph

[![CI](https://github.com/synergyai-nl/svelte-langgraph/actions/workflows/ci.yml/badge.svg)](https://github.com/synergyai-nl/svelte-langgraph/actions/workflows/ci.yml)
[![Maintainability](https://qlty.sh/gh/synergyai-nl/projects/svelte-langgraph/maintainability.svg)](https://qlty.sh/gh/synergyai-nl/projects/svelte-langgraph)
[![Code Coverage](https://qlty.sh/gh/synergyai-nl/projects/svelte-langgraph/coverage.svg)](https://qlty.sh/gh/synergyai-nl/projects/svelte-langgraph)

Opinionated SvelteKit-based LLM frontend for LangGraph agents, served by [Aegra](https://docs.aegra.dev) — an open-source, self-hosted Agent Protocol server.

## Demo
https://svelte-langgraph-demo.synergyai.nl/

## Architecture

- **Backend**: Python 3.12 + [Aegra](https://docs.aegra.dev) (open-source Agent Protocol server) running LangGraph workflows, backed by PostgreSQL
- **Frontend**: SvelteKit + TypeScript with Tailwind CSS and shadcn/bits-ui components
- **Authentication**: Generic OIDC (OpenID Connect) integration
- **Internationalization**: Paraglide-JS for multi-language support

## Prerequisites

- [Install moonrepo](https://moonrepo.dev/docs/install), which installs all other dependencies:
  - Python 3.12
  - Node.js 24 LTS
  - [uv](https://docs.astral.sh/uv/) (Python package manager)
  - pnpm (Node.js package manager)
- [Docker](https://docs.docker.com/get-docker/) **or** a local PostgreSQL server (≥ 13) — the backend needs a reachable PostgreSQL database; Docker is one option, see "Without Docker" below

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
- `DATABASE_URL` - PostgreSQL connection URL for Aegra. Leave unset for the common setups: `moon backend:dev` on the host defaults to `localhost:5432/aegra` (what `moon backend:docker-postgres` serves), and `docker compose up` points at the compose `postgres` service automatically. Set it only for your own/external database server. If you set up before this changed, see the [caveat under Production](#production) — `docker compose up` now honors an explicit `DATABASE_URL` instead of overriding it
- `AUTH_TYPE` - Must be `custom` to enable OIDC authentication and per-user isolation (Aegra defaults to `noop`, which disables auth)
- `OTEL_TARGETS` - Optional OpenTelemetry tracing fan-out (e.g. `LANGFUSE`, with `LANGFUSE_*` keys)

**Frontend Variables:**
- `AUTH_TRUST_HOST` - Enable auth trust host (set to `true` for development)
- `AUTH_OIDC_CLIENT_ID` - Your OIDC client ID (e.g., `svelte-langgraph`)
- `AUTH_OIDC_CLIENT_SECRET` - Your OIDC client secret
- `AUTH_SECRET` - Random string for session encryption (generate with `npx auth secret`)
- `PUBLIC_LANGGRAPH_API_URL` - URL of your Aegra server (typically `http://localhost:2026`)
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

### Local Development with OIDC Mock Provider

For local development and testing, the project includes a mock OIDC provider using `oidc-provider-mock`. This lightweight Python-based mock server simulates a real OIDC provider, allowing you to develop and test authentication flows without needing to set up a full OAuth2/OIDC provider.

**What it does:**
- Provides a complete OIDC discovery endpoint (`.well-known/openid-configuration`)
- Issues JWT tokens with configurable user claims
- Supports the authorization code flow with PKCE
- No client registration required - accepts any client ID/secret
- Started alongside the other dev servers via the `:oidc-mock` target (see below)

**Configuration:**
- **Issuer**: `http://localhost:8080`
- **Client ID**: Any value (e.g., `svelte-langgraph`)
- **Client Secret**: Any value (e.g., `secret`)
- **Test User**: `test-user` (subject claim in JWT)

### Start dev servers

The following command ensures dependencies are installed and starts dev servers for frontend, backend, Docker Postgres, and OIDC mock provider, with hot reload:

```bash
moon :dev :docker-postgres :oidc-mock
```

This automatically starts:
- **Frontend** dev server at `http://localhost:5173`
- **Backend** Aegra server at `http://localhost:2026`
- **Postgres** via the `backend:docker-postgres` task, which runs the compose `postgres` helper service
- **OIDC mock provider** at `http://localhost:8080` (for local authentication)

`:docker-postgres` is the Docker-based Postgres helper — include it if you want Docker to manage Postgres for you. If you're running your own local PostgreSQL server instead, omit it and run `moon :dev :oidc-mock`.

Make sure to configure your `.env` file to point to the OIDC mock provider (see Configuration section above).

#### Without Docker

The backend only needs a reachable PostgreSQL server (≥ 13) — Docker isn't required:

- A database named `aegra`. With the default `postgres:postgres@localhost:5432` credentials you don't need to set anything; otherwise point `DATABASE_URL` in `.env` at your server
- For E2E, a separate `aegra_e2e` database is created/dropped automatically before each run by `apps/backend/scripts/reset_test_db.py`, configured via `TEST_DATABASE_URL` in `.env.e2e` — the role in that URL needs the `CREATEDB` attribute (or superuser) to drop/recreate it: `ALTER ROLE <role> CREATEDB;`
- `pgvector` is optional — only needed if Aegra's store semantic search is ever enabled

### Run local checks

Run all checks (linting, type checking, formatting, building, unit and E2E tests):

```bash
moon check --all
```

This requires Docker to be running for the backend Docker image build, and a running PostgreSQL server for the E2E tests — start one first with `moon backend:docker-postgres` unless you run your own.

On machines without Docker, run the non-Docker equivalent instead — with a local PostgreSQL server running:

```bash
moon check backend frontend
moon e2e:test
```

## Tooling

### Backend Development

The backend uses LangGraph for AI workflow orchestration with the following key dependencies:

- [Aegra](https://docs.aegra.dev) as the Agent Protocol server (FastAPI + PostgreSQL), SDK-compatible with LangGraph Platform
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

This starts the frontend, the backend (Aegra), and PostgreSQL. The backend can also be built and run on its own:

```
moon backend:up
```

The frontend container receives an allowlisted set of variables interpolated from the root `.env` (auth and `PUBLIC_*` settings — backend secrets like API keys and `DATABASE_URL` are deliberately not passed to it). `PUBLIC_LANGGRAPH_API_URL` is consumed by the browser, not the container; it defaults to `http://localhost:2026`, which works when your browser runs on the Docker host. Point it elsewhere for any other setup:

```
PUBLIC_LANGGRAPH_API_URL=https://backend.example.com docker compose up --build
```

`DATABASE_URL` can be overridden the same way, to point the backend at an external or managed Postgres server instead of the bundled `postgres` service. It must be reachable _from inside the backend container_ — a `localhost` URL there means the container itself, not your host.

A host-local Ollama (or other OpenAI-compatible provider bound to the Docker host) must be addressed as `OPENAI_BASE_URL=http://host.docker.internal:11434/v1`. Compose wires `extra_hosts: host.docker.internal:host-gateway`, so this resolves on Linux Docker Engine too (>= 20.10) — Docker Desktop provides it natively.

**Caveat:** if your root `.env` already sets `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aegra` (the old shipped default), `docker compose up` now honors it instead of silently overriding it — and that `localhost` resolves to the container itself, not Postgres. Comment out the line, or change the host to `postgres`, to fix it.

### Security notes

The backend image bakes in `AUTH_TYPE=custom`, so it always requires OIDC bearer tokens — it cannot silently fall back to Aegra's unauthenticated `noop` mode. Because every request must carry an `Authorization` header (no cookies), the API serves wildcard CORS, the standard posture for token-authenticated APIs. Operators who additionally want to pin allowed origins can mount their own Aegra config and point `AEGRA_CONFIG` at it, e.g. `AEGRA_CONFIG=/etc/aegra/aegra.json` with a concrete `http.cors.allow_origins` list.

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
