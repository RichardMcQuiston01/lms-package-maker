# syntax=docker/dockerfile:1

# ---- build: bun workspace install, package build, Next standalone build
FROM oven/bun:1.4.4-debian AS build
WORKDIR /repo
COPY package.json bun.lock tsconfig.base.json tsconfig.test.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages
COPY scripts scripts
RUN bun install --frozen-lockfile
COPY apps/web apps/web
# DATABASE_URL is only read when the app runs; the build never connects.
RUN bun run build \
 && NODE_ENV=production bun run --cwd apps/web prisma generate \
 && NODE_ENV=production bun run --cwd apps/web build

# ---- run: plain Node with the standalone output and the Prisma CLI for migrations
FROM node:22-bookworm-slim AS run
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    LMS_DATA_DIR=/data
WORKDIR /app
# The Prisma CLI is installed on its own (pinned to the app's major version) so
# the container can apply migrations before it starts.
RUN mkdir /opt/prisma \
 && cd /opt/prisma \
 && npm init -y >/dev/null \
 && npm install --no-audit --no-fund prisma@6.19.3 \
 && chmod -R a+rX /opt/prisma
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/prisma ./apps/web/prisma
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /data \
 && chown -R node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "apps/web/server.js"]
