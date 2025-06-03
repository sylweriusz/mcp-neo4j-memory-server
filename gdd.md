# Graph Database Design (GDD) - Version 2.3.1

## REVISION NOTES v2.3.1
**INDEX CLEANUP:** Removed unused indexes (`memory_accessed_idx`, `memory_name_idx`, `relation_type_idx`) that had zero query usage. Added missing critical indexes (`memory_created_idx`, `observation_id_unique`, relationship metadata indexes). Aligned specification with actual implementation. The Implementor's Law: Build exactly what's used.

## 1. Core Data Model

### 1.1 Neo4j Physical Schema

#### Node Types
- `Memory`: Primary information container
  - Properties: 
    - `id` (string, 18-char BASE85-based, unique): Memory compact identifier
    - `name` (string): Memory human-readable name
    - `memoryType` (string): Classification label
    - `metadata` (JSON string, optional): Flexible structured data
    - `createdAt` (ISO timestamp): Memory creation time
    - `modifiedAt` (ISO timestamp): Last memory modification time
    - `lastAccessed` (ISO timestamp): Last retrieval time
    - `nameEmbedding` (float array): Vector embedding for semantic search

- `Observation`: Discrete information fragments (narrative content)
  - Properties:
    - `id` (string, 18-char BASE85-based, unique): Observation compact identifier
    - `content` (string): Textual observation
    - `createdAt` (ISO timestamp): When observation was created
    - `source` (string, optional): Origin of information 
    - `confidence` (number, optional): Trust level (0.0-1.0)
    - `embedding` (float array, optional): Vector embedding

#### Relationship Types
- `HAS_OBSERVATION`:
  - Direction: `(Memory)-[:HAS_OBSERVATION]->(Observation)`
  - Properties:
    - `createdAt` (ISO timestamp): When relationship was created
    - `source` (string): Always "system" - automatically created during observation addition

- `RELATES_TO`:
  - Direction: `(Memory)-[:RELATES_TO]->(Memory)`
  - Properties:
    - `relationType` (string): Relationship classifier (INFLUENCES, DEPENDS_ON, etc.)
    - `strength` (float, 0.0-1.0): Relationship strength/importance
    - `source` (string): Origin of relationship ("agent", "user", "system")
    - `createdAt` (ISO timestamp): When relationship was created

#### Constraints
- Memory ID uniqueness: `CREATE CONSTRAINT IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE`
- Memory name+type uniqueness: Enforced programmatically

#### Indexes
- Memory name vector index: `CREATE VECTOR INDEX memory_name_vector_idx FOR (m:Memory) ON (m.nameEmbedding)`
- Memory metadata full-text index: `CREATE FULLTEXT INDEX memory_metadata_idx IF NOT EXISTS FOR (m:Memory) ON EACH [m.metadata]`

### 1.2 TypeScript Interface Model

#### Memory
```typescript
type Memory = {
  id: string;              // Compact 18-char identifier (BASE85-based)
  name: string;            // Human-readable name
  memoryType: string;      // Classification
  metadata?: Record<string, any>; // Flexible structured data (JSON)
  createdAt?: string;      // ISO timestamp of creation
  modifiedAt?: string;     // ISO timestamp of last modification
  lastAccessed?: string;   // ISO timestamp of last access
  nameEmbedding?: number[]; // Vector embedding for semantic search
  observations: Array<{    // Observation objects with temporal context
    content: string;       // Observation text content
    createdAt: string;     // When observation was created
  }>;
  related?: {              // Graph context from relationships
    ancestors?: RelatedMemory[];    // Memories pointing to this memory (2 levels deep)
    descendants?: RelatedMemory[];  // Memories this memory points to (2 levels deep)
  };
}
```

#### Relation
```typescript
type Relation = {
  fromId: string;        // Source memory compact ID
  toId: string;          // Target memory compact ID  
  relationType: string;  // Classification (INFLUENCES, DEPENDS_ON, etc.)
  
  // Enhanced metadata (v2.0.12+)
  strength: number;      // Relationship strength 0.0-1.0 (default: 0.5)
  source: "agent" | "user" | "system";  // Relationship origin (default: "agent")
  createdAt: string;     // ISO timestamp of creation (system-generated)
}
```

#### ObservationNode
```typescript
type ObservationNode = {
  content: string;      // Observation text
  createdAt?: string;   // Creation timestamp
  source?: string;      // Origin of information
  confidence?: number;  // Trust level (0.0-1.0)
  embedding?: number[]; // Vector embedding (optional)
}
```

#### KnowledgeGraph
```typescript
type KnowledgeGraph = {
  memories: Memory[];
  relations: Relation[];
  _meta?: {
    isLightweight?: boolean;
    message?: string;
    [key: string]: any;
  };
}
```

## 2. Data Transformation

### 2.1 Memory Creation
1. Create Memory node with id, name, memoryType, metadata (optional), timestamps
2. Calculate name embedding
3. Create Observation nodes with content and timestamps
4. Connect Memory to Observations with HAS_OBSERVATION relationships

### 2.2 Memory Retrieval
1. Match Memory node by id
2. Update lastAccessed timestamp
3. Match connected Observation nodes with timestamps
4. Collect Observation objects with content and createdAt into observations array
5. Return composite Memory object with graph context and temporal observation data

