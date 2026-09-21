# E2E Tests

Playwright-based end-to-end tests for the SvelteKit frontend, LangGraph backend, and OIDC authentication flow.

## Quick start

| Command                             | Description                               |
| ----------------------------------- | ----------------------------------------- |
| `moon e2e:test`                     | Run all tests (auto-starts all 4 servers) |
| `moon e2e:test-ui`                  | Open Playwright UI mode                   |
| `moon e2e:test -- --debug`          | Run with step-through debugger            |
| `moon e2e:test -- --workers=4`      | Override worker count                     |
| `moon -u e2e:test -- --grep "auth"` | Run matching tests (skip cache)           |

Moon automatically builds the frontend, sets up the backend, and starts ai-mock, OIDC mock, backend, and frontend servers before tests run.

## Project structure

```
src/
├── fixtures/
│   ├── test.ts          # Custom test fixture (app, chat, oidc)
│   ├── auth.ts          # Authentication helpers
│   └── backend.ts       # Direct API call helpers
├── pages/
│   ├── app.page.ts      # AppPage – nav, user menu, sign-in/out
│   ├── chat.page.ts     # ChatPage – extends AppPage with chat UI
│   └── oidc.page.ts     # OidcPage – mock OIDC provider interaction
├── auth.spec.ts
├── backend-integration.spec.ts
├── chat.spec.ts
└── demo.test.ts
```

## Writing tests

### Custom test fixture

Tests import `test` and `expect` from `fixtures/test.ts`, **not** from `@playwright/test`:

```ts
import { test, expect } from './fixtures/test';
```

The fixture provides three page objects automatically:

- **`app`** – `AppPage` instance (navigation, sign-in/out, user menu)
- **`chat`** – `ChatPage` instance (extends `AppPage` with chat-specific locators)
- **`oidc`** – `OidcPage` instance (mock OIDC provider)

### Page objects

Page objects define locators using role-based selectors:

```ts
this.signInButton = this.header.getByRole('button', { name: 'Sign in' });
this.userMenuButton = this.header.getByRole('button', { name: 'User' });
```

Prefer `getByRole`, `getByLabel`, and `getByText` over CSS/XPath selectors.

### Auth helpers (`fixtures/auth.ts`)

| Helper                        | Purpose                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `authenticateUser(page)`      | Full OIDC sign-in flow (navigate, click sign-in, authorize, wait for session) |
| `signOut(page)`               | Sign out via user menu dropdown                                               |
| `expectAuthenticated(page)`   | Assert user menu visible, sign-in button hidden                               |
| `expectUnauthenticated(page)` | Assert sign-in button visible, user menu hidden                               |

### Backend helpers (`fixtures/backend.ts`)

| Helper                                               | Purpose                                                   |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `makeAuthenticatedRequest(page, endpoint, options?)` | Make an API call with a current backend access token      |
| `getAccessToken(page)`                               | Obtain a token through the cookie-persisting app endpoint |

### Example test

```ts
import { test, expect } from './fixtures/test';
import { authenticateUser, expectAuthenticated } from './fixtures/auth';

test('user can sign in and see the chat page', async ({ app, page }) => {
	await authenticateUser(page);
	await expectAuthenticated(page);

	await app.navigateToChat();
	await expect(page).toHaveURL('/chat');
});
```

## Stability patterns

### Animations are disabled

`playwright.config.ts` sets `reducedMotion: 'reduce'`, which causes `tailwindcss-animate` to skip CSS animations. No explicit animation waits needed.

### Assertion timeout is 10 seconds

`expect.timeout` is `10_000` (not the default 5s) to handle CI resource contention.

### Server wait patterns

Each `webServer` in `playwright.config.ts` has a `wait` regex that must match actual server log output. If a server's startup log changes, update the corresponding `wait` pattern — otherwise tests will start before the server is ready.

### Navigation timing

After triggering navigation, wait for a **meaningful UI assertion** (e.g. a button becoming visible), not just a URL change. The URL can update before the page has finished rendering.

### Prefer SSR-visible state

UI that depends on server data (e.g. session) should be initialized from `page.data` during SSR rather than relying on client-side effects, so it's available immediately when Playwright sees the page.

## Mock servers

| Server    | Port | Purpose                                      | Started by               |
| --------- | ---- | -------------------------------------------- | ------------------------ |
| ai-mock   | 8100 | OpenAI-compatible mock (chat completions)    | `moon backend:ai-mock`   |
| oidc-mock | 8080 | OIDC provider mock (auto-authenticates user) | `moon backend:oidc-mock` |

Both are started automatically by `moon e2e:test` via the `webServer` entries in `playwright.config.ts`. The backend is configured to use the ai-mock via `OPENAI_BASE_URL=http://localhost:8100/openai` in `.env.e2e`.

## Troubleshooting

- **Server startup timeouts** → Check that `wait` patterns in `playwright.config.ts` match actual server log output.
- **Flaky under load** → Stress test: `moon -u e2e:test -- --workers=8 --repeat-each 5`
- **Debug a single test** → `moon e2e:test-ui` or `moon e2e:test -- --debug`
- **Traces** → On first retry, traces are saved automatically (`trace: 'on-first-retry'`). View with `npx playwright show-trace`.

# Authentication contracts

`moon e2e:test-runtime-contract` runs the same API authentication, owner isolation,
SDK chat/stream/reconnect, and CORS scenarios against Aegra (2026) and LangGraph
development server (2027). LangGraph runtime packages belong to a development-only
dependency group and are omitted from production installs. All groups share the
same uv lockfile, so their constraints also update shared production transitive
dependencies, including cryptography, the LangGraph SDK, and OpenTelemetry.
`moon e2e:test` runs this contract suite first, then the complete Aegra application
suite, including feedback and real Better Auth refresh integration. This explicit
dependency also keeps `moon ci` and `moon check` from starting the suites together:
they share server ports and reset the same test database. Runtime dependencies are
installed as part of the contract task, before any of its servers start.

`src/token-refresh.spec.ts` uses the local provider's explicit test controls to
expire signed tokens on the real server clock. It covers two rotating refreshes,
encrypted account cookie chunks, omitted replacement credentials, and explicit
recovery without automatic write replay. Test controls are enabled only by the
`oidc-mock-e2e` launcher and bind to localhost.

Run these tasks sequentially, like all Moon/Vitest tasks in this repository.
