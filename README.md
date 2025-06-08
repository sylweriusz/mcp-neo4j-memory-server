# Neo4j Memory Server

A Model Context Protocol (MCP) server that provides AI assistants with persistent, intelligent memory capabilities using Neo4j's graph database with unified architecture

## What it does

This server enables AI assistants to:
- **Remember** - Store memories as interconnected knowledge nodes with observations and metadata
- **Search** - Find relevant memories using semantic vector search, exact matching, and graph traversal
- **Connect** - Create meaningful relationships between memories with batch operations and cross-references
- **Organize** - Separate memories by project using different databases
- **Evolve** - Track how knowledge develops over time with temporal metadata and relationship networks

## Key Features

- 🧠 **Graph-based memory** - Memories are nodes, relationships are edges, observations are content
- 🔍 **Unified search** - Combines vector similarity, exact matching, wildcard queries, and graph traversal
- 🔗 **Intelligent relationships** - Track relationship strength, source, and creation time
- 📊 **Multi-database support** - Isolate memories by project or context
- 🚀 **MCP integration** - Works seamlessly with Claude Desktop and other MCP clients
- 🏠 **Self-hosted** - Your data stays on your infrastructure
- ⚡ **Batch operations** - Create multiple connected memories in single operations using localId

## Technical Highlights

- Built on Neo4j for scalable graph operations
- Vector embeddings using sentence transformers (384 dimensions)
- Clean architecture with domain-driven design
- Zero-fallback philosophy - fails fast for reliable debugging
- Supports GDS plugin for advanced vector operations
- **Unified Architecture** - 4 comprehensive tools for complete memory operations

## Quick Start

```bash
npm install @sylweriusz/mcp-neo4j-memory-server
```

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@sylweriusz/mcp-neo4j-memory-server"],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USERNAME": "neo4j", 
        "NEO4J_PASSWORD": "your-password"
      }
    }
  }
}
```

## Neo4j Setup

### Working setup: DozerDB with GDS Plugin

For the database, use DozerDB with the Graph Data Science plug-in, GDS is not only recommended but necessary:

For current installation instructions, see: https://dozerdb.org/

Example setup:
```bash
# Run DozerDB container with latest version
docker run \
    -p 7474:7474 -p 7687:7687 \
    -v $HOME/neo4j/data:/data \
    -v $HOME/neo4j/logs:/logs \
    -v $HOME/neo4j/plugins:/plugins \
    --env NEO4J_AUTH=neo4j/password \
    --env NEO4J_dbms_security_procedures_unrestricted='gds.*' \
    graphstack/dozerdb:latest

# Install GDS plugin - see dozerdb.org for current instructions

