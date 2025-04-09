FROM node:22-slim

WORKDIR /app

# Copy package files and dist
COPY package.json package-lock.json ./
COPY dist/ ./dist/

# Install dependencies, skipping prepare script
RUN npm install --production --ignore-scripts

# Set environment variables (can be overridden at runtime)
ENV NEO4J_URI=bolt://localhost:7687
ENV NEO4J_USERNAME=neo4j
ENV NEO4J_PASSWORD=password
ENV NEO4J_DATABASE=neo4j

# Set entrypoint
ENTRYPOINT ["node", "dist/index.mjs"]