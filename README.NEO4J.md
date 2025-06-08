# Neo4j Setup with DozerDB

DozerDB enhances Neo4j Community Edition with additional features like multi-database support. This guide shows you how to get it running with the Graph Data Science (GDS) plugin for vector similarity operations.

## Quick Start

Follow the installation instructions at https://dozerdb.org/ for the latest setup procedures.

Example DozerDB setup:

```bash
docker run \
    -p 7474:7474 -p 7687:7687 \
    -v $HOME/neo4j/data:/data \
    -v $HOME/neo4j/logs:/logs \
    -v $HOME/neo4j/plugins:/plugins \
    --env NEO4J_AUTH=neo4j/password \
    --env NEO4J_dbms_security_procedures_unrestricted='gds.*' \
    graphstack/dozerdb:latest
```

## Install Graph Data Science Plugin

Refer to https://dozerdb.org/ for current GDS plugin installation instructions, as download links and versions change frequently.

## Access Neo4j Browser

Open http://localhost:7474 in your browser.

- **Username**: `neo4j`  
- **Password**: `password` (change this!)

## Configuration for Memory App

Create a `.env` file:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j
```

## Verify Installation

Test that everything works:

```cypher
// Test similarity function
RETURN gds.similarity.cosine([1,2,3], [2,3,4]) as similarity
```

## Docker Compose Alternative

If you prefer compose, create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  neo4j:
    image: graphstack/dozerdb:latest
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/password
      - NEO4J_dbms_security_procedures_unrestricted=gds.*
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - neo4j_plugins:/plugins
    restart: unless-stopped

volumes:
  neo4j_data:
  neo4j_logs:
  neo4j_plugins:
```

## Available Vector Functions

Once installed, these similarity functions are available:

- `gds.similarity.cosine(vector1, vector2)` - Cosine similarity
- `gds.similarity.euclidean(vector1, vector2)` - Euclidean similarity  
- `gds.similarity.euclideanDistance(vector1, vector2)` - Euclidean distance
- `gds.similarity.pearson(vector1, vector2)` - Pearson similarity

## Troubleshooting

**Container won't start**: Check if ports 7474/7687 are available, verify Docker has enough memory.

**Plugin not loaded**: Check DozerDB documentation for current plugin installation procedures.

**Check logs**: `docker logs $(docker ps -q --filter ancestor=graphstack/dozerdb)`

## Links

- [DozerDB Website](https://dozerdb.org/)
- [DozerDB Documentation](https://dozerdb.org/)
