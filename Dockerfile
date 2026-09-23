FROM node:22-bookworm-slim AS bun-base
WORKDIR /app
COPY --from=oven/bun:1.3.9 /usr/local/bin/bun /usr/local/bin/bun

FROM bun-base AS dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
ARG SOURCE_COMMIT
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_SOURCE_COMMIT=${SOURCE_COMMIT} \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
RUN test -n "$SOURCE_COMMIT" || (echo "SOURCE_COMMIT build arg is required" >&2; exit 1)
COPY . .
RUN bun run build

FROM bun-base AS production-dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ARG SOURCE_COMMIT
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_PUBLIC_SOURCE_COMMIT=${SOURCE_COMMIT}
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/next.config.ts ./next.config.ts
COPY --from=build --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["sh", "-c", "node --import tsx server/db/migrate.ts && exec node --import tsx server/index.ts"]
