# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Opinionated SvelteKit-based LLM frontend for LangGraph server. This is a monorepo managed by moonrepo with pnpm workspaces.

## Architecture

- **Backend** (apps/backend/): Python 3.12 + [Aegra](https://docs.aegra.dev) (open-source Agent Protocol server) running LangGraph workflows, backed by PostgreSQL (Docker Compose helper or your own server)
- **Frontend** (apps/frontend/): SvelteKit + TypeScript with Tailwind CSS and shadcn/bits-ui components
- **End to end tests** (e2e/): Playwright + TypeScript. Run with `moon e2e:test`.
- **Build System**: [moonrepo](https://moonrepo.dev/docs) for task orchestration and dependency management

## Essential Commands

All commands use moon for consistency and optimal caching:

### Development
```bash
# Start frontend, backend, Docker Postgres, and OIDC mock provider dev servers with hot reload
# :docker-postgres is the optional Docker Postgres helper — omit it if you run your own local PostgreSQL server
moon :dev :docker-postgres :oidc-mock

# Run development server for specific project
moon frontend:dev
moon backend:dev
```

### Testing & Quality Checks
```bash
# Run ALL checks (lint, typecheck, format, build, unit and E2E tests) for entire workspace
# Note: Requires Docker (backend image build) and a running PostgreSQL server —
# start one first with `moon backend:docker-postgres` unless you run your own
moon check --all

# Run checks for specific project
moon check frontend
moon check backend

# Run specific check types
moon :lint           # Run linting
moon :typecheck      # Run type checking  
moon :format         # Check formatting
moon :test           # Run tests

# Auto-fix issues
moon :lint-fix       # Fix linting issues
moon :format-write   # Fix formatting issues
```

### Building
```bash
# Build entire workspace
moon :build

# Build specific project
moon frontend:build
moon backend:build
```

### Moon-Specific Features

#### Affected Projects
Run tasks only on projects affected by current changes:
```bash
moon run :lint :format --affected
moon check --affected
```

#### Task Querying
```bash
moon query projects      # List all projects
moon query tasks         # List all available tasks
moon task frontend:dev   # Show task details
```

#### Dependency Graphs
```bash
moon project-graph       # Interactive project dependency graph
moon task-graph          # Interactive task dependency graph
```

#### Cache Management
```bash
moon clean              # Clean cache and artifacts
moon run :build --updateCache  # Force cache update
```

## Environment Setup

The monorepo uses a single `.env` file at the root:
1. Copy `.env.example` to `.env` in the monorepo root
2. The .env file contains configuration for both frontend and backend:
   - Common: Shared authentication settings
   - Backend: API keys, model configuration, tracing
   - Frontend: Auth config, API URLs, monitoring

## Project Structure

```
/
├── apps/
│   ├── backend/      # Python LangGraph server
│   └── frontend/     # SvelteKit application
├── .moon/           # Moon configuration and cache
└── moon.yml files   # Project-specific task definitions
```

## Key Patterns

- Moon automatically installs dependencies when running tasks
- Git pre-commit hooks run `moon run :lint-fix :format-write --affected --status=staged`
- File groups in moon.yml define what files trigger rebuilds
- Tasks can extend other tasks (see `lint-fix` extending `lint` in moon.yml)
- Moon handles incremental builds - only rebuilds what changed
- Chat UX features require E2E test coverage — any changes to the chat UI or message flow must include or update E2E tests in `e2e/src/`

## Notes

- Always use moon commands instead of direct npm/pnpm/python commands for consistency
- The backend (Aegra) requires a reachable PostgreSQL server (≥ 13); Docker Compose's `postgres` service, started via `moon backend:docker-postgres`, is an optional helper for it — not a requirement. E2E resets its own `aegra_e2e` database (from `TEST_DATABASE_URL` in `.env.e2e`) via `apps/backend/scripts/reset_test_db.py` on every run. Docker is still required for `moon backend:build`/`moon backend:up` and for a full `moon check --all`
- Moon caches results across the team via remote caching
- The `:` prefix runs tasks across all projects (e.g., `moon :dev`)
- Specific project tasks use `project:task` format (e.g., `moon frontend:test`)
