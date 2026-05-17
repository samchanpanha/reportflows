#!/bin/sh
set -e

# ── Validate critical env vars before touching anything ──────────────
: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${NODE_ENV:=production}"
: "${AUTH_SECRET:?AUTH_SECRET is not set}"
: "${ENCRYPTION_KEY:?ENCRYPTION_KEY is not set}"

# ── Sync schema to a fresh database (no pre-existing migration files) ──
echo "🔄 Syncing database schema..."
npx prisma db push --accept-data-loss --force-reset || npx prisma db push

# ── Seed once (idempotent — safe to run on every container start) ────
echo "🌱 Seeding database..."
npx prisma db seed || echo "⚠️  Seed skipped or failed — continuing."

# ── Start the Next.js standalone server ──────────────────────────────
echo "🚀 Starting Next.js..."
exec node server.js
