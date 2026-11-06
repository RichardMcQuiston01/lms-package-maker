#!/bin/sh
# Applies database migrations, then starts the app (or whatever command was given).
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set. Point it at a PostgreSQL database, for example postgresql://user:password@host:5432/lms_package_maker" >&2
  exit 1
fi

if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  echo "Applying database migrations..."
  if ! node /opt/prisma/node_modules/prisma/build/index.js migrate deploy \
      --schema /app/apps/web/prisma/schema.prisma; then
    echo "Database migrations failed; check that DATABASE_URL is reachable and the database exists." >&2
    exit 1
  fi
fi

exec "$@"
