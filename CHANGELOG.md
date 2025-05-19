# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
