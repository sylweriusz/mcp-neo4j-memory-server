# Graph Database Design (GDD) - Version 2.0.11

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
    - `nameEmbedding` (float array, 768 dimensions): Vector embedding for semantic search
    - `tags` (string array): Automatically extracted tags

- `Observation`: Discrete information fragments (narrative content)
  - Properties:
    - `id` (string, 18-char BASE85-based, unique): Observation compact identifier
    - `content` (string): Textual observation
    - `createdAt` (ISO timestamp): When observation was created
    - `source` (string, optional): Origin of information 
    - `confidence` (number, optional): Trust level (0.0-1.0)
    - `embedding` (float array, optional): Vector embedding (only stored if needed)

- `Tag`: Extracted keywords
  - Properties:
    - `name` (string, unique): Tag identifier

#### Relationship Types
- `HAS_OBSERVATION`:
  - Direction: `(Memory)-[:HAS_OBSERVATION]->(Observation)`
  - Properties:
    - `createdAt` (ISO timestamp): When relationship was created
    - `source` (string): Always "system" - automatically created during observation addition

- `HAS_TAG`:
  - Direction: `(Memory)-[:HAS_TAG]->(Tag)`
  - Properties:
    - `createdAt` (ISO timestamp): When relationship was created  
    - `source` (string): Always "system" - automatically created during tag extraction

- `RELATES_TO`:
  - Direction: `(Memory)-[:RELATES_TO]->(Memory)`
  - Properties:
    - `relationType` (string): Relationship classifier (INFLUENCES, DEPENDS_ON, etc.)
    - `strength` (float, 0.0-1.0): Relationship strength/importance
    - `context` (string array): Domain contexts where relationship applies
    - `source` (string): Origin of relationship ("agent", "user", "system")
    - `createdAt` (ISO timestamp): When relationship was created

#### Constraints
- Memory ID uniqueness: `CREATE CONSTRAINT IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE`
- Memory name+type uniqueness: Enforced programmatically
- Tag name uniqueness: `CREATE CONSTRAINT IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE`

#### Indexes
- Memory name vector index: `CREATE VECTOR INDEX memory_name_vector_idx FOR (m:Memory) ON (m.nameEmbedding)`
- Memory metadata full-text index: `CREATE FULLTEXT INDEX memory_metadata_idx IF NOT EXISTS FOR (m:Memory) ON EACH [m.metadata]`
- Tag name index: `CREATE INDEX tag_name_idx FOR (t:Tag) ON (t.name)`

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
  nameEmbedding?: number[]; // Vector embedding (768-dimension)
  tags?: string[];         // Extracted tags (maximum 6 per memory)
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
  context: string[];     // Domain contexts ["programming", "research", etc.]
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

#### Tag
```typescript
type Tag = {
  name: string;        // Unique tag identifier
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
2. Calculate name embedding and extract tags
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

2. **Memory-to-Tag Relations** (automatic during memory creation/update):
   - Created by tag extraction service during memory processing
   - `source`: Always "system"
   - `createdAt`: Current ISO timestamp when tags are extracted

3. **Memory-to-Observation Relations** (automatic during observation management):
   - Created during `observation_manage` "add" operations
   - `source`: Always "system" 
   - `createdAt`: Current ISO timestamp when observation is added

### 2.4 Context Inference Logic
When agent does not provide explicit `context` array:
```typescript
function inferContext(fromMemory: Memory, toMemory: Memory): string[] {
  const typeContextMap = {
    'project': ['development', 'programming'],
    'research': ['analysis', 'learning'],
    'creative': ['writing', 'ideation'],
    'process': ['workflow', 'methodology'],
    'preference': ['personal', 'configuration'],
    'review': ['feedback', 'evaluation']
  };
  
  const contexts = new Set([
    ...(typeContextMap[fromMemory.memoryType] || []),
    ...(typeContextMap[toMemory.memoryType] || [])
  ]);
  
  return Array.from(contexts);
}
```

### 2.5 Source Determination Logic
```typescript
function determineSource(relationRequest: RelationRequest): string {
  // 1. Explicit agent specification takes precedence
  if (relationRequest.source === "user") return "user";
  
  // 2. System-generated relationships (tags, observations)
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
OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)
RETURN m.id AS id, m.name AS name, m.memoryType AS memoryType,
       m.metadata AS metadata, m.createdAt AS createdAt, m.modifiedAt AS modifiedAt,
       m.lastAccessed AS lastAccessed, 
       [obs IN collect(DISTINCT {content: o.content, createdAt: o.createdAt}) | obs] as observations,
       collect(t.name) AS tags, ancestors, descendants
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
  nameEmbedding: $nameEmbedding,
  tags: $tags
})
RETURN m
```

### 3.3 Vector Search
```cypher
// Enterprise Edition
MATCH (m:Memory)
WHERE m.nameEmbedding IS NOT NULL
WITH m, vector.similarity(m.nameEmbedding, $queryVector) AS score
WHERE score >= $threshold
ORDER BY score DESC
LIMIT $limit
RETURN m.id, m.name, score

