#!/bin/sh
set -x

# Replace the statically built BUILT_NEXT_PUBLIC_WEBAPP_URL with run-time NEXT_PUBLIC_WEBAPP_URL
# NOTE: if these values are the same, this will be skipped.
scripts/replace-placeholder.sh "$BUILT_NEXT_PUBLIC_WEBAPP_URL" "$NEXT_PUBLIC_WEBAPP_URL"

DATABASE_HOST_TO_WAIT_FOR="${DATABASE_HOST}"

if [ -z "$DATABASE_HOST_TO_WAIT_FOR" ] && [ -n "$DATABASE_URL" ]; then
  DATABASE_HOST_TO_WAIT_FOR=$(node -e 'const url = new URL(process.env.DATABASE_URL); console.log(`${url.hostname}:${url.port || 5432}`)' 2>/dev/null || true)
fi

case "$DATABASE_HOST_TO_WAIT_FOR" in
  "" | *://* | *:*) ;;
  *) DATABASE_HOST_TO_WAIT_FOR="${DATABASE_HOST_TO_WAIT_FOR}:5432" ;;
esac

if [ -n "$DATABASE_HOST_TO_WAIT_FOR" ]; then
  scripts/wait-for-it.sh "$DATABASE_HOST_TO_WAIT_FOR" -- echo "database is up"
else
  echo "DATABASE_HOST and DATABASE_URL are not set, skipping database wait"
fi
npx prisma migrate deploy --schema /calcom/packages/prisma/schema.prisma
npx ts-node --transpile-only /calcom/scripts/seed-app-store.ts
yarn start
