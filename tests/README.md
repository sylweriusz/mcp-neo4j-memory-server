# Test Suite Documentation - Truth-First Architecture v2.2.0

This test suite validates the production Truth-First Search architecture following GDD (Graph Database Design) v2.2.0 specifications.

## Test Philosophy - Zero-Fallback Testing

**The Implementor's Rule**: Test exactly what production uses - no mocks, no fallbacks.

We test production architecture directly because:
- MCP servers run in production environment by default
- Mock systems hide integration bugs that matter in real usage
- Truth-First Search requires real component interaction testing
- Zero-fallback architecture needs validation of actual error paths

## Test Structure

```
tests/
├── unit/           # Pure logic tests with real components
├── integration/    # Production component integration tests  
├── e2e/           # End-to-end MCP workflow tests
├── infrastructure/ # Infrastructure component tests
└── fixtures/      # Test utilities and helpers
```

## Running Tests

```bash
# Run all tests (validates production architecture)
npm test

# Run only unit tests (pure logic validation)
npm run test:unit

# Run integration tests (component interaction)
npm run test:integration

# Run e2e tests (complete MCP workflows)
npm run test:e2e

# Watch mode for development
npm run test:watch

# Coverage report with Truth-First metrics
npm run test:coverage
```

## Test Categories

### Unit Tests ✅ 
**Philosophy**: Test real components without external dependencies

- `memory-entity.test.ts` - Memory domain entity validation and business rules
- `observation-entity.test.ts` - Observation domain entity business logic
- `id-generator.test.ts` - Compact ID generation with BASE85 encoding
- `embedding-utilities.test.ts` - Vector similarity calculations
- `di-container.test.ts` - **NEW**: Production DI container validation
- `search-config.test.ts` - Search configuration domain rules

### Integration Tests 🔄
**Philosophy**: Test production component integration with real database connections

- `truth-first-search.test.ts` - **NEW**: GDD v2.2.0 search pipeline validation
- `memory-repository.test.ts` - Neo4j repository operations against real database

### E2E Tests 🎯
**Philosophy**: Test complete MCP workflows end-to-end

- `mcp-handlers-production.test.ts` - **NEW**: Complete MCP handler workflow validation
- `mcp-handlers.test.ts` - Legacy handler tests (maintained for compatibility)

### Infrastructure Tests ⚙️
**Philosophy**: Test infrastructure components with production validation

- `clean-database-manager.test.ts` - **NEW**: Database management without mocks
- `index-manager.test.ts` - Database schema and index management
- `search/` - Truth-First Search component tests
  - `query-classifier.test.ts` - Query intent classification
  - `truth-scorer.test.ts` - Truth hierarchy scoring
  - `exact-search-channel.test.ts` - Case-insensitive exact matching
  - `vector-search-channel.test.ts` - Semantic similarity search
  - `wildcard-search-service.test.ts` - Wildcard query handling
  - `search-result-processor.test.ts` - Practical hybrid scoring
  - `truth-first-orchestrator.test.ts` - Complete search orchestration

## Test Architecture Changes (v2.2.0)

### Removed Legacy Patterns
- ❌ **vi.mock()** extensive mocking that hid integration issues
- ❌ **Fallback testing** that masked real error conditions  
- ❌ **Mock database validation** that bypassed production logic

### Added Truth-First Patterns  
- ✅ **Production component testing** with real dependency injection
- ✅ **Zero-fallback validation** ensuring actual error paths work
- ✅ **Truth hierarchy testing** validating GDD v2.2.0 search compliance
- ✅ **Real validation logic testing** without mock bypasses

## Database Requirements

Integration and E2E tests expect production database connectivity:
- Neo4j running on configured endpoint (default: `bolt://localhost:7687`)  
- Valid credentials in environment variables
- Write access for test data creation

**Test Environment Behavior:**
- Tests validate production architecture even without database
- Database connection failures are expected and handled gracefully
- Tests validate error handling paths when database unavailable
- No fallback to mock systems - real error paths tested

## Environment Configuration

```bash
# Production database configuration (tests validate against this)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=mcp-graph-memory
LOG_LEVEL=error

# Vector model configuration (tests validate model integration)
VECTOR_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
VECTOR_DIMENSIONS=auto
VECTOR_IDLE_TIMEOUT=600000
VECTOR_PRELOAD=true
```

## Coverage Targets - Truth-First Metrics

- **Branches**: 75% (Critical error paths must be tested)
- **Functions**: 75% (All public APIs validated)  
- **Lines**: 75% (Core logic coverage)
- **Statements**: 75% (Truth-first path coverage)

### Coverage Focus Areas
1. **Truth Hierarchy Logic** - Perfect truth detection and scoring
2. **Query Classification** - Technical identifier vs semantic query routing  
3. **Zero-Fallback Paths** - Error handling without rescue mechanisms
4. **Production Integration** - Real component interaction validation
5. **MCP Handler Workflows** - Complete request/response cycles

## Performance Validation

Tests validate GDD v2.2.0 performance requirements:
- **Exact Search**: <100ms target validation
- **Vector Search**: <500ms target validation  
- **Wildcard Search**: Direct query performance
- **Limit Enforcement**: Strict GDD 8.1 compliance

## Migration Notes

**From Legacy to Truth-First Testing:**

1. **Removed Mock Dependencies**: Tests now use real component initialization
2. **Updated Error Expectations**: Tests validate actual error paths, not mock responses
3. **Added Architecture Validation**: Tests ensure production component relationships work
4. **Enhanced Integration Coverage**: Tests validate Truth-First Search pipeline end-to-end

**Breaking Changes:**
- Tests expect production environment configuration
- Mock-based test patterns no longer supported
- Database connectivity expected for full integration validation

---

*"Test the architecture you ship, ship the architecture you test."* - The Truth-First Testing Principle
