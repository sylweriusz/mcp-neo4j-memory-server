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

# Build the application
RUN npm run build

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