### 2.3 Enhanced Relationship Creation
1. **Memory-to-Memory Relations** (via `relation_manage` tool):
   - Extract `relationType` from request (required)
   - Determine `strength`: Agent-provided value OR default 0.5
   - Determine `context`: Agent-provided array OR infer from memory types
   - Determine `source`: Agent-provided "user" OR default "agent"
   - Set `createdAt`: Current ISO timestamp (system-generated)

2. **Memory-to-Observation Relations** (automatic during observation management):
   - Created during `observation_manage` "add" operations
   - `source`: Always "system" 
   - `createdAt`: Current ISO timestamp when observation is added

### 2.4 Source Determination Logic
```typescript
function determineSource(relationRequest: RelationRequest): string {
  // 1. Explicit agent specification takes precedence
  if (relationRequest.source === "user") return "user";
  
  // 2. System-generated relationships (observations)
  if (relationRequest.isSystemGenerated) return "system";
  
  // 3. Default: agent-initiated relationship
  return "agent";
}
```

## 3. Critical Cypher Patterns

### 3.1 Memory Retrieval with Graph Context
```cypher
MATCH (m:Memory)
WHERE m.id IN $ids
SET m.lastAccessed = datetime()

// Graph context - 2 levels deep with exact relation types
OPTIONAL MATCH path1 = (ancestor:Memory)-[rel1*1..2]->(m)
WHERE ancestor <> m AND ancestor.id IS NOT NULL
WITH m, collect(DISTINCT {
  id: ancestor.id,
  name: ancestor.name,
  type: ancestor.memoryType,
  relation: rel1[0].relationType,
  distance: length(path1)
})[0..3] as ancestors

OPTIONAL MATCH path2 = (m)-[rel2*1..2]->(descendant:Memory)
WHERE descendant <> m AND descendant.id IS NOT NULL
WITH m, ancestors, collect(DISTINCT {
  id: descendant.id,
  name: descendant.name,
  type: descendant.memoryType,
  relation: rel2[0].relationType,
  distance: length(path2)
})[0..3] as descendants

// Core content with ordered observations
OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
RETURN m.id AS id, m.name AS name, m.memoryType AS memoryType,
       m.metadata AS metadata, m.createdAt AS createdAt, m.modifiedAt AS modifiedAt,
       m.lastAccessed AS lastAccessed, 
       [obs IN collect(DISTINCT {content: o.content, createdAt: o.createdAt}) | obs] as observations,
       ancestors, descendants
```

### 3.2 Memory Creation
```cypher
CREATE (m:Memory {
  id: $id, 
  name: $name, 
  memoryType: $memoryType,
  metadata: $metadata,
  createdAt: $createdAt,
  modifiedAt: $modifiedAt,
  lastAccessed: $createdAt,
  nameEmbedding: $nameEmbedding
})
RETURN m
```

### 3.3 Vector Search
```cypher
// GDS Plugin (Recommended)
MATCH (m:Memory)
WHERE m.nameEmbedding IS NOT NULL
WITH m, gds.similarity.cosine(m.nameEmbedding, $queryVector) AS score
WHERE score >= $threshold
ORDER BY score DESC
LIMIT $limit
RETURN m.id, m.name, score

// In-Memory Fallback
MATCH (m:Memory)
WHERE m.nameEmbedding IS NOT NULL
RETURN m.id, m.name, m.nameEmbedding
RETURN m.id, m.name, m.nameEmbedding
```

### 3.4 Enhanced Unified Search
```cypher
MATCH (m:Memory)
WHERE m.nameEmbedding IS NOT NULL OR m.id IN $fulltextCandidateIds

// Graph context with exact relation types
OPTIONAL MATCH path1 = (ancestor:Memory)-[rel1*1..2]->(m)
WHERE ancestor <> m
WITH m, collect(DISTINCT {
  id: ancestor.id, 
  name: ancestor.name, 
  type: ancestor.memoryType,
  relation: rel1[0].relationType,
  distance: length(path1)
})[0..3] as ancestors

OPTIONAL MATCH path2 = (m)-[rel2*1..2]->(descendant:Memory)  
WHERE descendant <> m
WITH m, ancestors, collect(DISTINCT {
  id: descendant.id,
  name: descendant.name, 
  type: descendant.memoryType,
  relation: rel2[0].relationType,
  distance: length(path2)
})[0..3] as descendants

// Core content with ordered observations
OPTIONAL MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)

RETURN m.id as id, m.name as name, m.memoryType as type, 
       m.metadata as metadata, m.nameEmbedding as embedding,
       [obs IN collect(DISTINCT {content: o.content, createdAt: o.createdAt}) | obs] as observations,
       ancestors, descendants
```

### 3.5 Enhanced Relationship Creation
```cypher
// Create enhanced relationship with full metadata
MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
CREATE (from)-[:RELATES_TO {
  relationType: $relationType,
  strength: $strength,
  source: $source,
  createdAt: $createdAt
}]->(to)
}]->(to)
```

### 3.6 Memory Deletion
```cypher
// Delete observations
MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
DETACH DELETE o

// Delete memory relations
MATCH (m:Memory {id: $memoryId})-[r:RELATES_TO]-()
DELETE r
MATCH ()-[r:RELATES_TO]->(m:Memory {id: $memoryId})
DELETE r

// Delete memory
MATCH (m:Memory {id: $memoryId})
DELETE m
```

