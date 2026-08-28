FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/hrai-server/package.json packages/hrai-server/package.json
RUN npm ci --workspace=@hrai/server --include-workspace-root=false --ignore-scripts

FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=test

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/hrai-server/package.json packages/hrai-server/package.json
COPY packages/hrai-server/src ./packages/hrai-server/src
COPY packages/hrai-server/test ./packages/hrai-server/test
COPY packages/hrai-server/tsconfig.json packages/hrai-server/tsconfig.json
COPY packages/hrai-server/vitest.config.ts packages/hrai-server/vitest.config.ts

CMD ["npm", "run", "eval:game-design", "--workspace=@hrai/server", "--", "--reporter=verbose"]
