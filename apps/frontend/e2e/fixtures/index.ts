/**
 * Main test fixture export
 * Combines all custom fixtures for easy import in tests
 */

// Re-export the fully extended test with all fixtures
export { test, expect } from './backend.fixture';

// Re-export configuration constants
export { OIDC_CONFIG } from './auth.fixture';
export { LANGGRAPH_CONFIG } from './backend.fixture';

// Re-export page objects for direct use if needed
export * from '../pages';