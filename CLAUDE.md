# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Opinionated SvelteKit/Flowbite based LLM frontend for LangGraph server. This is a monorepo managed by moonrepo with pnpm workspaces.

## Architecture

- **Backend** (apps/backend/): Python 3.12 + LangGraph server for AI workflow management
- **Frontend** (apps/frontend/): SvelteKit + TypeScript with Tailwind CSS and Flowbite components
- **Build System**: [moonrepo](https://moonrepo.dev/docs) for task orchestration and dependency management

## Essential Commands

All commands use moon for consistency and optimal caching:

### Development
```bash
# Start both frontend and backend dev servers with hot reload
moon :dev

# Run development server for specific project
moon frontend:dev
moon backend:dev
```

### Testing & Quality Checks
```bash
# Run ALL checks (lint, typecheck, format) for entire workspace
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

Both frontend and backend require .env files:
1. Copy `.env.example` to `.env` in respective directories
2. Backend: `apps/backend/.env` (authentication, API keys, tracing)
3. Frontend: `apps/frontend/.env` (auth config, API URLs, monitoring)

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

## Notes

- Always use moon commands instead of direct npm/pnpm/python commands for consistency
- Moon caches results across the team via remote caching
- The `:` prefix runs tasks across all projects (e.g., `moon :dev`)
- Specific project tasks use `project:task` format (e.g., `moon frontend:test`)