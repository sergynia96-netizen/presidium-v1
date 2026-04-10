#!/bin/sh
# Production migration script
# This script handles database schema migration for PostgreSQL

set -e

echo "=== PRESIDIUM Database Migration ==="

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

# Determine which schema to use based on DATABASE_URL
case "$DATABASE_URL" in
  postgresql*|postgres://*)
    echo "PostgreSQL detected, using schema.postgresql.prisma"
    SCHEMA_FLAG="--schema prisma/schema.postgresql.prisma"
    ;;
  file:*)
    echo "SQLite detected, using default schema.prisma"
    SCHEMA_FLAG=""
    ;;
  *)
    echo "ERROR: Unknown database type in DATABASE_URL"
    exit 1
    ;;
esac

# Run migrations
echo "Running Prisma migrations..."
npx prisma migrate deploy $SCHEMA_FLAG

echo "=== Migration Complete ==="
