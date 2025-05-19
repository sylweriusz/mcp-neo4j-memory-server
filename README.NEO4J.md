# Neo4j with DozerDB and GDS Plugin Setup

This guide shows how to set up Neo4j using DozerDB (open-source Neo4j distribution) with the Graph Data Science (GDS) plugin for vector similarity operations.

## What is DozerDB?

DozerDB is an open-source plugin that enhances Neo4j Community Edition with enterprise features like multi-database support, backup/restore capabilities. **Note**: GDS (Graph Data Science) is NOT pre-installed and requires separate installation.

## Quick Start with Docker

### 1. Run DozerDB Container (Base)

```bash
docker run \
    --name neo4j-dozer \
    -p 7474:7474 -p 7687:7687 \
    -e NEO4J_AUTH=neo4j/password \
    -v neo4j_data:/data \
    -v neo4j_logs:/logs \
    -v neo4j_plugins:/plugins \
    -d graphstack/dozerdb:latest
```

### 2. Install OpenGDS Plugin

Download the OpenGDS jar file and copy it to plugins directory:

```bash
# Download OpenGDS (check latest version at https://github.com/DozerDB/graph-data-science/releases)
wget https://github.com/DozerDB/graph-data-science/releases/download/2.8.0-alpha01/open-gds-2.8.0-alpha01.jar

# Copy to plugins directory (adjust path to your volume mount)
docker cp open-gds-2.8.0-alpha01.jar neo4j-dozer:/plugins/

# Restart container
docker restart neo4j-dozer
```

### 3. Access Neo4j Browser

Open your browser and go to: `http://localhost:7474`

- **Username**: `neo4j`
- **Password**: `password`

## Configuration for Memory App

### Environment Variables

Create a `.env` file in your project root:

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j
```

### Docker Compose (Alternative)

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  neo4j:
    image: graphstack/dozerdb:latest
    container_name: neo4j-dozer
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/password
      - NEO4J_dbms_security_procedures_unrestricted=gds.*,apoc.*
      - NEO4J_dbms_memory_heap_initial__size=512m
      - NEO4J_dbms_memory_heap_max__size=2G
      - NEO4J_dbms_memory_pagecache_size=512m
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - neo4j_plugins:/plugins
      - ./plugins:/plugins  # Mount local plugins directory
    restart: unless-stopped

volumes:
  neo4j_data:
  neo4j_logs:
  neo4j_plugins:
```

Then place OpenGDS jar in local `./plugins/` directory and run:
```bash
# Download OpenGDS jar to plugins folder
mkdir -p plugins
wget -O plugins/open-gds.jar https://github.com/DozerDB/graph-data-science/releases/download/2.8.0-alpha01/open-gds-2.8.0-alpha01.jar

# Start
docker-compose up -d
```

## Installation Steps Summary

1. **Run DozerDB container** - provides Neo4j Community + enterprise features
2. **Download OpenGDS jar** - grab from DozerDB's GDS fork 
3. **Copy jar to plugins directory** 
4. **Configure unrestricted procedures** (`NEO4J_dbms_security_procedures_unrestricted=gds.*`)
5. **Restart container**

## Version Compatibility

| Neo4j Version | DozerDB Version | OpenGDS Version |
|---------------|----------------|----------------|
| 5.26.x | 5.26.x.x | 2.8.0-alpha01 |
| 5.25.x | 5.25.x.x | 2.8.0-alpha01 |
| 5.22.x | 5.22.x.x | Contact DozerDB |

Check latest versions:
- DozerDB releases: https://github.com/DozerDB/dozerdb-plugin/releases
- OpenGDS releases: https://github.com/DozerDB/graph-data-science/releases

## Verify Installation

### 1. Check DozerDB Plugin
Connect to Neo4j Browser and verify DozerDB is running:
```cypher
// Look for DozerDB banner in logs or
SHOW DATABASES  // Should work (multi-database feature)
```

### 2. Verify GDS Installation

```cypher
// Check GDS version
CALL gds.version() YIELD version
RETURN version

// List available GDS procedures
CALL gds.list() YIELD name, description
WHERE name CONTAINS "similarity"
RETURN name, description
LIMIT 10

// Test similarity function
RETURN gds.similarity.cosine([1,2,3], [2,3,4]) as similarity
```

## Alternative: Pure Neo4j Community with Manual GDS

If you prefer standard Neo4j Community Edition:

