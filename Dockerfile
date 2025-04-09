FROM node:22-slim AS builder
WORKDIR /app

# Copy files needed for build
COPY package.json ./
COPY package-lock.json ./
COPY tsup.config.ts ./
COPY src ./src

# Install and build
RUN npm install
RUN npm run build

# Create production image
FROM node:22-slim AS runner
WORKDIR /app

# Copy only necessary files from builder
COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/node_modules /app/node_modules

# Set environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV NEO4J_URI=bolt://localhost:7687
ENV NEO4J_USERNAME=neo4j
ENV NEO4J_PASSWORD=password
ENV NEO4J_DATABASE=neo4j

# Set entrypoint
ENTRYPOINT ["node", "dist/index.mjs"]