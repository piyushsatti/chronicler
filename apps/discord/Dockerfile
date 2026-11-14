FROM oven/bun:1.3.14 AS build
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/discord/package.json ./apps/discord/
# Every workspace in the root package.json must exist for a frozen install.
COPY apps/web/package.json ./apps/web/
COPY apps/discord/ ./apps/discord/

RUN bun install --frozen-lockfile
RUN bun run --filter @pi/discord build

FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/apps/discord/package.json ./apps/discord/package.json
COPY --from=build --chown=bun:bun /app/apps/discord/node_modules ./apps/discord/node_modules
COPY --from=build --chown=bun:bun /app/apps/discord/dist ./apps/discord/dist

USER bun

CMD ["bun", "apps/discord/dist/index.js"]
