# AGENTS.md

## Essential Commands
```bash
moon :dev                    # Start frontend+backend+OIDC mock servers
moon frontend:test:unit      # Run single frontend test
moon :test                   # Run all tests
moon check --all             # Run all checks (lint, typecheck, format)
moon :lint-fix               # Auto-fix linting issues
moon :format-write           # Auto-fix formatting issues
moon :build                  # Build entire workspace
moon run :task --affected    # Run task on changed files only
```

## Code Style Guidelines
- **Frontend**: Tabs, single quotes, no trailing commas, 100 char width
- **Backend**: Ruff for lint/format, Pyright for typecheck
- **Imports**: External → Internal → Relative (with blank lines)
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Error handling**: Try-catch with proper typing, Sentry for frontend errors

## Architecture Patterns
- **Monorepo**: Moonrepo with pnpm workspaces (apps/frontend, apps/backend)
- **Frontend**: SvelteKit + TypeScript, Tailwind CSS, Flowbite components
- **Backend**: Python 3.12 + LangGraph, OIDC authentication
- **AI Integration**: LangGraph SDK for streaming, LangChain for model access
- **Auth**: OIDC with mock provider at localhost:8080 for development

## Development Workflow
- **Environment**: Copy .env.example to .env in both apps
- **Git hooks**: Pre-commit runs `moon run :lint-fix :format-write --affected --status=staged`
- **Testing**: Vitest for unit tests, Playwright for E2E tests
- **Moon features**: Use `:` prefix for all projects, `project:task` for specific projects
- **File groups**: Sources in src/**, tests in **/*.test.ts, messages in messages/