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
- [Docker](https://docs.docker.com/get-docker/) — required for the backend's PostgreSQL database (started automatically by `moon backend:dev` and the E2E tests)

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
- `DATABASE_URL` - PostgreSQL connection URL for Aegra (defaults to the `postgres` service from `docker-compose.yml`)
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

## Getting Started

### Local Development with OIDC Mock Provider

For local development and testing, the project includes a mock OIDC provider using `oidc-provider-mock`. This lightweight Python-based mock server simulates a real OIDC provider, allowing you to develop and test authentication flows without needing to set up a full OAuth2/OIDC provider.

**What it does:**
- Provides a complete OIDC discovery endpoint (`.well-known/openid-configuration`)
- Issues JWT tokens with configurable user claims
- Supports the authorization code flow with PKCE
- No client registration required - accepts any client ID/secret
- Automatically started with `moon :dev` for seamless development

**Configuration:**
- **Issuer**: `http://localhost:8080`
- **Client ID**: Any value (e.g., `svelte-langgraph`)
- **Client Secret**: Any value (e.g., `secret`)
- **Test User**: `test-user` (subject claim in JWT)

### Start dev servers

The following command ensures dependencies are installed and starts dev servers for frontend, backend, and OIDC mock provider, with hot reload:

```bash
moon :dev :oidc-mock
```

This automatically starts:
- **Frontend** dev server at `http://localhost:5173`
- **Backend** Aegra server at `http://localhost:2026` (plus its PostgreSQL database in Docker)
- **OIDC mock provider** at `http://localhost:8080` (for local authentication)

Docker must be running: the backend depends on a PostgreSQL container defined in `docker-compose.yml`, which is started automatically.

Make sure to configure your `.env` file to point to the OIDC mock provider (see Configuration section above).

### Run local checks

Run all checks (linting, type checking, formatting, building, unit and E2E tests):

```bash
moon check --all
```

This requires Docker to be running for the backend's PostgreSQL database and Docker image build.

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

The frontend container reads its configuration from the root `.env` file and defaults `PUBLIC_LANGGRAPH_API_URL` to `http://host.docker.internal:2026`, so it reaches the backend through your Docker host out of the box. Point it elsewhere by overriding the variable:

```
PUBLIC_LANGGRAPH_API_URL=https://backend.example.com docker compose up --build
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