// GDS Version (Community Edition)
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
OPTIONAL MATCH (m)-[:HAS_TAG]->(t:Tag)

RETURN m.id as id, m.name as name, m.memoryType as type, 
       m.metadata as metadata, m.nameEmbedding as embedding,
       [obs IN collect(DISTINCT {content: o.content, createdAt: o.createdAt}) | obs] as observations,
       collect(DISTINCT t.name)[0..3] as tags,
       ancestors, descendants
```

### 3.5 Enhanced Relationship Creation
```cypher
// Create enhanced relationship with full metadata
MATCH (from:Memory {id: $fromId}), (to:Memory {id: $toId})
CREATE (from)-[:RELATES_TO {
  relationType: $relationType,
  strength: $strength,
  context: $context,
  source: $source,
  createdAt: $createdAt
}]->(to)
```

### 3.6 Memory Deletion
```cypher
// Delete observations
MATCH (m:Memory {id: $memoryId})-[:HAS_OBSERVATION]->(o:Observation)
DETACH DELETE o

// Delete tag relationships  
MATCH (m:Memory {id: $memoryId})-[r:HAS_TAG]->()
DELETE r

// Delete memory relations
MATCH (m:Memory {id: $memoryId})-[r:RELATES_TO]-()
DELETE r
MATCH ()-[r:RELATES_TO]->(m:Memory {id: $memoryId})
DELETE r

// Delete memory
MATCH (m:Memory {id: $memoryId})
DELETE m
```

## 4. Search Implementation

### 4.1 Enhanced Unified Search Strategy
- Vector similarity: 50% weight - primary semantic understanding
- Metadata exact matching: 25% weight - high-value exact matches
- Metadata fulltext: 15% weight - supporting fulltext context  
- Tag matching: 10% weight - supporting keyword context
- Graph context: Integrated 2-level relationship traversal with exact relation types
- AI-optimized response: Minimal data transfer with essential context
- **Limit enforcement**: All queries honor the limit parameter, including wildcard "*" and empty "" queries
- **Ordered observations**: Retrieved observations are sorted chronologically (oldest to newest) by createdAt timestamp

### 4.2 Vector Search Support
- **Enterprise Edition**: Native `vector.similarity()` function
- **GDS Plugin**: `gds.similarity.cosine()` function  
- **In-Memory Fallback**: TypeScript cosine similarity implementation

## 5. Database Management

### 5.1 Multi-Database Support
- Runtime database selection
- Database-level isolation
- Per-project database separation
- On-demand database creation
- Automatic index verification

### 5.2 Database Indexes
```cypher
// Core constraints
CREATE CONSTRAINT IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE
CREATE CONSTRAINT IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE

// Performance indexes
CREATE INDEX IF NOT EXISTS memory_type_idx FOR (m:Memory) ON (m.memoryType)
CREATE INDEX IF NOT EXISTS memory_name_idx FOR (m:Memory) ON (m.name)
CREATE INDEX IF NOT EXISTS memory_accessed_idx FOR (m:Memory) ON (m.lastAccessed)
CREATE FULLTEXT INDEX IF NOT EXISTS observation_content FOR (o:Observation) ON EACH [o.content]
CREATE INDEX IF NOT EXISTS relation_type_idx FOR ()-[r:RELATES_TO]-() ON (r.relationType)
CREATE INDEX IF NOT EXISTS tag_name_idx FOR (t:Tag) ON (t.name)

// Metadata indexes
CREATE FULLTEXT INDEX memory_metadata_idx IF NOT EXISTS FOR (m:Memory) ON EACH [m.metadata]

