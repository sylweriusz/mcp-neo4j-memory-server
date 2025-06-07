# Simplified single-stage Dockerfile for Smithery compatibility
FROM node:22-slim
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
COPY tsup.config.ts ./

# Install ALL dependencies (dev + prod) for build
RUN npm config set registry https://registry.npmjs.org/ && \
    npm install --timeout=300000

# Copy source code
COPY src ./src

# Build the application (tsup only, skip chmod in Docker)
RUN npx tsup

# Make files executable manually (Docker way)
RUN chmod +x dist/index.mjs && chmod +x dist/http/server.mjs

# Clean up dev dependencies after build
RUN npm prune --production

# Environment variables
ENV NODE_ENV=production
ENV NEO4J_URI=bolt://localhost:7687
ENV NEO4J_USERNAME=neo4j
ENV NEO4J_PASSWORD=password
ENV NEO4J_DATABASE=neo4j
ENV HTTP_PORT=3000

# Expose port
EXPOSE 3000

# Start the HTTP server
ENTRYPOINT ["node", "dist/http/server.mjs"]
