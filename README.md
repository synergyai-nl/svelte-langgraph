# svelte-langgraph

Opinionated SvelteKit/Flowbite based LLM frontend for LangGraph server.

## Architecture

- **Backend**: Python 3.12 + LangGraph server for AI workflow management
- **Frontend**: SvelteKit + TypeScript with Tailwind CSS and Flowbite components
- **Authentication**: Descope integration
- **Internationalization**: Paraglide-JS for multi-language support

## Prerequisites

- [Install moonrepo](https://moonrepo.dev/docs/install), which installs all other dependencies:

	* Python 3.12
	* Node.js 24 LTS
	* [uv](https://docs.astral.sh/uv/) (Python package manager)
	* pnpm (Node.js package manager)

## Configuration

Both the frontend and backend require environment variables to be configured. Copy the example files and update them with your values:

### Backend Environment Variables

Copy the example file:
```bash
cd apps/backend
cp .env.example .env
```

Configure the following variables in `apps/backend/.env`:

- `DESCOPE_PROJECT_ID` - Your Descope project ID for authentication
- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude integration
- `LANGSMITH_API_KEY` - Your LangSmith API key for tracing (optional)
- `LANGSMITH_ENDPOINT` - LangSmith endpoint URL (defaults to EU region)

### Frontend Environment Variables

Copy the example file:
```bash
cd apps/frontend
cp .env.example .env
```

Configure the following variables in `apps/frontend/.env`:

- `AUTH_TRUST_HOST=true` - Enable auth trust host for development
- `AUTH_DESCOPE_ID` - Your Descope project ID
- `AUTH_DESCOPE_SECRET` - Your Descope management key
- `AUTH_SECRET` - Random string for session encryption (generate with `npx auth secret`)
- `PUBLIC_LANGCHAIN_API_KEY` - Your LangChain API key for client-side requests
- `PUBLIC_LANGGRAPH_API_URL` - URL of your LangGraph server (typically `http://localhost:8123`)

## Getting Started

### Start dev servers

The following command ensures dependencies are installed and starts dev servers for frontend and backend, with hot reload:

```bash
moon :dev
```

### Run local checks

Run all checks (linting, type checking, formatting):

```bash
moon check --all
```

## Tooling

### Backend Development

The backend uses LangGraph for AI workflow orchestration with the following key dependencies:
- LangChain with Anthropic integration
- Descope for authentication
- Python-dotenv for environment management

### Frontend Development

The frontend is built with modern web technologies:
- SvelteKit for the application framework
- Tailwind CSS for styling
- Flowbite for UI components
- Playwright for end-to-end testing
- Vitest for unit testing

## Production

To run a production build of the project (both frontend and backend components):

```bash
moon :build
```

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

