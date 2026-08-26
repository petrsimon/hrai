FROM node:24-bookworm-slim AS dependencies

WORKDIR /app
COPY . .
RUN npm ci --omit=dev --workspace=@hrai/server --include-workspace-root=false

FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install --no-install-recommends --yes ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV HRAI_PORT=8791

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/packages/hrai-server/package.json ./packages/hrai-server/package.json
COPY --from=dependencies /app/packages/hrai-server/src ./packages/hrai-server/src

EXPOSE 8791

CMD ["node", "--experimental-strip-types", "packages/hrai-server/src/main.ts"]
