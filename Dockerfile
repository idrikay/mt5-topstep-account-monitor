# ─── Stage 1: install production dependencies ────────────────────────────────
# Pinning the exact Node version ensures reproducible builds across
# environments. Alpine keeps the attack surface minimal.
FROM node:20.19-alpine AS deps

WORKDIR /app

COPY backend/package*.json ./

RUN apk upgrade --no-cache

# ci installs exact versions from package-lock.json.
# --omit=dev excludes test/lint tooling from the final image.
# --ignore-scripts prevents lifecycle scripts from running as root during install.
RUN npm ci --omit=dev --ignore-scripts


# ─── Stage 2: production image ───────────────────────────────────────────────
FROM node:20.19-alpine AS production

RUN apk upgrade --no-cache

# Create an unprivileged user/group before any files are written.
# Assigning explicit UID/GID makes the securityContext in Kubernetes deterministic.
RUN addgroup --system --gid 1001 appgroup \
 && adduser  --system --uid 1001 --ingroup appgroup --no-create-home appuser \
 && mkdir -p /app/.metaapi \
 && chown -R appuser:appgroup /app

WORKDIR /app

# Copy the pre-built node_modules from the deps stage, then the application
# source.  The --chown flag ensures the non-root user owns every file before
# the USER directive takes effect.
COPY --from=deps    --chown=appuser:appgroup /app/node_modules    ./node_modules
COPY --chown=appuser:appgroup backend/ .
COPY                --chown=appuser:appgroup ./backend/mt5-report-service.js .

# Drop to the non-root user for all subsequent instructions and the runtime process.
USER appuser

# Document the port without binding to a host interface —
# binding is the responsibility of the Kubernetes Service.
EXPOSE 3010

# Inline health-check so `docker run` and local testing surface failures
# without needing an external probe.  The /api/health route is a fast,
# auth-free JSON endpoint added specifically for this purpose.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider \
        http://localhost:3010/api/health 2>&1 || exit 1

CMD ["node", "index.js"]