// Vector indexes (Enterprise Edition)
CREATE VECTOR INDEX IF NOT EXISTS memory_name_vector_idx 
FOR (m:Memory) ON (m.nameEmbedding)
OPTIONS {indexConfig: {
  `vector.dimensions`: 768,
  `vector.similarity_function`: 'cosine'
}}
```

## 6. Tag Management System

### 6.1 Enhanced Tag Extraction v2.1 Implementation
- **Multilingual Stopwords**: Professional extraction from comprehensive dictionary sources (20,000+ stopwords)
- **Fixed POS Tagging**: compromise.js processing BEFORE text lowercasing to preserve proper nouns
- **Enhanced Technical Term Detection**: Extended regex patterns for React.js, APIs, compound words
- **Observations Integration**: 60% weight from memory name, 40% from observations content
- **6-Tag Target**: Maximum 6 quality tags per memory (up from 3-5)
- **Semantic Deduplication**: Vector similarity to remove redundant tags with database caching

### 6.2 Architecture & Implementation
- **Extracted Stopwords Integration**: 20,000+ stopwords across 52 languages from professional extraction
- **compromise.js POS Tagging**: Professional noun phrase extraction
- **Enhanced Pattern Recognition**: Technical terms and compound words  
- **Preserved Semantic Engine**: Database-cached embeddings for deduplication
- **Domain-Agnostic Design**: Works equally well for biology, tech, art, etc.

### 6.3 Core Processing Pipeline
```typescript
// 1. Import extracted stopwords for 20,000+ multilingual stopwords
import { getCombinedStopwords } from '../data/index.js';

async function getMultilingualStopwords(): Promise<Set<string>> {
  const languages = ['en', 'pl', 'de', 'fr', 'es', 'it'];
  return await getCombinedStopwords(languages);
}
}

// 2. Fixed POS Tagging Sequence (BEFORE lowercasing)
function extractNounsAdvanced(text: string): string[] {
  const doc = nlp(text); // Process original text first
  
  // Extract proper nouns BEFORE lowercasing
  const properNouns = doc.people().concat(doc.places()).concat(doc.organizations())
    .out('array').filter(noun => noun.length > 2);
  
  // Then extract common nouns
  const commonNouns = doc.nouns().out('array')
    .filter(noun => noun.length > 2)
    .map(noun => noun.toLowerCase());
    
  return [...properNouns, ...commonNouns];
}

// 3. Enhanced Technical Term Detection
const technicalPatterns = [
  /\b[A-Z][a-zA-Z]*\.js\b/g,              // React.js, Vue.js, Node.js
  /\b[A-Z][a-zA-Z]*\.[a-zA-Z]+\b/g,       // TensorFlow.js, D3.js
  /\b[A-Z]{3,}-[A-Z][a-z0-9]+\b/g,        // CRISPR-Cas9, RNA-seq
  /\b[A-Z][a-zA-Z]+-[A-Z][a-zA-Z]+\b/g,   // Weber-Schmidt
  /\b[A-Z]{2,}\d*\b/g,                     // API, HTTP, ES2024
  /\b[a-zA-Z]+-[a-zA-Z]+(?:-[a-zA-Z]+)*\b/g  // machine-learning
];

// 4. Observations Integration (60% name, 40% observations)
const weightedCandidates = [
  ...nameTags.map(tag => ({ tag, weight: 1.5 })),      // Name priority
  ...observationTags.map(tag => ({ tag, weight: 1.0 })) // Observation support
];

