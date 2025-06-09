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

## Getting Started

### Backend Setup

Navigate to the backend directory and install dependencies:

```bash
cd apps/backend
uv sync
```

Start the development server:

```bash
uv run langgraph dev
```

### Frontend Setup

Navigate to the frontend directory and install dependencies:

```bash
cd apps/frontend
pnpm install
```

Start the development server:

```bash
npm run dev
```

Or open the app in a new browser tab:

```bash
npm run dev -- --open
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

#### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run test` - Run all tests
- `npm run test:unit` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests
- `npm run lint` - Lint code
- `npm run format` - Format code

## Production

### Frontend Build

To create a production version of the frontend:

```bash
cd apps/frontend
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Project Structure

```
svelte-langgraph/
├── apps/
│   ├── backend/          # LangGraph Python server
│   │   ├── src/         # Source code
│   │   └── langgraph.json
│   └── frontend/        # SvelteKit application
│       ├── src/         # Source code
│       ├── messages/    # Internationalization files
│       └── e2e/         # End-to-end tests
└── README.md
```