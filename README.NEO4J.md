# Neo4j Setup with DozerDB

DozerDB enhances Neo4j Community Edition with enterprise features like multi-database support. This guide shows you how to get it running with the Graph Data Science (GDS) plugin for vector similarity operations.

## Quick Start

Run DozerDB with the command below. Remember to change the default password:

```bash
docker run \
    -p 7474:7474 -p 7687:7687 \
    -v $HOME/neo4j/data:/data \
    -v $HOME/neo4j/logs:/logs \
    -v $HOME/neo4j/plugins:/plugins \
    --env NEO4J_AUTH=neo4j/password \
    --env NEO4J_dbms_security_procedures_unrestricted='gds.*' \
    graphstack/dozerdb:5.26.3.0
```

## Install Graph Data Science Plugin

After the container is running, install the OpenGDS plugin:

```bash
# Download the plugin
wget https://github.com/DozerDB/graph-data-science/releases/download/2.8.0-alpha01/open-gds-2.8.0-alpha01.jar

# Copy to plugins directory
docker cp open-gds-2.8.0-alpha01.jar $(docker ps -q --filter ancestor=graphstack/dozerdb):/plugins/

# Restart container
docker restart $(docker ps -q --filter ancestor=graphstack/dozerdb)
```

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
    image: graphstack/dozerdb:5.26.3.0
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
      - ./plugins:/plugins
    restart: unless-stopped

volumes:
  neo4j_data:
  neo4j_logs:
  neo4j_plugins:
```

Download the GDS plugin to `./plugins/` and run:

```bash
mkdir -p plugins
wget -O plugins/open-gds.jar https://github.com/DozerDB/graph-data-science/releases/download/2.8.0-alpha01/open-gds-2.8.0-alpha01.jar
docker-compose up -d
```

## Available Vector Functions

Once installed, these similarity functions are available:

- `gds.similarity.cosine(vector1, vector2)` - Cosine similarity
- `gds.similarity.euclidean(vector1, vector2)` - Euclidean similarity  
- `gds.similarity.euclideanDistance(vector1, vector2)` - Euclidean distance
- `gds.similarity.pearson(vector1, vector2)` - Pearson similarity

## Troubleshooting

**Container won't start**: Check if ports 7474/7687 are available, verify Docker has enough memory.

**Plugin not loaded**: Ensure the jar is in `/plugins/` and restart the container.

**Check logs**: `docker logs $(docker ps -q --filter ancestor=graphstack/dozerdb)`

## Links

- [DozerDB Website](https://dozerdb.org/)
- [OpenGDS Releases](https://github.com/DozerDB/graph-data-science/releases)
