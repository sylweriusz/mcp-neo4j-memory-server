# Neo4j Memory Server

A Model Context Protocol (MCP) server that provides AI assistants with persistent, intelligent memory capabilities using Neo4j's graph database

## What it does

This server enables AI assistants to:
- **Remember** - Store memories as interconnected knowledge nodes with observations and metadata
- **Search** - Find relevant memories using semantic vector search or exact matching
- **Connect** - Create meaningful relationships between memories with strength and source tracking
- **Organize** - Separate memories by project using different databases
- **Evolve** - Track how knowledge develops over time with temporal metadata

## Key Features

- 🧠 **Graph-based memory** - Memories are nodes, relationships are edges, observations are content
- 🔍 **Hybrid search** - Combines vector similarity search with exact text matching
- 🔗 **Intelligent relationships** - Track relationship strength, source, and creation time
- 📊 **Multi-database support** - Isolate memories by project or context
- 🚀 **MCP integration** - Works seamlessly with Claude Desktop and other MCP clients
- 🏠 **Self-hosted** - Your data stays on your infrastructure

## Technical Highlights

- Built on Neo4j for scalable graph operations
- Vector embeddings using sentence transformers (384 dimensions)
- Clean architecture with domain-driven design
- Zero-fallback philosophy - fails fast for reliable debugging
- Supports GDS plugin for advanced vector operations

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

```bash
# Run DozerDB container
docker run \
    -p 7474:7474 -p 7687:7687 \
    -v $HOME/neo4j/data:/data \
    -v $HOME/neo4j/logs:/logs \
    -v $HOME/neo4j/plugins:/plugins \
    --env NEO4J_AUTH=neo4j/password \
    --env NEO4J_dbms_security_procedures_unrestricted='gds.*' \
    graphstack/dozerdb:5.26.3.0

# Install GDS plugin for vector similarity
wget https://github.com/DozerDB/graph-data-science/releases/download/2.8.0-alpha01/open-gds-2.8.0-alpha01.jar
docker cp open-gds-2.8.0-alpha01.jar $(docker ps -q --filter ancestor=graphstack/dozerdb):/plugins/
docker restart $(docker ps -q --filter ancestor=graphstack/dozerdb)

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

## Basic Usage

The server provides 6 MCP tools that integrate automatically with Claude:

- `memory_manage` - Create, update, delete memories
- `memory_retrieve` - Get memories by ID
- `memory_search` - Find memories with natural language
- `observation_manage` - Add detailed content to memories
- `relation_manage` - Connect memories
- `database_switch` - Change active database

## Memory Structure

```json
{
  "id": "Bm>xyz123",
  "name": "Project Alpha", 
  "memoryType": "project",
  "metadata": {"status": "active"},
  "observations": [
    {"content": "Started development", "createdAt": "2025-01-15T10:00:00Z"}
  ],
  "related": {
    "ancestors": [{"id": "Bm>abc", "name": "Initiative", "relation": "PART_OF"}],
    "descendants": [{"id": "Bm>def", "name": "Task", "relation": "INCLUDES"}]
  }
}
```
## System Prompt

For memory-focused workflows:

```markdown
# MCP Memory Essentials

## SETUP (do this first!)
**Switch to project database**: `database_switch("project-memory-name")`

## CRITICAL WORKFLOW (must follow)
1. **Search first**: `memory_search()` before creating
2. **Memory exists?** → Add observations with `observation_manage()`
3. **Memory doesn't exist?** → Create with `memory_manage()`, then add observations with `observation_manage()`

## CORE RULES (non-negotiable)
- **Language**: Match user's language, add `{language: 'en'}` to metadata
- **Structure**: Metadata = overviews, Observations = complete modules
- **One concept = one memory**: Don't create 5 memories for related things

## OBSERVATION COMPLETENESS TEST
When adding an observation, ask: "Is this self-contained?"
- ❌ Bad: "Step 3: Click submit button" (fragment)
- ✅ Good: "Login process: 1) Enter email 2) Enter password 3) Click submit 4) Handle 2FA if enabled" (complete module)



## OPTIONAL TUNING

# Relationships (when connecting memories)
- Strength: 0.9 (critical) → 0.1 (weak)  
- Source: "agent" or "user"

# Health monitoring
- Run memory_search('*', limit: 100) periodically
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
