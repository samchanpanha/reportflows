#!/bin/sh
set -e

# ── Validate critical env vars before touching anything ──────────────
: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${NODE_ENV:=production}"

# ── Run pending DB migrations against the target database ────────────
echo "🔄 Running database migrations..."
npx prisma migrate deploy

# ── Seed once (idempotent — safe to run on every container start) ────
echo "🌱 Seeding database..."
npx prisma db seed || echo "⚠️  Seed skipped or failed — continuing."

# ── Start the Next.js standalone server ──────────────────────────────
echo "🚀 Starting Next.js..."
exec node server.js
