# Test Suite Documentation

This test suite follows clean architecture principles and the GDD (Graph Database Design) specifications.

## Test Structure

```
tests/
├── unit/           # Pure logic tests - no external dependencies
├── integration/    # Database integration tests - requires Neo4j
├── e2e/           # End-to-end MCP workflow tests
└── fixtures/      # Test utilities and helpers
```

## Running Tests

```bash
# Run all tests (requires Neo4j for integration/e2e)
npm test

# Run only unit tests (no external dependencies)
npm run test:unit

# Run integration tests (requires Neo4j)
npm run test:integration

# Run e2e tests (requires Neo4j)  
npm run test:e2e

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage
```

## Unit Tests ✅

**Currently Passing: 22/22 tests**

- `id-generator.test.ts` - Tests compact ID generation and BASE85 encoding
- `memory-entity.test.ts` - Tests Memory domain entity validation and business logic
- `embedding-utilities.test.ts` - Tests vector similarity calculations
- `tag-extraction.test.ts` - Tests tag extraction pipeline with semantic deduplication

## Integration Tests ⚠️

**Status: Requires Neo4j Database**

- `memory-repository.test.ts` - Tests Neo4j repository operations against real database

## E2E Tests ⚠️

**Status: Requires Neo4j Database**  

- `mcp-handlers.test.ts` - Tests complete MCP workflow from handler to database

## Test Philosophy

Following **The Implementor's Rule**: We test exactly what the GDD specifies, nothing more, nothing less.

### What We Test:
- Domain entity validation (Memory, Observation entities)
- Business logic methods (markAsAccessed, withUpdatedMetadata)
- Utility functions (ID generation, vector similarity) 
- Tag extraction pipeline behavior
- Database operations against real Neo4j (when available)

### What We Don't Test:
- External library internals (compromise.js, xenova/transformers)
- Neo4j driver behavior
- Network connectivity issues
- Environment-specific configurations

## Neo4j Requirements

Integration and E2E tests require:
- Neo4j running on `bolt://localhost:7687`
- Credentials: `neo4j/password` (configurable via ENV)
- Write access to create test data

Tests will automatically skip when Neo4j is unavailable rather than failing.

## Test Configuration

Environment variables for testing:
```bash
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j
LOG_LEVEL=error
```

## Coverage Targets

- Branches: 75%
- Functions: 75% 
- Lines: 75%
- Statements: 75%

*"The best test is the one that catches real bugs, not the one that hits coverage numbers."*
