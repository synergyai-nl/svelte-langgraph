# svelte-langgraph

Opinionated SvelteKit/Flowbite based LLM frontend for LangGraph server.

## Architecture

- **Backend**: Python 3.12 + LangGraph server for AI workflow management
- **Frontend**: SvelteKit + TypeScript with Tailwind CSS and Flowbite components
- **Authentication**: Descope integration
- **Internationalization**: Paraglide-JS for multi-language support

## Prerequisites

- Python 3.12
- Node.js 24 LTS
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- pnpm (Node.js package manager)
- [moonrepo](https://moonrepo.dev/) (monorepo orchestration)

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

This project uses [moonrepo](https://moonrepo.dev/) for monorepo orchestration. You can run tasks across all projects or target specific projects.

### Development Servers

Start both frontend and backend development servers:

```bash
moon :dev
```

## Development

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

#### Available Commands

With moonrepo, you can run tasks across projects:

```bash
# Run all tests across both projects
moon :test

# Build all projects
moon :build

# Lint and format all code
moon :lint
moon :format

# Check all projects (includes linting, formatting, type checking)
moon check --all
```

Or target specific projects:

```bash
# Frontend specific
moon frontend:dev          # Start development server
moon frontend:build        # Build for production
moon frontend:preview      # Preview production build
moon frontend:test         # Run all tests
moon frontend:test-unit    # Run unit tests
moon frontend:test-e2e     # Run end-to-end tests
moon frontend:lint         # Lint code
moon frontend:format       # Format code
moon frontend:check        # Type check with svelte-check

# Backend specific
moon backend:dev           # Start LangGraph development server
moon backend:test          # Run tests
moon backend:lint          # Lint code
moon backend:format        # Format code
```

## Production

### Building for Production

Build all projects for production:

```bash
moon :build
```

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Project Structure

```
svelte-langgraph/
├── .moon/                    # Moonrepo configuration
│   ├── workspace.yml         # Workspace configuration
│   ├── toolchain.yml         # Package managers configuration
│   └── cache/                # Build cache
├── apps/
│   ├── backend/              # LangGraph Python server
│   │   ├── src/              # Source code
│   │   ├── moon.yml          # Backend project configuration
│   │   ├── langgraph.json    # LangGraph configuration
│   │   └── pyproject.toml    # Python dependencies
│   └── frontend/             # SvelteKit application
│       ├── src/              # Source code
│       ├── messages/         # Internationalization files
│       ├── e2e/              # End-to-end tests
│       ├── moon.yml          # Frontend project configuration
│       └── package.json      # Node.js dependencies
└── README.md
```

## Moonrepo Configuration

This project is configured to use moonrepo for:

- **Task orchestration**: Run tasks across multiple projects with caching and dependency management
- **Package management**: Coordinated dependency installation for both Node.js (pnpm) and Python (uv)
- **Build optimization**: Intelligent caching and parallel execution of tasks
- **Development workflow**: Simplified commands for common development tasks

Key configuration files:
- `.moon/workspace.yml`: Defines project mapping and workspace settings
- `.moon/toolchain.yml`: Configures package managers (pnpm for Node.js, uv for Python)
- `apps/*/moon.yml`: Individual project configurations with tasks and dependencies