## 4. Search Implementation (REVISED v2.2.0)

### 4.1 Truth-First Search Architecture

#### Query Classification Engine
```typescript
interface QueryIntent {
  type: 'wildcard' | 'technical_identifier' | 'exact_search' | 'semantic_search';
  confidence: number;
  preprocessing: QueryPreprocessing;
}

interface QueryPreprocessing {
  normalized: string;        // Lowercase normalized query
  isSpecialPattern: boolean; // UUID, version numbers, base64-like
  requiresExactMatch: boolean;
}
```

**Classification Rules:**
- `query === "*" || query === ""` → wildcard retrieval
- `query.match(/^[0-9a-f-]{36}$/i)` → technical_identifier (UUID)
- `query.match(/^v?\d+\.\d+\.\d+/)` → technical_identifier (version)
- `query.match(/^[A-Za-z0-9+/=]+$/) && query.length > 8` → technical_identifier (base64-like)
- `query.match(/^[^a-zA-Z]*$/)` → exact_search (numbers/symbols only)
- Otherwise → semantic_search

#### Truth Hierarchy System
```typescript
enum TruthLevel {
  PERFECT_TRUTH = 1.0,      // Exact metadata + long query OR exact name match
  HIGH_CONFIDENCE = 0.9,    // Exact metadata match
  EXACT_NAME = 0.85,        // Exact name match
  EXACT_CONTENT = 0.8,      // Exact observation content match
  SEMANTIC_CAP = 0.75       // Maximum for semantic similarity
}
```

**Perfect Truth Detection:**
- Exact metadata match AND query.length > 10 → PERFECT_TRUTH
- Exact name match AND normalized(query) === normalized(name) → PERFECT_TRUTH
- All other exact matches capped at their respective truth levels

### 4.2 Multi-Channel Search Pipeline

#### Phase 1: Case-Insensitive Candidate Collection
```cypher
// All text matching uses case-insensitive CONTAINS
WHERE toLower(m.metadata) CONTAINS toLower($query)
   OR toLower(m.name) CONTAINS toLower($query)
   OR EXISTS {
     MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
     WHERE toLower(o.content) CONTAINS toLower($query)
   }
```

#### Phase 2: Channel-Specific Scoring
- **Vector Semantic**: Real similarity score × 0.55 (capped at SEMANTIC_CAP)
- **Exact Metadata**: TruthLevel.HIGH_CONFIDENCE or TruthLevel.PERFECT_TRUTH
- **Exact Name**: TruthLevel.EXACT_NAME or TruthLevel.PERFECT_TRUTH  
- **Exact Content**: TruthLevel.EXACT_CONTENT

#### Phase 3: Composite Score Calculation
```typescript
function calculateTruthScore(
  memory: SearchCandidate,
  query: QueryIntent,
  vectorScore?: number
): number {
  // Perfect truth always wins
  if (memory.hasPerfectMatch(query)) {
    return TruthLevel.PERFECT_TRUTH;
  }
  
  // High confidence exact matches
  if (memory.hasExactMetadata) return TruthLevel.HIGH_CONFIDENCE;
  if (memory.hasExactName) return TruthLevel.EXACT_NAME;
  if (memory.hasExactContent) return TruthLevel.EXACT_CONTENT;
  
  // Semantic scoring (capped)
  const semanticBase = (vectorScore || 0) * 0.55;
  const contentBonus = memory.contentMatchBonus * 0.25;
  const nameBonus = memory.namePartialBonus * 0.20;
  
  return Math.min(semanticBase + contentBonus + nameBonus, TruthLevel.SEMANTIC_CAP);
}
```

### 4.3 Truth-First Search Cypher Pattern
```cypher
// Truth-first search with case normalization
MATCH (m:Memory)
WHERE ($memoryTypes IS NULL OR m.memoryType IN $memoryTypes)
  AND (
    // Case-insensitive exact matching channels
    toLower(m.metadata) CONTAINS toLower($query) OR
    toLower(m.name) CONTAINS toLower($query) OR
    EXISTS {
      MATCH (m)-[:HAS_OBSERVATION]->(o:Observation)
      WHERE toLower(o.content) CONTAINS toLower($query)
    }
    // Vector candidates will be merged separately for performance
  )

// Truth level detection with perfect match identification
WITH m, 
     // Perfect truth detection
     CASE WHEN toLower(m.metadata) CONTAINS toLower($query) AND length($query) > 10 THEN 1.0
          WHEN toLower(m.name) = toLower($query) THEN 1.0
          WHEN toLower(m.metadata) CONTAINS toLower($query) THEN 0.9
          WHEN toLower(m.name) CONTAINS toLower($query) THEN 0.85
          ELSE 0.0 END as exactScore,
     
     // Vector similarity (capped at semantic limit)
     CASE WHEN m.nameEmbedding IS NOT NULL 
          THEN LEAST(gds.similarity.cosine(m.nameEmbedding, $queryVector) * 0.55, 0.75)
          ELSE 0.0 END as semanticScore

// Final scoring with truth supremacy
WITH m, 
     CASE WHEN exactScore > 0 THEN exactScore
          ELSE semanticScore END as finalScore

WHERE finalScore >= $threshold
ORDER BY finalScore DESC, m.createdAt DESC
LIMIT $limit
```

