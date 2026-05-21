# sv

> **Monorepo note:** This app is part of the svelte-langgraph monorepo. See the [root README.md](../../README.md) for development setup (Proto + moon).

Svelte frontend project.

## Getting started

### Requirements

- Proto (installs pinned moon and pnpm via `.prototools`)
- Node 24 LTS (managed by moon/proto)

From the **repo root**, run `proto install` then use moon tasks — do not rely on `pnpm install` or `npm run dev` at the monorepo root.

### Developing

Start the frontend dev server from the repo root:

```bash
moon frontend:dev
```

Or start the full local stack (frontend, backend, and OIDC mock):

```bash
moon :dev :oidc-mock
```

You can also use npm scripts from this directory if needed:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

### Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
