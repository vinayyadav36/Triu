# ============================================================
# EmproiumVipani — Backend Dockerfile
# Node.js 20 LTS, multi-stage (build → production)
# ============================================================

# ── Stage 1: dependency installer ────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy manifests only (layer-cache friendly)
COPY server/package*.json ./

RUN npm ci --omit=dev

# ── Stage 2: production image ────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy installed modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY server/ ./

# Copy JSON DB seed files (server-side only)
COPY server/db/ ./db/

# Environment defaults (overridden at runtime via docker-compose / K8s secrets)
ENV NODE_ENV=production \
    PORT=5000

EXPOSE 5000

USER appuser

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "server.js"]
