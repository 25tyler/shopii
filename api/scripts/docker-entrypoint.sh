#!/bin/sh
set -e

echo "Shopii API - Docker Entrypoint"

# Run Prisma migrations if the migrations directory exists
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  echo "Running database migrations..."
  npx prisma migrate deploy --schema=prisma/schema.prisma
  echo "Migrations complete."
else
  echo "No migrations found — pushing schema directly..."
  npx prisma db push --schema=prisma/schema.prisma
  echo "Schema push complete."
fi

echo "Starting API server..."
exec "$@"