### 4.4 Edge Case Handling Protocol

#### No Results Scenario
- Return empty array immediately
- Log query classification for analysis

#### Overwhelming Results Management  
- Prioritize exact matches first
- Apply stricter vector threshold dynamically
- Respect limit parameter absolutely (GDD 8.1 compliance)

#### Memory Type Filtering
- Apply at Cypher query level using `WHERE m.memoryType IN $memoryTypes`
- Combine with search criteria using AND logic
- Maintain through all search phases

### 4.5 Practical Hybrid Search Response Format (UPDATED v2.3.0)

```typescript
interface SearchResult {
  score: number;           // Semantic distance when available, else simulated from truthLevel
  matchType: 'semantic' | 'exact';  // Simple classification
  // truthLevel: internal only - used for sorting/ranking but not exposed
}

interface PracticalHybridSearchResult extends EnhancedSearchResult {
  score: number;           // User-interpretable similarity value
  matchType: 'semantic' | 'exact';  // Simple binary classification
  
  // Internal processing fields (not exposed to end users)
  _internal?: {
    truthLevel: TruthLevel;        // Internal ranking logic
    matchReason: string;           // Detailed classification for debugging
    rawVectorScore?: number;       // Original similarity when available
    simulatedScore?: number;       // Derived score for exact matches
  };
}
```

**Practical Hybrid Score Calculation:**
```typescript
function calculatePracticalHybridScore(
  memory: SearchCandidate,
  query: QueryIntent,
  vectorScore?: number
): { score: number; matchType: 'semantic' | 'exact'; truthLevel: TruthLevel } {
  
  // Determine truth level using internal logic
  const truthLevel = calculateInternalTruthLevel(memory, query, vectorScore);
  
  // If we have real vector similarity, use it directly
  if (vectorScore !== undefined && truthLevel <= TruthLevel.SEMANTIC_CAP) {
    return {
      score: vectorScore,           // Raw semantic similarity
      matchType: 'semantic',
      truthLevel
    };
  }
  
  // For exact matches, simulate interpretable similarity values
  const simulatedScores = {
    [TruthLevel.PERFECT_TRUTH]: 0.95,    // Very high confidence
    [TruthLevel.HIGH_CONFIDENCE]: 0.90,  // High confidence  
    [TruthLevel.EXACT_NAME]: 0.85,       // Name match confidence
    [TruthLevel.EXACT_CONTENT]: 0.80     // Content match confidence
  };
  
  return {
    score: simulatedScores[truthLevel] || truthLevel,
    matchType: 'exact',
    truthLevel
  };
}
```

**Design Principles:**
- **User Experience**: Score represents interpretable similarity (0.0-1.0 range)
- **Implementation**: Truth levels remain internal for ranking and logic
- **Transparency**: matchType clearly indicates semantic vs exact matching
- **Consistency**: Semantic scores are real cosine similarity values
- **Intuitive**: Exact matches get high simulated similarity scores (0.80-0.95)

## 5. Database Management

### 5.1 Multi-Database Support
- Runtime database selection
- Database-level isolation
- Per-project database separation
- On-demand database creation
- Automatic index verification

### 5.2 Database Indexes (REVISED v2.3.1 - Reality-Based)

#### **ACTIVE INDEXES** (Used in production queries)
```cypher
// Core constraints (CRITICAL - used in all CRUD operations)
CREATE CONSTRAINT IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE
CREATE CONSTRAINT IF NOT EXISTS FOR (o:Observation) REQUIRE o.id IS UNIQUE

// Performance indexes (VERIFIED USAGE)
CREATE INDEX IF NOT EXISTS memory_type_idx FOR (m:Memory) ON (m.memoryType)
  // Used in: wildcard-search-service.ts, vector-search-channel.ts
  // Pattern: WHERE m.memoryType IN $memoryTypes

CREATE INDEX IF NOT EXISTS memory_created_idx FOR (m:Memory) ON (m.createdAt)
  // Used in: All search result ordering
  // Pattern: ORDER BY m.createdAt DESC

// Fulltext indexes (ENHANCED for proper usage)
CREATE FULLTEXT INDEX memory_metadata_idx IF NOT EXISTS FOR (m:Memory) ON EACH [m.metadata]
CREATE FULLTEXT INDEX observation_content_idx IF NOT EXISTS FOR (o:Observation) ON EACH [o.content]

// Vector indexes (GDS Plugin - ACTIVELY USED)
CREATE VECTOR INDEX IF NOT EXISTS memory_name_vector_idx 
FOR (m:Memory) ON (m.nameEmbedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 384,  // Dynamic - auto-detected from configured model
  `vector.similarity_function`: 'cosine'
}}

// Enhanced relationship metadata indexes (NEW in v2.3.1)
CREATE INDEX IF NOT EXISTS relation_strength_idx FOR ()-[r:RELATES_TO]-() ON (r.strength)
CREATE INDEX IF NOT EXISTS relation_source_idx FOR ()-[r:RELATES_TO]-() ON (r.source)
CREATE INDEX IF NOT EXISTS relation_created_idx FOR ()-[r:RELATES_TO]-() ON (r.createdAt)
```

