FROM node:22-slim AS builder
WORKDIR /app

# Copy package files and build config
COPY package*.json ./
COPY tsup.config.ts ./

# Install dependencies with increased timeout for @xenova/transformers
RUN npm config set registry https://registry.npmjs.org/ && \
    npm install --ignore-scripts --timeout=300000

# Copy source files (required before build)
COPY src ./src

# Build the application
RUN npm run build

# Production stage
FROM node:22-slim AS runner
WORKDIR /app

# Copy only production dependencies and built assets
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

# Install only production dependencies with timeout
RUN npm ci --omit=dev --ignore-scripts --timeout=300000

# Set environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV NEO4J_URI=bolt://localhost:7687
ENV NEO4J_USERNAME=neo4j
ENV NEO4J_PASSWORD=password
ENV NEO4J_DATABASE=neo4j

# HTTP Transport environment variables
ENV HTTP_PORT=3000
ENV HTTP_ENDPOINT=/mcp
ENV ENABLE_SESSIONS=true
ENV CORS_ORIGIN=*

# Add metadata label
LABEL org.opencontainers.image.title="MCP Memory Graph"
LABEL org.opencontainers.image.description="Neo4j-based Knowledge Graph with HTTP Transport"
LABEL org.opencontainers.image.version="2.3.16"
LABEL org.opencontainers.image.vendor="Sylweriusz"

# Expose HTTP port
EXPOSE 3000

# Default to HTTP transport for Smithery compatibility  
ENTRYPOINT ["node", "dist/http/server.mjs"]