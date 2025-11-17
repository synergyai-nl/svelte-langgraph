# E2E Tests with Page Object Models and Fixtures

This directory contains end-to-end tests using Playwright with Page Object Models (POMs) and custom fixtures for better maintainability and reusability.

## Structure

```
e2e/
├── pages/                  # Page Object Models
│   ├── home.page.ts        # Home page POM
│   ├── chat.page.ts        # Chat page POM
│   ├── oidc.page.ts        # OIDC authentication page POM
│   └── index.ts           # Barrel export for all POMs
├── fixtures/              # Custom test fixtures
│   ├── pages.fixture.ts   # Page object fixtures
│   ├── auth.fixture.ts    # Authentication fixtures & helpers
│   ├── backend.fixture.ts # Backend integration fixtures
│   └── index.ts          # Main fixture export
└── *.spec.ts             # Test files
```

## Page Object Models (POMs)

Each page has its own POM class that encapsulates:

- Element locators as readonly properties
- Action methods for user interactions
- Helper methods for common assertions

### Example POM Usage

```typescript
export class HomePage {
	readonly signInButton: Locator;

	constructor(page: Page) {
		this.page = page;
		this.signInButton = page.getByRole('button', { name: /sign in/i });
	}

	async goto() {
		await this.page.goto('/');
	}

	async clickSignIn() {
		await this.signInButton.click();
	}
}
```

## Fixtures

Fixtures provide isolated test environments and reusable setup/teardown logic. Our fixture hierarchy:

1. **Page Fixtures** (`pages.fixture.ts`)
   - Provides POMs as fixtures (`homePage`, `chatPage`, `oidcPage`)

2. **Auth Fixtures** (`auth.fixture.ts`)
   - `authHelpers`: Authentication helper methods
   - `authenticatedPage`: Auto-authenticate before tests (when needed)

3. **Backend Fixtures** (`backend.fixture.ts`)
   - `backendHelpers`: Backend API interaction helpers

## Writing Tests

Import the extended test and fixtures from the main export:

```typescript
import { test, expect } from './fixtures';

test('example test', async ({ homePage, authHelpers }) => {
	await homePage.goto();
	await authHelpers.authenticateUser();
	await expect(homePage.avatarMenuButton).toBeVisible();
});
```

### Using Page Object Fixtures

```typescript
test('navigate to chat', async ({ chatPage }) => {
	await chatPage.goto();
	await expect(chatPage.chatTitle).toBeVisible();
});
```

### Using Authentication Helpers

```typescript
test('authenticated flow', async ({ authHelpers, chatPage }) => {
	// Manually authenticate
	await authHelpers.authenticateUser();

	// Navigate to protected page
	await chatPage.goto();

	// Verify authenticated state
	await authHelpers.expectAuthenticated();
});
```

### Auto-Authentication with beforeEach

```typescript
test.describe('When authenticated', () => {
	test.beforeEach(async ({ authHelpers }) => {
		await authHelpers.authenticateUser();
	});

	test('access protected content', async ({ chatPage }) => {
		await chatPage.goto();
		await expect(chatPage.loginModal).not.toBeVisible();
	});
});
```

## Running Tests

```bash
# Run all E2E tests
moon frontend:test-e2e

# Run with Playwright UI
npx playwright test --ui

# Run specific test file
npx playwright test e2e/auth.spec.ts

# Debug mode
npx playwright test --debug
```

## Best Practices

1. **Use POMs for element access**: Access elements through POM properties rather than direct selectors
2. **Use fixtures for setup**: Leverage fixtures for common setup/teardown logic
3. **Keep POMs focused**: Each POM should represent a single page or component
4. **Compose fixtures**: Build complex fixtures from simpler ones
5. **Use helper methods**: Create reusable assertion helpers in fixtures

## Benefits of This Structure

- **Maintainability**: Changes to UI only require updates in POMs
- **Reusability**: Common actions and assertions are centralized
- **Type Safety**: TypeScript provides IntelliSense and compile-time checks
- **Isolation**: Each test runs in isolation with fresh fixtures
- **Readability**: Tests read like natural language with meaningful method names
