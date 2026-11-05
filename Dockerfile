FROM node:24-alpine AS client
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM rust:1.99-slim-bookworm AS node
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY server ./server
RUN cargo build --release --locked -p raeen-node

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home raeen
WORKDIR /app
COPY --from=node /build/target/release/raeen-node /usr/local/bin/raeen-node
COPY --from=client /build/dist ./dist
COPY LICENSE public/THIRD_PARTY_NOTICES.md ./
RUN mkdir /app/data && chown raeen:raeen /app/data
USER raeen
ENV RAEEN_BIND=0.0.0.0:3001 RAEEN_DATABASE=/app/data/raeen.db
EXPOSE 3001
VOLUME ["/app/data"]
CMD ["raeen-node"]
