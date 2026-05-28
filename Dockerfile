# syntax=docker/dockerfile:1.7

# ---- Stage 1: build ----
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# ca-certificates for npm/registry TLS. No native modules require a compiler
# in the current dep set, so we skip python/make/g++ here. Add them back if
# a native dep (e.g. better-sqlite3) is reintroduced.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# ---- Stage 2: runtime ----
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && rm -rf /root/.npm

COPY --from=builder /app/dist ./dist

# AWS RDS Global Root CA bundle so node-postgres can verify the cert chain
# on TLS connections to RDS. Without this, pg throws
# `self-signed certificate in certificate chain` because Node's Mozilla
# trust store does not include the Amazon RDS root.
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-global-bundle.pem
ENV PG_CA_CERT_PATH=/etc/ssl/rds-global-bundle.pem

EXPOSE 8080

CMD ["node", "dist/index.cjs"]
