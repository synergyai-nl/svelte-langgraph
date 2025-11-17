/**
 * Main test fixture export
 * Combines all custom fixtures for easy import in tests
 */

// Re-export the fully extended test with all fixtures
export { expect, test } from './backend.fixture';

// Re-export configuration constants
export { OIDC_CONFIG } from './auth.fixture';
export { LANGGRAPH_CONFIG } from './backend.fixture';
