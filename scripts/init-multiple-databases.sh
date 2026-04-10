#!/bin/bash
# Create multiple databases for Presidium
# This script is executed by PostgreSQL initdb

set -e

# Create databases from POSTGRES_MULTIPLE_DATABASES env var
if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
  IFS=',' read -ra DATABASES <<< "$POSTGRES_MULTIPLE_DATABASES"
  for db in "${DATABASES[@]}"; do
    echo "Creating database: $db"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
      SELECT 'CREATE DATABASE "$db"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
EOSQL
  done
fi

# Create relay user if it doesn't exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  DO
  \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'relay') THEN
      CREATE ROLE relay WITH LOGIN PASSWORD '${RELAY_DB_PASSWORD:-changeme}';
    END IF;
  END
  \$\$;
EOSQL

# Grant permissions
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  GRANT ALL PRIVILEGES ON DATABASE relay TO relay;
  \\c relay
  GRANT ALL ON SCHEMA public TO relay;
EOSQL

echo "Multiple database creation complete!"