#### **REMOVED INDEXES** (Not used in any queries)
```cypher
// REMOVED: memory_accessed_idx - No queries sort by lastAccessed
// REMOVED: memory_name_idx - Replaced by fulltext and vector search
// REMOVED: relation_type_idx - No queries filter by relationType alone
```

#### **INDEX USAGE VERIFICATION**
```cypher
// Query patterns that MUST use these indexes:
// 1. Memory type filtering:
WHERE m.memoryType IN $memoryTypes

// 2. Chronological ordering:
ORDER BY m.createdAt DESC

// 3. Vector similarity (GDS):
gds.similarity.cosine(m.nameEmbedding, $queryVector)

// 4. Fulltext search (PROPER USAGE):
CALL db.index.fulltext.queryNodes('memory_metadata_idx', $query)
CALL db.index.fulltext.queryNodes('observation_content_idx', $query)

// 5. Enhanced relationship filtering:
WHERE r.strength >= $threshold
WHERE r.source = 'agent'
ORDER BY r.createdAt DESC
```

#### **THE IMPLEMENTOR'S INDEX RULES**
1. **Every index MUST have a documented query pattern**
2. **Remove unused indexes immediately**
3. **Verify index usage with PROFILE queries**
4. **No "future-proofing" indexes**
5. **Zero fallback - indexes work or queries fail fast**

## 5.3 Vector Model Configuration (v2.1.2)

### Model Selection and Management
- **Default Model**: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (384 dimensions, 50+ languages)
- **Configuration**: Environment variable `VECTOR_MODEL` for custom model selection
- **Dimension Detection**: Automatic detection from selected model, no hardcoded values
- **Memory Management**: Lazy loading with 10-minute idle timeout for RAM optimization
- **Startup Verification**: Model downloaded and verified during system initialization

### Environment Variables
```bash
VECTOR_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2  # Model selection (default)
VECTOR_DIMENSIONS=auto                                                    # Auto-detect from model
VECTOR_IDLE_TIMEOUT=600000                                               # 10 minutes idle timeout
VECTOR_PRELOAD=true                                                      # Download on startup (default)
```

### Supported Models
- `paraphrase-multilingual-MiniLM-L12-v2` (384D, 50+ languages, ~600MB RAM) - **Default**
- `all-MiniLM-L6-v2` (384D, English optimized, ~400MB RAM)
- `multilingual-e5-base` (768D, 100+ languages, ~800MB RAM)

### Performance Characteristics
- **Memory Usage**: 200-600MB RAM depending on model selection
- **Idle Optimization**: Model automatically unloaded after 10 minutes of inactivity
- **Cold Start**: 2-3 seconds for model reload from disk cache
- **Storage**: Models cached locally after first download (~300-500MB disk space)
- **Initialization**: Model verified and pre-downloaded during system startup

## 7. API Interface

### 7.1 Consolidated MCP Tools (6 total)

**Memory Operations:**
- `memory_manage`: Create, update, delete memories
- `memory_retrieve`: Retrieve memories by IDs
- `memory_search`: Enhanced unified search with type filtering support

**Content Operations:**
- `observation_manage`: Add, delete observations
- `relation_manage`: Create intelligent directional relationships with contextual metadata

**System Operations:**
- `database_switch`: Database management

### 7.2 Tool Specifications

#### memory_manage
```javascript
{
  "operation": "create" | "update" | "delete",
  "memories": [...],     // For create
  "updates": [...],      // For update
  "identifiers": [...]   // For delete
}
```

#### memory_search
```javascript
{
  "query": "string",                    // Natural language search query or '*' for all memories
  "limit": "number",                    // Maximum number of results (default: 10)
  "includeGraphContext": "boolean",     // Include related memories (default: true)
  "memoryTypes": ["string"],            // Filter by memory types (replaces memory_find_by_type functionality)
  "threshold": "number"                 // Minimum relevance score threshold (default: 0.1)
}
```

#### observation_manage
```javascript
{
  "operation": "add" | "delete",
  "observations": [
    {
      "memoryId": "string",
      "contents": ["string"]  // For add: observation texts to add, For delete: observation IDs (18-char BASE85) ONLY - content strings NOT supported
    }
  ]
}
```

#### relation_manage
```javascript
{
  "operation": "create" | "delete",
  "relations": [
    {
      "fromId": "string",                    // Required: Source memory ID
      "toId": "string",                      // Required: Target memory ID
      "relationType": "string",              // Required: Relationship type
      
      // Optional metadata (for "create" operation only):
      "strength": "number",                  // 0.0-1.0, defaults to 0.5
      "source": "agent" | "user" | "system" // Defaults to "agent", agent can specify "user"
      
      // Note: createdAt is always system-generated
    }
  ]
}
```

#### Agent Guidance for Intelligent Relationships

**When creating relationships, agents should leverage metadata for maximum intelligence:**

**Strength Guidelines (0.0-1.0):**
- `0.9-1.0`: Critical dependencies, major influences, core architectural decisions
- `0.7-0.8`: Important connections, significant patterns, key insights
- `0.5-0.6`: Standard relationships, general connections, moderate relevance  
- `0.3-0.4`: Weak associations, tangential connections, minor influences
- `0.1-0.2`: Barely related, speculative connections, distant similarities