# Verify GDS plugin works
# In Neo4j Browser (http://localhost:7474):
# RETURN gds.similarity.cosine([1,2,3], [2,3,4]) as similarity
```

## Features

- **Persistent Memory**: Information survives conversation restarts
- **Semantic Search**: Natural language queries using vector embeddings
  - **GDS Plugin**: Native Neo4j vector operations (necessary)
- **Knowledge Graphs**: Connect related memories with directional relationships
- **Multi-Database**: Organize by project/context
- **Zero-Fallback Architecture**: Explicit errors instead of hidden failures
- **LocalId System**: Batch operations with cross-references within single request
- **Graph Traversal**: Navigate relationship networks (outbound/inbound/both)
- **Context Levels**: Control response detail (minimal/full/relations-only)
- **Date Filtering**: Relative ("7d", "30d") and absolute date queries

## Unified Tools

The server provides **4 unified MCP tools** that integrate automatically with Claude:

- `memory_store` - Create memories with observations and immediate relations in ONE operation
- `memory_find` - Unified search/retrieval with semantic search, direct ID lookup, date filtering, and graph traversal
- `memory_modify` - Comprehensive modification operations (update, delete, observations, relations)
- `database_switch` - Switch database context for isolated environments

## Memory Structure

```json
{
  "id": "dZ$abc123",
  "name": "Project Alpha", 
  "memoryType": "project",
  "metadata": {"status": "active", "priority": "high"},
  "observations": [
    {"id": "dZ$obs456", "content": "Started development", "createdAt": "2025-06-08T10:00:00Z"}
  ],
  "related": {
    "ancestors": [{"id": "dZ$def789", "name": "Initiative", "relation": "PART_OF", "distance": 1}],
    "descendants": [{"id": "dZ$ghi012", "name": "Task", "relation": "INCLUDES", "distance": 1}]
  }
}
```

## Advanced Usage Examples

### Batch Memory Creation with LocalId
```json
{
  "memories": [
    {
      "name": "Project Alpha",
      "memoryType": "project", 
      "localId": "proj1",
      "observations": ["AI research initiative", "Q1 2025 launch"],
      "metadata": {"status": "active", "priority": "high"}
    },
    {
      "name": "John Smith",
      "memoryType": "person",
      "localId": "person1", 
      "observations": ["Lead researcher", "PhD in ML"],
      "metadata": {"role": "lead", "department": "AI"}
    }
  ],
  "relations": [
    {"from": "person1", "to": "proj1", "type": "LEADS", "strength": 0.9}
  ]
}
```

### Graph Traversal Search
```json
{
  "query": "AI research",
  "traverseFrom": "dZ$abc123",
  "traverseDirection": "both", 
  "maxDepth": 2,
  "includeContext": "full"
}
```

### Date-Based Discovery
```json
{
  "query": "*",
  "createdAfter": "7d",
  "memoryTypes": ["project", "meeting"],
  "includeContext": "minimal"
}
```




## System Prompt

### The simplest use of the memory tool, the following usually is more than enough.

```
## Memory tool
- Store the database memory for this project in: ‘project-database-name’.
- Use the MCP memory tools to store all information related to this project.
- Always start a new session by switching to the database of this project 
and then search the memory for data related to the user prompt.

```

### For memory-focused workflows using unified architecture:

```markdown
# MCP Memory Essentials

## SETUP (do this first!)
**Switch to project database**: `database_switch({"databaseName": "project-memory-name"})`

## UNIFIED WORKFLOW
1. **Search first**: `memory_find({"query": "topic"})` before creating
2. **Create connected memories**: Use `memory_store()` with localId for batch operations
3. **Modify existing**: Use `memory_modify()` for updates, observations, relations

## CORE RULES (non-negotiable)
- **Language**: Match user's language, add `{language: 'en'}` to metadata
- **Structure**: Metadata = overviews, Observations = complete modules
- **One concept = one memory**: Don't create 5 memories for related things
- **Batch operations**: Use localId to reference memories within same request

## ADVANCED FEATURES
- **LocalId**: Reference memories within same request before they get real IDs
- **Graph traversal**: Follow relationship networks with `traverseFrom` parameter
- **Context levels**: Use "minimal" for lists, "full" for detailed work
- **Date filtering**: Find recent memories with `"createdAfter": "7d"`

## OBSERVATION COMPLETENESS TEST
When adding an observation, ask: "Is this self-contained?"
- ❌ Bad: "Step 3: Click submit button" (fragment)
- ✅ Good: "Login process: 1) Enter email 2) Enter password 3) Click submit 4) Handle 2FA if enabled" (complete module)

## OPTIMAL PATTERNS

# Batch Creation
Create multiple connected memories in ONE operation:
```
memory_store({
  "memories": [
    {"name": "Meeting", "localId": "meet1", "observations": ["..."]},
    {"name": "Action Item", "localId": "task1", "observations": ["..."]}
  ],
  "relations": [{"from": "meet1", "to": "task1", "type": "GENERATES"}]
})
```

# Relationship Navigation
Explore connected memories:
```
memory_find({
  "query": "project", 
  "traverseFrom": "existing-memory-id",
  "traverseDirection": "both"
})
```

# Health monitoring
- Run `memory_find({"query": "*", "limit": 100})` periodically
- Watch for 1-observation memories or generic names
```

## Troubleshooting

**Vector Search Issues:**
- Check logs for `[VectorSearch] GDS Plugin detected`
- GDS Plugin requires DozerDB setup (see Neo4j Setup section)

**Connection Issues:**
- Verify Neo4j is running: `docker ps`
- Test connection: `curl http://localhost:7474`
- Check credentials in environment variables

## License

MIT