# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0] - 2025-06-04

### Added
- **Streamable HTTP Transport**: Complete implementation of HTTP transport wrapper following MCP Streamable HTTP specification
- **Dual Transport Support**: Server now supports both stdio and HTTP transports with identical functionality
- **Session Management**: Stateful session handling with UUID tracking and automatic cleanup
- **CORS Support**: Full CORS configuration for web-based MCP applications
- **Health Monitoring**: HTTP `/health` endpoint for container monitoring and service discovery
- **Docker HTTP Support**: Container defaults to HTTP transport on port 3000 for Smithery compatibility

### HTTP Transport Features
- **Single Endpoint**: All MCP communication through `/mcp` endpoint (POST, GET, DELETE)
- **Session Lifecycle**: Proper session creation, management, and termination
- **Error Handling**: JSON-RPC compliant error responses with appropriate HTTP status codes
- **Content Negotiation**: Proper Accept header handling for SSE/JSON responses
- **Protocol Bridge**: Clean translation between HTTP requests and MCP JSON-RPC messages

### Environment Configuration
- `HTTP_PORT`: Server port (default: 3000)
- `HTTP_ENDPOINT`: MCP endpoint path (default: /mcp)
- `ENABLE_SESSIONS`: Session management toggle (default: true)
- `CORS_ORIGIN`: CORS policy configuration (default: *)

### NPM Scripts
- `npm run start:http`: Start HTTP transport server
- `npm run dev:http`: Development mode with HTTP transport
- `npm run start`: Original stdio transport (unchanged)

### Technical Architecture
- **Zero-Fallback Design**: HTTP wrapper delegates to existing MCP handlers without duplication
- **Protocol Purity**: JSON-RPC over HTTP following official MCP specification
- **Transport Isolation**: HTTP layer provides pure protocol translation without business logic
- **Backward Compatibility**: Original stdio transport remains completely untouched
- **Smithery Ready**: Standard HTTP endpoint exposure with environment-based configuration

### File Structure
```
src/http/
├── server.ts     # Main HTTP transport server
├── session.ts    # Session management
├── protocol.ts   # JSON-RPC protocol bridge
└── types.ts      # HTTP transport types
```

### Deployment Impact
- **Docker Default**: Container now uses HTTP transport by default for remote deployments
- **Smithery Compatible**: Standard HTTP endpoint pattern with health checks
- **Development Flexibility**: Choose transport method via npm scripts
- **Production Ready**: Graceful shutdown, error handling, and monitoring endpoints

## [2.2.0] - 2025-06-01

### 🚨 BREAKING CHANGES
- **Language Support Limitation**: Removed support for non-Latin script languages (CJK, Indic, RTL, Cyrillic)
- **Supported Languages Reduced**: Now officially supports 17 space-delimited Latin-script languages only:
  - English (en), Spanish (es), Portuguese (pt), French (fr), Italian (it)
  - German (de), Dutch (nl), Swedish (sv), Danish (da), Norwegian (no)  
  - Finnish (fi), Polish (pl), Czech (cs), Hungarian (hu), Turkish (tr)
  - Indonesian (id), Swahili (sw)

### Removed
- **Stopword Files**: Deleted 35 unsupported language stopword files
- **False Multilingual Claims**: No longer claiming support for 52 languages

### Changed
- **Tag Extraction**: Updated from v2.1 to v2.2 with honest language support claims
- **Architecture**: Embraces zero-fallback principle - better to fail clearly than silently provide poor results
- **Performance**: Reduced memory footprint and improved processing speed by eliminating unused language data

### Technical Rationale
The previous "universal multilingual support" was architectural dishonesty. Our pipeline uses space-based tokenization and Latin-script regex patterns. Supporting complex scripts would require language-specific tokenizers not included in our architecture. Better to do 17 languages well than 52 languages poorly.

### Migration Impact
- Content in previously "supported" but now excluded languages will generate empty tag arrays instead of low-quality tags
- No data loss - existing memories remain intact
- Tag re-extraction may be beneficial for content that previously generated poor-quality tags

## [2.1.2] - 2025-05-30

### Enhanced
- **Vector Model Configuration**: Complete configurable embedding model system with lazy loading and preload options
- **Dynamic Model Support**: Auto-detection of embedding dimensions from configured model
- **Memory Management**: Smart embedding manager with 10-minute idle timeout for RAM optimization
- **Startup Verification**: Model downloaded and verified during system initialization

### Added
- **Environment Variables**: Full configuration via `VECTOR_MODEL`, `VECTOR_DIMENSIONS`, `VECTOR_IDLE_TIMEOUT`, `VECTOR_PRELOAD`
- **Model Selection**: Support for paraphrase-multilingual-MiniLM-L12-v2 (default), multilingual-e5-base, and other sentence-transformers models
- **Smart Loading**: Lazy loading with background preload option for immediate availability
- **Dynamic Indexing**: Vector indexes created with auto-detected dimensions from selected model