**Context Usage Patterns:**
- **Cross-domain intelligence**: Connect programming patterns to writing processes via shared contexts
- **Filtered suggestions**: Use context to show relevant relationships ("Show programming-related connections")
- **Smart prioritization**: Stronger relationships in matching contexts get higher priority

**Source Attribution Strategy:**
- `"agent"`: Default - when you analyze content and identify meaningful connections
- `"user"`: When user explicitly requests "Connect A to B" or "A is related to B"  
- `"system"`: Reserved for automatic relationships

**Temporal Intelligence Applications:**
- **Evolution tracking**: "How did this approach change over time?" (sort relations by createdAt)
- **Influence analysis**: "What influenced this decision when it was made?" (find relations created before)
- **Pattern recognition**: "Recent connections show shift toward X approach" (recent createdAt values)

**Practical Examples:**
```javascript
// Critical architectural influence
{
  "relationType": "INFLUENCES",
  "strength": 0.9,
  "context": ["architecture", "programming"],
  "source": "agent"
}

// User-requested connection between domains  
{
  "relationType": "INSPIRES",
  "strength": 0.6,
  "context": ["creative", "problem-solving"],
  "source": "user"
}

// Weak exploratory connection
{
  "relationType": "RELATES_TO", 
  "strength": 0.3,
  "context": ["research"],
  "source": "agent"
}
```

### 7.3 Response Formats

#### Write Operation Response (v2.0.12)
```typescript
// For memory_manage (create/update/delete)
{
  "success": true,
  "results": [
    { "id": "Bm>abc123", "status": "created" },
    { "id": "Bm>def456", "status": "created" },
    { "id": "Bm>ghi789", "status": "failed", "error": "Duplicate name" }
  ],
  "summary": {
    "requested": 3,
    "succeeded": 2,
    "failed": 1
  },
  "_meta": {
    "database": "mcp-graph-memory",
    "operation": "create",
    "timestamp": "2025-05-28T10:00:00Z"
  }
}

// For observation_manage (add/delete)
{
  "success": true,
  "results": [
    { 
      "memoryId": "Bm>abc123", 
      "status": "success",
      "observations": {
        "requested": 3,
        "processed": 3
      }
    },
    { 
      "memoryId": "Bm>def456", 
      "status": "failed", 
      "error": "Memory not found" 
    }
  ],
  "summary": {
    "memories_processed": 1,
    "memories_failed": 1,
    "observations_added": 3
  },
  "_meta": {
    "database": "mcp-graph-memory",
    "operation": "add"
  }
}

// For relation_manage (create/delete)
{
  "success": true,
  "results": [
    { 
      "fromId": "Bm>abc123", 
      "toId": "Bm>def456", 
      "relationType": "INFLUENCES",
      "status": "created" 
    },
    { 
      "fromId": "Bm>ghi789", 
      "toId": "Bm>jkl012", 
      "relationType": "DEPENDS_ON",
      "status": "failed", 
      "error": "Target memory not found" 
    }
  ],
  "summary": {
    "requested": 2,
    "succeeded": 1,
    "failed": 1
  },
  "_meta": {
    "database": "mcp-graph-memory",
    "operation": "create"
  }
}
```

#### Enhanced Search Response
```typescript
{
  "memories": [
    {
      "id": "Bm>xyz123",
      "name": "Machine Learning Project",
      "memoryType": "project",
      "observations": [
        {
          "id": "Bm>obs123",  // Observation ID included for deletion operations
          "content": "...",
          "createdAt": "2025-05-25T10:00:00Z"
        }
      ],
      "metadata": { "status": "active" },
      "createdAt": "2025-05-25T09:00:00Z",
      "modifiedAt": "2025-05-25T10:00:00Z",
      "lastAccessed": "2025-05-25T21:00:00Z",
      "related": {
        "ancestors": [{"id": "...", "name": "...", "relation": "...", "distance": 1}],
        "descendants": [{"id": "...", "name": "...", "relation": "...", "distance": 1}]
      }
    }
  ],
  "relations": [      // Direct relations between retrieved memories
    {
      "fromId": "Bm>abc789",
      "toId": "Bm>xyz123", 
      "relationType": "RELATES_TO"
    }
  ],
  "_meta": {
    "database": "mcp-graph-memory"
  }
}
```

### 7.4 Design Principles
- **ID-based operations**: All operations use memory IDs for precision and performance
- **Batch processing**: All tools support batch operations
- **Graph context**: 2-level relationship traversal included in responses
- **Metadata support**: Flexible JSON structure with full-text search
- **AI-optimized**: Minimal response size with essential context
- **Intelligence-first relationships**: Rich metadata enables context-aware, temporal, and strength-based relationship intelligence
- **Agent guidance integration**: Tool descriptions and response formats guide optimal metadata usage patterns


## 8. Critical Implementation Requirements

### 8.1 Search Behavior Constraints
- **REQUIREMENT**: `memory_search` MUST respect the `limit` parameter for ALL query types, including:
  - Wildcard queries (`*` or empty string `""`)
  - Lightweight modes
  - Full search modes
- **VIOLATION**: Returning unlimited results when limit is specified is not acceptable
- **IMPLEMENTATION**: Apply `LIMIT $limit` clause to ALL Cypher queries regardless of query type