```bash
# Run Neo4j Community
docker run \
    --name neo4j-community \
    -p 7474:7474 -p 7687:7687 \
    -e NEO4J_AUTH=neo4j/password \
    -e NEO4J_dbms_security_procedures_unrestricted=gds.*,apoc.* \
    -v neo4j_data:/data \
    -v neo4j_logs:/logs \
    -v neo4j_plugins:/plugins \
    -d neo4j:5.26-community

# Download and install OpenGDS manually
wget -O open-gds.jar https://github.com/neo4j/graph-data-science/releases/download/2.10.1/neo4j-graph-data-science-2.10.1.jar
docker cp open-gds.jar neo4j-community:/plugins/
docker restart neo4j-community
```

**Note**: Standard GDS requires Enterprise license. Use OpenGDS for Community Edition.

- `gds.similarity.cosine(vector1, vector2)` - Cosine similarity
- `gds.similarity.euclidean(vector1, vector2)` - Euclidean similarity  
- `gds.similarity.euclideanDistance(vector1, vector2)` - Euclidean distance
- `gds.similarity.pearson(vector1, vector2)` - Pearson similarity
- `gds.similarity.jaccard(vector1, vector2)` - Jaccard similarity
- `gds.similarity.overlap(vector1, vector2)` - Overlap similarity

## Vector Similarity Functions Available

OpenGDS includes these similarity functions:

```cypher
// After creating memories with embeddings
MATCH (m1:Memory), (m2:Memory)
WHERE m1.nameEmbedding IS NOT NULL 
  AND m2.nameEmbedding IS NOT NULL
  AND id(m1) < id(m2)
WITH m1, m2, 
     gds.similarity.cosine(m1.nameEmbedding, m2.nameEmbedding) AS similarity
RETURN m1.name, m2.name, 
       round(similarity * 10000) / 10000 as similarity_score
ORDER BY similarity_score DESC
LIMIT 5
```

## Test with Memory App Data

### Recommended Settings

```bash
# For production workloads
docker run \
    --name neo4j-gds \
    -p 7474:7474 -p 7687:7687 \
    -e NEO4J_AUTH=neo4j/password \
    -e NEO4J_PLUGINS='["graph-data-science"]' \
    -e NEO4J_dbms_memory_heap_initial__size=1G \
    -e NEO4J_dbms_memory_heap_max__size=4G \
    -e NEO4J_dbms_memory_pagecache_size=1G \
    -v neo4j_data:/data \
    -v neo4j_logs:/logs \
    -d dozerldb/neo4j-gds:latest
```

## Troubleshooting

### Container won't start
- Check if ports 7474 and 7687 are available
- Verify Docker has enough memory allocated
- Check logs: `docker logs neo4j-gds`

### GDS plugin not loaded
- Ensure OpenGDS jar is in plugins directory
- Check file permissions: `chmod 644 /plugins/open-gds.jar`
- Verify with: `CALL gds.list() YIELD name RETURN count(name)` (should be > 0)
- Check version compatibility between Neo4j and GDS

### Version compatibility issues
- OpenGDS versions are tied to specific Neo4j versions
- Check error logs: `docker logs neo4j-dozer`
- Download correct OpenGDS version for your Neo4j version

### Performance issues
- Increase heap memory (`NEO4J_dbms_memory_heap_max__size`)
- Monitor with: `CALL gds.debug.sysInfo()`

## Useful Commands

```bash
# Stop container
docker stop neo4j-dozer

# Start container
docker start neo4j-dozer

# View logs
docker logs -f neo4j-dozer

# Access container shell
docker exec -it neo4j-dozer bash

# Check plugins directory
docker exec neo4j-dozer ls -la /plugins/

# Remove container and data
docker rm -f neo4j-dozer
docker volume rm neo4j_data neo4j_logs neo4j_plugins
```

## Links

- [DozerDB Official Site](https://dozerdb.org/)
- [DozerDB GitHub](https://github.com/dozerdb)
- [DozerDB Graph Data Science Fork](https://github.com/DozerDB/graph-data-science)
- [Neo4j GDS Documentation](https://neo4j.com/docs/graph-data-science/)
- [Neo4j Docker Documentation](https://neo4j.com/docs/operations-manual/current/docker/)

---

**Important Notes**: 
- DozerDB enhances Neo4j Community with enterprise features (multi-database, backup/restore)
- GDS is **not** pre-installed - requires separate OpenGDS installation
- OpenGDS provides open-source Graph Data Science capabilities for Community Edition
- Regular GDS plugin requires Enterprise license
