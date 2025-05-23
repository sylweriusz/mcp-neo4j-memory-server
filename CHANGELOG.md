# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.7] - 2025-05-23

### Enhanced
- Implemented comprehensive anti-fragmentation guidance with concrete examples
- Added explicit decision criteria to prevent memory fragmentation mistakes
- Enhanced tool descriptions with visual anti-pattern examples and warning systems

### Key Improvements
- **Anti-Pattern Detection**: Clear warnings when creating multiple related memories that should be one
- **Decision Criteria**: "Can someone accomplish the task using only this observation?" test
- **Visual Examples**: ❌/✅ contrast showing wrong vs right approaches in parameter descriptions
- **Fragmentation Prevention**: Explicit guidance against creating memories that need relations to work together

### Tool-Specific Changes
- `memory_manage`: Added comprehensive anti-pattern examples in parameter descriptions showing fragmentation vs proper consolidation
- `observation_manage`: Added decision test criteria with concrete examples of fragmented vs complete modules
- Enhanced descriptions now show exactly what fragmentation looks like and how to avoid it

### Technical Impact
- Eliminates common AI mistake of creating multiple related memories instead of one consolidated memory
- Provides concrete decision framework for determining memory vs observation boundaries
- Includes explicit warnings about relation creation as fragmentation indicator
- Clear visual examples prevent abstract guidance misinterpretation

## [2.0.6] - 2025-05-23

### Enhanced
- Implemented structural memory guidance in all MCP tool descriptions
- Added architectural discipline for metadata vs observations usage patterns
- Enhanced tool descriptions to prevent information fragmentation

### Key Improvements
- **Structural Pattern**: Metadata for architectural overviews (schemas, hierarchies, patterns), observations for complete functional modules
- **Anti-fragmentation**: Each observation should be self-contained and actionable, not sentence fragments
- **Architectural Consistency**: Relations reflect structural relationships from metadata schemas
- **Database Organization**: Enhanced guidance for clean knowledge architecture by project/domain

### Tool-Specific Changes
- `memory_manage`: Added structural approach guidance for metadata/observations separation
- `memory_retrieve`: Enhanced with structural pattern awareness for comprehensive responses
- `memory_search`: Added hint about well-structured memories preventing fragmentation
- `observation_manage`: Emphasized complete functional modules over fragments
- `relation_manage`: Connected relationship types to metadata schemas for consistency
- `database_switch`: Added structural organization tips for clean architecture

### Technical Impact
- Prevents knowledge rot through architectural discipline
- Eliminates scattered information fragments across observations
- Creates maintainable, queryable knowledge structures
- Enforces separation of concerns between structural and procedural information

## [2.0.5] - 2025-05-22

### Fixed
- Enhanced tag extraction system with proper POS tagging sequence
- Replaced hardcoded stopwords with professional multilingual extraction (20,000+ words)
- Enabled observations processing in tag extraction (60% name, 40% observations)
- Added comprehensive technical term detection patterns
- Fixed multilingual stopwords import compatibility
- Increased tag limit to 6 per memory for better semantic coverage

## [2.0.4] - 2025-05-20

### Enhanced
- Updated tool descriptions to improve contextual  memory usage
- Added clear guidance for database context in all memory operations
- Modified all MCP tools to clearly indicate operations should use current database
- Improved database_switch description to emphasize context importance

### Technical Details
- Enhanced memory_search description to suggest usage for implicit memory references
- Updated memory_manage description to encourage background memory storage
- Modified observation_manage to clarify current database usage requirements
- Improved relation_manage documentation for context consistency
- Updated database_switch description to emphasize its role in operation context

## [2.0.3] - 2025-05-20

### Fixed
- Fixed destructive MCP tool documentation for memory_search limit parameter
- Changed limit description from "use 0 for no limit" to "recommended: 50-100 for exploration"
- Updated main description to clarify wildcard search behavior with limits
- Prevents AI from starting exploration with limit=0 which returns empty results

### Technical Details
- Modified memory_search tool description in src/index.ts
- Replaced toxic "use 0 for no limit" phrasing that misled AI clients
- Clarified that '*' searches all memories but respects the specified limit
- Improved user experience by encouraging reasonable default limits

## [2.0.2] - 2025-05-20

### Fixed
- Implemented deep lazy loading for Neo4j driver connections
- Fixed timeout issues with Smithery tool discovery scanner
- Neo4j driver now only initializes when actually used, not in constructor
- Removed database connection establishment from manager instantiation

### Technical Details
- Modified Neo4jKnowledgeGraphManager to use lazy driver initialization
- Added ensureDriver() method for deferred connection establishment
- Updated all session methods to use ensureDriver() before accessing driver
- Improved compatibility with automated scanning systems like Smithery

## [2.0.1] - 2025-05-20

### Fixed
- Implemented lazy loading for Neo4j connections to enable Smithery tool detection
- Server now starts without establishing database connections until tools are called
- Tools can be listed without requiring Neo4j credentials

### Technical Details
- Modified manager initialization to use lazy loading pattern
- Neo4j connection only established when tools are actually invoked
- Improved compatibility with automated tool discovery systems like Smithery

## [2.0.0] - 2025-05-20

### Added
- Initial 2.0 release with consolidated tool architecture
- Six consolidated MCP tools for complete memory management
- Enhanced semantic search with vector similarity
- Sophisticated tag extraction system v2.0
- Multi-database support with complete isolation
- Graph context with 2-level relationship traversal

### Features
- `memory_manage`: Unified create/update/delete operations
- `memory_retrieve`: Detailed memory retrieval with graph context
- `memory_search`: Enhanced unified search with multiple scoring methods
- `observation_manage`: Add/delete observation content
- `relation_manage`: Create/delete memory relationships
- `database_switch`: Runtime database switching

### Technical Improvements
- Lazy loading architecture for better tool detection
- Professional error handling and logging
- Optimized Cypher queries for performance
- Comprehensive TypeScript interfaces
- Docker support with production configuration