### 8.2 Relationship Type Accuracy
- **REQUIREMENT**: Graph context in `related.ancestors` and `related.descendants` MUST accurately reflect the actual relationship type from the database
- **CURRENT ISSUE**: All relationships show as "RELATES_TO" regardless of actual type (INFLUENCES, COMPLEMENTS, DEPENDS_ON, etc.)
- **IMPLEMENTATION**: 
  - Extract actual relationship type from `type(relationship)` in Cypher queries
  - Store correct `relationType` property from relationship in graph context
  - Ensure `relation` field in RelatedMemory objects reflects the real relationship type

### 8.3 Observation Chronological Ordering
- **REQUIREMENT**: Observations MUST be returned in chronological order (oldest to newest) based on their `createdAt` timestamp
- **CURRENT ISSUE**: Random order due to Neo4j's unordered collection behavior
- **IMPLEMENTATION**:
  - Add `ORDER BY o.createdAt ASC` to observation collection queries
  - Include `createdAt` timestamp in observation data when retrieving memories
  - Maintain chronological consistency across all memory retrieval operations

### 8.4 Observation ID Requirements
- **REQUIREMENT**: All observation objects in responses MUST include the `id` field (18-char BASE85 identifier)
- **IMPLEMENTATION**: 
  - Include observation IDs in all memory retrieval, search, and find operations
  - Use observation IDs for deletion operations (content-based deletion NOT supported)
  - Maintain observation ID consistency across all response formats

### 8.5 Memory Type Search Requirements  
- **REQUIREMENT**: Type-based filtering MUST be available through `memory_search` tool via `memoryTypes` parameter
- **IMPLEMENTATION**:
  - `memoryTypes` parameter in `memory_search` for efficient type-based filtering
  - Support for multiple memory types in single query
  - Full compatibility with limit, graph context, and other search parameters
  - Return full memory objects with observation IDs included

### 8.6 Enhanced Relationship Metadata Requirements
- **REQUIREMENT**: All relationship types MUST include comprehensive metadata for intelligent context understanding
- **IMPLEMENTATION**: 
  - `strength` field MUST be validated as 0.0-1.0 range with default 0.5
  - `context` field MUST be auto-inferred when not explicitly provided by agent
  - `source` field MUST accurately reflect relationship origin ("agent", "user", "system")
  - `createdAt` field MUST be system-generated ISO timestamp at creation time
- **VALIDATION**: Reject relationships with invalid strength values or malformed context arrays
- **BACKWARDS COMPATIBILITY**: Existing relationships without metadata get default values during migration

### 8.7 Relationship Source Attribution Standards
- **REQUIREMENT**: Source field MUST accurately distinguish between agent analysis, user requests, and system automation
- **IMPLEMENTATION**:
  - "agent": Default for agent-initiated relationships based on content analysis
  - "user": When agent explicitly indicates user requested the connection
  - "system": Automatic relationships (observations, future similarity detection)
- **CONSISTENCY**: Source determination logic MUST be applied uniformly across all relationship creation paths

### 8.8 Context Inference Intelligence  
- **REQUIREMENT**: When agent does not provide explicit context, system MUST intelligently infer from memory types
- **IMPLEMENTATION**: 
  - Context inference MUST use predefined memory type mappings
  - Multiple contexts allowed when memories span domains
  - Empty context array only when inference impossible
- **EXTENSIBILITY**: Context inference logic MUST be easily expandable for new memory types

### 8.9 Structural Memory Guidance (v2.0.6)
- **REQUIREMENT**: All MCP tool descriptions MUST guide users toward architectural discipline in memory structure
- **PATTERN**: Metadata for structural overviews (schemas, hierarchies, patterns), observations for complete functional modules
- **ANTI-FRAGMENTATION**: Each observation should be self-contained and actionable, not sentence fragments
- **IMPLEMENTATION**:
  - Tool descriptions embed structural guidance without being verbose
  - Prevent information fragmentation across multiple incomplete observations
  - Encourage metadata/observations separation for maintainable knowledge architecture
  - Guide users toward complete functional modules rather than scattered fragments

### 8.10 Data Integrity Standards
- **Timestamps**: All timestamp fields MUST be consistent and properly maintained during CRUD operations
- **Relationship Consistency**: Related objects MUST accurately represent the database state
- **Order Preservation**: Collections with temporal semantics MUST maintain chronological order
- **Structural Consistency**: Memory architecture MUST follow metadata/observations separation pattern
- **Response Metadata**: All tool responses MUST include _meta.database field showing which database was used

### 8.11 Response Optimization Requirements (v2.0.12)
- **REQUIREMENT**: Write operations (create/update/delete) MUST return minimal confirmation responses with per-item status tracking
- **RATIONALE**: Context window preservation + precise error tracking for batch operations
- **IMPLEMENTATION**:
  - Each item in batch gets individual status: "created", "updated", "deleted", "failed"
  - Failed items include specific error message
  - Summary provides aggregate counts for quick assessment
  - Full memory objects returned ONLY for retrieval operations (search, retrieve)
  - Embeddings NEVER included in any MCP response
- **PATTERN**: "Track each item's fate individually, summarize collectively"
- **ERROR GRANULARITY**: Each failed operation must identify the specific ID and reason for failure

