# ---- Build stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy Prisma schema and migrations for production (PostgreSQL)
COPY prisma/schema.prisma prisma/schema.prisma
COPY prisma/migration[s]/ prisma/migrations/
RUN npx prisma generate --schema=prisma/schema.prisma

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ---- Runtime stage ----
FROM node:20-slim AS runtime

WORKDIR /app

# Install OpenSSL (required by Prisma at runtime)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r shopii && useradd -r -g shopii -s /bin/false shopii

# Copy production artifacts from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/prisma/migration[s]/ ./prisma/migrations/

# Copy entrypoint script
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Switch to non-root user
USER shopii

# Expose API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
