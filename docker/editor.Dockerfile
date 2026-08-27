FROM node:24-bookworm-slim AS build

WORKDIR /app

ARG HRAI_SERVER_URL=http://localhost:8080
ENV HRAI_SERVER_URL=${HRAI_SERVER_URL}
ENV NODE_ENV=production

COPY . .
RUN npm ci --include=dev
# Build workspace packages that scratch-gui consumes before compiling the playground.
RUN npm run build --workspaces --if-present

FROM nginx:1.29-alpine

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/packages/scratch-gui/build/ /usr/share/nginx/html/
