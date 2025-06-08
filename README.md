# Neo4j Memory Server

A Model Context Protocol (MCP) server that provides AI assistants with persistent, intelligent memory capabilities using Neo4j's graph database with unified architecture

## What it does

This server enables AI assistants to:
- **Remember** - Store memories as interconnected knowledge nodes with observations and metadata
- **Search** - Find relevant memories using semantic vector search, exact matching, and graph traversal
- **Connect** - Create meaningful relationships between memories with batch operations and cross-references
- **Organize** - Separate memories by project using different databases
- **Evolve** - Track how knowledge develops over time with temporal metadata and relationship networks

## Features

### Core Capabilities
- 🧠 **Graph Memory** - Memories as nodes, relationships as edges, observations as content
- 🔍 **Unified Search** - Semantic vectors, exact matching, wildcards, and graph traversal in one tool
- 🔗 **Smart Relations** - Typed connections with strength, source tracking, and temporal metadata
- 📊 **Multi-Database** - Isolated project contexts with instant switching

### Advanced Operations  
- ⚡ **Batch Operations** - Create multiple memories with relationships in single request using localId
- 🎯 **Context Control** - Response detail levels: minimal (lists), full (complete data), relations-only
- 📅 **Time Queries** - Filter by relative ("7d", "30d") or absolute dates on any temporal field
- 🌐 **Graph Traversal** - Navigate networks in any direction with depth control

### Architecture
- 🚀 **MCP Native** - Seamless integration with Claude Desktop and MCP clients
- 💾 **Persistent Storage** - Neo4j graph database with GDS plugin for vector operations
- ⚠️ **Zero-Fallback** - Explicit errors for reliable debugging, no silent failures

## Technical Highlights

- Built on Neo4j for scalable graph operations
- Vector embeddings using sentence transformers (384 dimensions)
- Clean architecture with domain-driven design
- Supports GDS plugin for advanced vector operations (necessary)
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

## System Prompt

### The simplest use of the memory tool, the following usually is more than enough.

```
## Memory Tool Usage
- Store all memory for this project in database: 'project-database-name'
- Use MCP memory tools exclusively for storing project-related information
- Begin each session by:
  1. Switching to this project's database
  2. Searching memory for data relevant to the user's prompt

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