### 8.12 Truth-First Search Requirements (NEW v2.2.0)
- **REQUIREMENT**: Perfect truth matches MUST always score 1.0
- **REQUIREMENT**: Semantic matches MUST be capped at 0.75
- **IMPLEMENTATION**: Enforce in score calculation function with explicit caps

### 8.13 Case Normalization Standards (NEW v2.2.0)
- **REQUIREMENT**: All text comparisons MUST use `toLower()` normalization
- **REQUIREMENT**: Original casing MUST be preserved in responses
- **IMPLEMENTATION**: Normalize at query time, preserve at response time

### 8.14 Query Classification Accuracy (NEW v2.2.0)
- **REQUIREMENT**: Technical identifiers MUST trigger exact matching bias
- **REQUIREMENT**: Wildcard queries MUST bypass semantic search entirely
- **IMPLEMENTATION**: Pre-process all queries through classification engine

### 8.15 Zero Fallback Architecture (NEW v2.2.0)
- **REQUIREMENT**: Failed searches MUST return empty results, not approximations
- **REQUIREMENT**: Search failures MUST be logged for pipeline improvement
- **IMPLEMENTATION**: No rescue mechanisms that mask true search failures

### 8.17 Practical Hybrid Score Requirements (NEW v2.3.0)
- **REQUIREMENT**: SearchResult.score MUST contain interpretable similarity values (0.0-1.0 range)
- **REQUIREMENT**: When vector similarity available, use raw cosine similarity as score
- **REQUIREMENT**: For exact matches without vector data, simulate high confidence scores (0.80-0.95)
- **REQUIREMENT**: matchType MUST be binary classification: 'semantic' | 'exact'
- **REQUIREMENT**: Truth levels remain internal for ranking logic only
- **IMPLEMENTATION**: 
  - Perfect truth matches → score: 0.95, matchType: 'exact'
  - High confidence exact → score: 0.90, matchType: 'exact'  
  - Exact name matches → score: 0.85, matchType: 'exact'
  - Exact content matches → score: 0.80, matchType: 'exact'
  - Vector similarity → score: raw_cosine_similarity, matchType: 'semantic'
- **USER EXPERIENCE**: Users get consistent 0-1 similarity interpretation across all match types
- **DEBUGGING**: Internal _internal field may contain truthLevel, matchReason for development only

### 8.18 Score Consistency Standards (NEW v2.3.0)
- **REQUIREMENT**: All search responses MUST return interpretable similarity values
- **REQUIREMENT**: Scores MUST be monotonic with result relevance (higher = more relevant)
- **REQUIREMENT**: No exposure of internal truth level enumeration to end users
- **IMPLEMENTATION**: Truth hierarchy logic drives sorting, but score reflects semantic distance
- **VALIDATION**: Ensure simulated scores for exact matches align with user expectations

### 8.19 Index Usage Standards (NEW v2.3.1)
- **REQUIREMENT**: Every defined index MUST have documented query patterns that use it
- **REQUIREMENT**: Unused indexes MUST be immediately removed from schema
- **IMPLEMENTATION**: 
  - All indexes must be verified with actual query patterns
  - FULLTEXT indexes must use proper `CALL db.index.fulltext.queryNodes()` syntax
  - No speculative "future-proofing" indexes allowed
  - Index usage must be validated with `PROFILE` queries in development
- **ENFORCEMENT**: Zero fallback architecture - queries either use indexes or fail fast
- **DOCUMENTATION**: Each index must include comment showing where it's used in codebase

## 9. Strategic Relationship Intelligence Guidelines

### 9.1 Agent Decision Framework for Relationship Creation

**ALWAYS Consider These Questions Before Creating Relationships:**

1. **Strength Assessment**:
   - "How significantly does Memory A influence Memory B?"
   - "Is this a core dependency (0.8+) or loose association (0.3-)?"
   - "Would removing this connection fundamentally change understanding?"

2. **Source Attribution**:
   - "Did the user explicitly request this connection?"
   - "Am I inferring this from content analysis?"
   - "Is this a pattern I discovered vs user instruction?"

### 9.2 Temporal Intelligence Patterns

**Use Relationship Timestamps For:**
- **Decision archaeology**: "What information influenced this choice at the time?"
- **Knowledge evolution**: "How did my understanding of X develop chronologically?"  
- **Influence tracing**: "Which earlier insights shaped later conclusions?"
- **Pattern emergence**: "When did this connection between domains first appear?"

### 9.3 Relationship Quality Optimization

**High-Value Relationship Patterns:**
- **Temporal Clustering**: Related decisions made within similar timeframes
- **User-Validated**: Connections explicitly confirmed by user feedback

**Avoid Low-Value Patterns:**
- **High Strength + Minimal Evidence**: Overstating relationship importance
- **Temporal Inconsistency**: Recent relationships claiming historical influence

### 9.5 Intelligence Amplification Through Metadata

**Query Strategies Enabled:**
```cypher
// Trace knowledge evolution over time  
MATCH (m1)-[r:RELATES_TO]->(m2)
WHERE r.relationType = 'INFLUENCES'
ORDER BY r.createdAt ASC
```

**Agent Intelligence Applications:**
- **Temporal Context**: "At the time you made Decision X, these were your strongest influences"