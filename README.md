# MCP Neo4j Memory Server

Persistent memory for AI conversations using Neo4j. Store, search, and relate information across sessions.

## Quick Start

```bash
npm install @sylweriusz/mcp-neo4j-memory-v2
```

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@sylweriusz/mcp-neo4j-memory-v2"],
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

### Option 1: DozerDB with GDS Plugin

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

### Option 2: Standard Neo4j (not(by me) tested with GDS)

```bash
# Docker (basic setup)
docker run -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/password neo4j:latest

# Or download from neo4j.com/download
```

### Option 3: Cloud (not(by me) tested with GDS)

- Neo4j AuraDB (free tier available)
- Use connection string as NEO4J_URI

**Note**: Without GDS plugin, vector search will fail.

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
- In-memory fallback works but is slower for large datasets

**Connection Issues:**
- Verify Neo4j is running: `docker ps`
- Test connection: `curl http://localhost:7474`
- Check credentials in environment variables

## License

MIT