// 5. 6-Tag Target with Semantic Deduplication
const finalTags = await semanticDeduplicationWithCache(session, candidateNames, 0.75);
return finalTags.slice(0, 6);
```

### 6.4 Quality Improvements over Previous Versions
- **40%+ Better Coverage**: 6000+ stopwords vs 80 custom words
- **Intelligent Noun Extraction**: POS tagging vs regex patterns  
- **Technical Term Support**: Handles React.js, APIs, compound words
- **Multi-Domain Performance**: Works equally well across all subject areas
- **Faster Processing**: No language detection overhead
- **Maintainable Code**: Clean architecture, fewer edge cases

### 6.5 Dependencies & Libraries
- **Extracted Stopwords**: Professional extraction across 52 languages from comprehensive dictionaries
- **compromise**: Lightweight POS tagging and noun extraction
- **xenova/transformers**: Semantic similarity for deduplication
- **No Node-NLP**: Removed complex NLP dependency for simpler approach

### 6.6 Tag Quality Examples

#### Technical Content:
```
Input: "Building React.js application with PostgreSQL database and Redis caching"
Output: ["react.js", "postgresql", "redis", "application", "caching"]
```

#### Scientific Content:
```
Input: "CRISPR gene editing targets specific DNA sequences in mammalian cells"
Output: ["crispr", "gene editing", "dna sequences", "mammalian cells"]
```

#### Multi-language Content:
```
Input: "Tworzenie aplikacji mobilnej z React Native i Firebase backend"
Output: ["react native", "firebase", "aplikacji", "mobilnej", "backend"]
```

### 6.7 Performance Characteristics
- **Tag Extraction**: 20-50ms per memory (down from 100-200ms)
- **Database Caching**: 95%+ hit rate for tag embeddings
- **Memory Usage**: 60% lower than Node-NLP approach
- **Quality Consistency**: Stable across all domain types

### 6.8 Temporal Tag Drift
- **New Tag Preference**: When observations are added, new tag candidates receive a 10% weight boost (1.1x multiplier)
- **Rationale**: Maintains tag relevance by slightly favoring recent context while preserving historical accuracy
- **Implementation**: Apply 1.1x weight multiplier to tags extracted from new observations during re-extraction

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
      "context": ["string"],                 // Domain contexts, auto-inferred if not provided
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
- `"system"`: Reserved for automatic tag/observation relationships

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

#### Enhanced Search Response
```typescript
{
  "memories": [
    {
      "id": "Bm>xyz123",
      "name": "Machine Learning Project",
      "type": "project",
      "observations": [
        {
          "id": "Bm>obs123",  // Observation ID in search results
          "content": "...",
          "createdAt": "2025-05-25T10:00:00Z"
        }
      ],
      "tags": ["machine-learning", "tensorflow"],
      "metadata": { "status": "active" },
      "related": {
        "ancestors": [{"id": "...", "name": "...", "relation": "...", "distance": 1}],
        "descendants": [{"id": "...", "name": "...", "relation": "...", "distance": 1}]
      }
    }
  ],
  "_meta": {
    "total": 15,
    "queryTime": 95,
    "message": "Enhanced search with metadata matching and graph context"
  }
}
```

#### Memory Retrieval Response
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
      "tags": ["machine-learning", "tensorflow"],
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
  - "system": Automatic relationships (tags, observations, future similarity detection)
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

These requirements are CRITICAL for user experience and data integrity. Any deviation from these standards constitutes a functional bug that must be addressed immediately.

## 9. Strategic Relationship Intelligence Guidelines

### 9.1 Agent Decision Framework for Relationship Creation

**ALWAYS Consider These Questions Before Creating Relationships:**

1. **Strength Assessment**:
   - "How significantly does Memory A influence Memory B?"
   - "Is this a core dependency (0.8+) or loose association (0.3-)?"
   - "Would removing this connection fundamentally change understanding?"

2. **Context Relevance**:
   - "In which domains does this relationship matter?"
   - "Should this connection appear when filtering by 'programming' vs 'creative'?"
   - "Does this span multiple contexts or stay within one domain?"

3. **Source Attribution**:
   - "Did the user explicitly request this connection?"
   - "Am I inferring this from content analysis?"
   - "Is this a pattern I discovered vs user instruction?"

### 9.2 Temporal Intelligence Patterns

**Use Relationship Timestamps For:**
- **Decision archaeology**: "What information influenced this choice at the time?"
- **Knowledge evolution**: "How did my understanding of X develop chronologically?"  
- **Influence tracing**: "Which earlier insights shaped later conclusions?"
- **Pattern emergence**: "When did this connection between domains first appear?"

### 9.3 Cross-Domain Intelligence Strategy

**Leverage Context Arrays To:**
- **Bridge disciplines**: Connect programming patterns to writing workflows
- **Identify transferable insights**: Research methodologies applicable to creative projects
- **Surface unexpected connections**: Business processes that inform technical architecture
- **Enable domain filtering**: "Show only programming-related relationships for this memory"

### 9.4 Relationship Quality Optimization

**High-Value Relationship Patterns:**
- **Strong + Specific Context**: Major influences within clear domain boundaries
- **Medium + Cross-Context**: Insights that transfer between disciplines  
- **Temporal Clustering**: Related decisions made within similar timeframes
- **User-Validated**: Connections explicitly confirmed by user feedback

**Avoid Low-Value Patterns:**
- **Weak + Generic Context**: Vague connections without clear domain relevance
- **High Strength + Minimal Evidence**: Overstating relationship importance
- **Context Explosion**: Adding too many contexts without clear rationale
- **Temporal Inconsistency**: Recent relationships claiming historical influence

### 9.5 Intelligence Amplification Through Metadata

**Query Strategies Enabled:**
```cypher
// Find strongest influences in specific domain
MATCH (m1)-[r:RELATES_TO]->(m2) 
WHERE 'programming' IN r.context AND r.strength > 0.7
ORDER BY r.strength DESC

// Trace knowledge evolution over time  
MATCH (m1)-[r:RELATES_TO]->(m2)
WHERE r.relationType = 'INFLUENCES'
ORDER BY r.createdAt ASC

// Discover cross-domain patterns
MATCH (m1)-[r:RELATES_TO]->(m2)
WHERE size(r.context) > 1 AND r.strength > 0.6
```

**Agent Intelligence Applications:**
- **Smart Suggestions**: "Based on strong programming relationships, you might also find these writing patterns relevant"
- **Context Switching**: "When working on creative projects, here are your most valuable cross-domain insights"  
- **Temporal Context**: "At the time you made Decision X, these were your strongest influences"
- **Relationship Quality**: "These connections have proven most valuable in similar contexts"