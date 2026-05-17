#!/bin/sh
set -e

echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "🌱 Seeding database (safe to run multiple times)..."
npx prisma db seed

echo "🚀 Starting Next.js..."
exec node server.js
