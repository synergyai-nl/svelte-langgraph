# svelte-langgraph

Opinionated SvelteKit/Flowbite based LLM frontend for LangGraph server.

## Demo
https://svelte-langgraph-demo.synergyai.nl/

## Architecture

- **Backend**: Python 3.12 + LangGraph server for AI workflow management
- **Frontend**: SvelteKit + TypeScript with Tailwind CSS and Flowbite components
- **Authentication**: Generic OIDC (OpenID Connect) integration
- **Internationalization**: Paraglide-JS for multi-language support

## Prerequisites

- [Install moonrepo](https://moonrepo.dev/docs/install), which installs all other dependencies:
  - Python 3.12
  - Node.js 24 LTS
  - [uv](https://docs.astral.sh/uv/) (Python package manager)
  - pnpm (Node.js package manager)

## Configuration

Both the frontend and backend require environment variables to be configured. Copy the example files and update them with your values:

### Backend Environment Variables

Copy the example file:

```bash
cd apps/backend
cp .env.example .env
```

Configure the following variables in `apps/backend/.env`:

- `AUTH_OIDC_ISSUER` - Your OIDC provider's issuer URL (e.g., `http://localhost:8080` for local mock)
- `OPENAI_API_KEY` - Your OpenAI-compatible API key (e.g., OpenAI, OpenRouter)
- `OPENAI_BASE_URL` - OpenAI-compatible API base URL (optional, defaults to OpenAI)
- `CHAT_MODEL_NAME` - OpenAI-compatible model to use (defaults to `gpt-4o-mini`)
- `LANGSMITH_API_KEY` - Your LangSmith API key for tracing (optional)
- `LANGSMITH_ENDPOINT` - LangSmith endpoint URL (defaults to EU region)

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

### Frontend Environment Variables

Copy the example file:

```bash
cd apps/frontend
cp .env.example .env
```

Configure the following variables in `apps/frontend/.env`:

- `AUTH_TRUST_HOST=true` - Enable auth trust host for development
- `AUTH_OIDC_CLIENT_ID` - Your OIDC client ID (e.g., `svelte-langgraph`)
- `AUTH_OIDC_CLIENT_SECRET` - Your OIDC client secret
- `AUTH_OIDC_ISSUER` - Your OIDC provider's issuer URL (e.g., `http://localhost:8080` for local mock)
- `AUTH_SECRET` - Random string for session encryption (generate with `npx auth secret`)
- `PUBLIC_LANGCHAIN_API_KEY` - Your LangChain API key for client-side requests
- `PUBLIC_LANGGRAPH_API_URL` - URL of your LangGraph server (typically `http://localhost:2024`)
- `PUBLIC_SENTRY_DSN` - Public DSN for your Sentry project, for error tracking and user feedback.
- `PUBLIC_SENTRY_SEND_PII` - Optional: Enable PII (Personally Identifiable Information) capture in Sentry.
- `SENTRY_AUTH_TOKEN` - Sentry auth token for source map uploads.
- `SENTRY_ORG` - Sentry org for source map uploads.
- `SENTRY_PROJECT` - Sentry project for source map uploads.

## Getting Started

### Local Development with OIDC Mock Provider

For local development and testing, the project includes a mock OIDC provider using `oidc-provider-mock`. This lightweight Python-based mock server simulates a real OIDC provider, allowing you to develop and test authentication flows without needing to set up a full OAuth2/OIDC provider.

**What it does:**
- Provides a complete OIDC discovery endpoint (`.well-known/openid-configuration`)
- Issues JWT tokens with configurable user claims
- Supports the authorization code flow with PKCE
- No client registration required - accepts any client ID/secret
- Can be started independently with `moon backend:oidc-mock`

**Configuration:**
- **Issuer**: `http://localhost:8080`
- **Client ID**: Any value (e.g., `svelte-langgraph`)
- **Client Secret**: Any value (e.g., `secret`)
- **Test User**: `test-user` (subject claim in JWT)

### Start dev servers

The following command ensures dependencies are installed and starts dev servers for frontend and backend with hot reload:

```bash
moon :dev
```

This automatically starts:
- **Frontend** dev server at `http://localhost:5173`
- **Backend** LangGraph server at `http://localhost:2024`

For local development with authentication, also start the OIDC mock provider:

```bash
moon backend:oidc-mock
```

This starts:
- **OIDC mock provider** at `http://localhost:8080` (for local authentication)

Make sure to configure your `.env` files to point to the OIDC mock provider (see Configuration section above).

**Note:** E2E tests automatically start the OIDC mock provider, so you don't need to run it separately for testing.

### Run local checks

Run all checks (linting, type checking, formatting):

```bash
moon check --all
```

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
- Flowbite for UI components
- Playwright for end-to-end testing
- Vitest for unit testing

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
