#!/bin/sh
# Applies database migrations, then starts the app (or whatever command was given).
set -eu

# DATABASE_URL wins when set. Otherwise it is built from DATABASE_HOST, _PORT,
# _USER, _PASSWORD and _NAME, with the user and password URL-encoded.
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -z "${DATABASE_HOST:-}" ] || [ -z "${DATABASE_USER:-}" ] || [ -z "${DATABASE_NAME:-}" ]; then
    echo "Set DATABASE_URL (for example postgresql://user:password@host:5432/lms_package_maker), or DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD and DATABASE_NAME." >&2
    exit 1
  fi
  if ! DATABASE_URL="$(node -e '
    const e = process.env;
    const url = new URL("postgresql://" + e.DATABASE_HOST + ":" + (e.DATABASE_PORT || "5432") + "/" + encodeURIComponent(e.DATABASE_NAME));
    url.username = e.DATABASE_USER;
    url.password = e.DATABASE_PASSWORD || "";
    process.stdout.write(url.toString());
  ')"; then
    echo "Could not build DATABASE_URL from DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD and DATABASE_NAME; check their values." >&2
    exit 1
  fi
  export DATABASE_URL
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