### Performance Improvements
- **Memory Usage**: 200-600MB RAM depending on model selection with automatic cleanup
- **Cold Start**: 2-3 seconds for model reload from disk cache after idle timeout
- **Storage Optimization**: Models cached locally after first download (~300-500MB disk space)
- **Initialization Speed**: Model verified and pre-downloaded during system startup

### Technical Details
- **Default Model**: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (384 dimensions, 50+ languages)
- **Configuration**: Environment variable `VECTOR_MODEL` for custom model selection
- **Dimension Detection**: Automatic detection from selected model, no hardcoded values
- **Memory Management**: Lazy loading with 10-minute idle timeout for RAM optimization
- **Startup Verification**: Model downloaded and verified during system initialization

## [2.1.1] - 2025-05-28

### Updated
- **Version Bump**: Updated all version references from 2.1.0 to 2.1.1 across entire codebase
- **Documentation**: Updated README, package.json, Dockerfile, and all source code comments
- **GDD References**: Updated all Graph Database Design (GDD) specification references

## [2.1.0] - 2025-05-28

### Verified
- **SauronEye Protocol**: Complete testing protocol verified all core functionality
- **Tag Extraction**: Real-time tag updates on observation addition confirmed working
- **Vector Search**: Semantic search with embedding updates fully tested
- **Enhanced Relationships**: All metadata fields (strength, context, source, createdAt) verified
- **Chronological Ordering**: Observations properly sorted by createdAt timestamp
- **Multilingual Support**: Polish, German, English tag extraction confirmed
- **Limit Enforcement**: All queries respect limit parameter including wildcard searches
- **Database Isolation**: Multi-database switching and proper schema initialization tested

### Fixed
- **Graph Context**: Relationship types now correctly display actual relationType instead of generic "RELATES_TO"
- **Search Pipeline**: Zero-fallback architecture implemented, no more masked errors
- **Performance**: Query response times optimized for production workloads

## [2.0.12] - 2025-05-27

### Changed
- **ID encoding**: Migrated from BASE91 to BASE85 for improved serialization safety
- **ID length**: Increased from 17 to 18 characters to accommodate BASE85 encoding
- **Character set**: Removed 6 problematic characters (\\<>[]|^) that caused JSON/HTML/URL/Cypher escaping issues
- **Validation**: Updated all ID validation to support both legacy 17-char and new 18-char formats during transition

### Security Improvements
- **Serialization safety**: Eliminated characters causing JSON escaping conflicts
- **HTML compatibility**: Removed angle brackets to prevent HTML parsing issues  
- **URL encoding**: Eliminated characters requiring percent encoding
- **Cypher parameters**: Fixed parameter binding issues with special characters

### Technical Details
- **BASE85 charset**: `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%()*+,-./:;=?@_{|}~<`
- **Entropy maintained**: 85^18 ≈ 2.7×10^34 combinations (vs 91^17 ≈ 4.7×10^33)
- **Backward compatibility**: ID detection supports both 17-char BASE91 and 18-char BASE85 formats
- **Compression ratio**: 18/26 = 69% of original ULID size (31% space saved)

### Migration Support
- **Dual-mode validation**: Accepts both legacy BASE91 and new BASE85 IDs
- **Automatic detection**: ID format detection updated for smooth transition
- **Documentation updated**: All references to 17-char updated to 18-char throughout codebase

## [2.0.11] - 2025-05-25

### Fixed
- **Observation IDs in retrieve**: Fixed memory_retrieve to include observation IDs in response (was stripping them at line 1406)
- **Tool description clarity**: Updated observation_manage tool description to emphasize preferred deletion by ID

### Changed  
- **observation_manage parameter description**: Now explicitly states preference for using observation IDs for deletion operations
- **GDD documentation**: Updated observation_manage spec to note ID deletion as preferred method
- **Response format docs**: Updated Memory Retrieval Response to show observation objects include id field

### Technical Details
- Fixed manager.ts line 1406 to include `id: o.id` in observation mapping
- Updated index.ts tool parameter description for clearer deletion guidance
- Ensures observation IDs are available for precise deletion operations

## [2.0.10] - 2025-05-25

### Added
- **Observation IDs**: Each observation now has a unique 17-character BASE91 ID
- **Database info in responses**: All tool responses now include `_meta.database` field showing which database was used
- **Migration script**: Added `scripts/migrate-observation-ids.js` for existing observations

### Changed
- **observation_manage delete**: Now supports deletion by observation ID or content (backward compatible)
- **Enhanced responses**: All tools now return consistent response format with database information
- **Cypher queries**: Updated to return observation IDs in all search and retrieval operations

### Technical Details
- Observations use same ID format as Memory nodes (17-char BASE91 via generateCompactId)
- Delete operations automatically detect ID vs content format
- All handlers updated to include current database in _meta response field

## [2.0.9] - 2025-05-23

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
