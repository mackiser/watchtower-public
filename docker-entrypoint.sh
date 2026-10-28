#!/bin/sh
# Applies tracked Prisma migrations, then starts the API (which also serves the built frontend —
# see apps/api/src/app.ts).
#
# `prisma migrate deploy` only ever applies committed migrations (apps/api/prisma/migrations/) —
# it never drops columns/tables on schema drift the way the old `db push --accept-data-loss` did,
# so a schema change can't silently destroy data.
set -e
SCHEMA=apps/api/prisma/schema.prisma

# Normal path: fresh DB (creates everything from 0_init) or an already-migrated DB (no-op).
# One special case: a database first provisioned by the old `db push` has the full schema but no
# _prisma_migrations table, so deploy aborts with P3005 ("schema is not empty"). Detect ONLY that
# signal and baseline it — mark 0_init applied without re-running its SQL — then deploy again
# (now a no-op). This runs once per such database; every other failure aborts the boot.
# ponytail: P3005-gated baseline covers databases created before migrations were tracked; fresh
# DBs skip it entirely.
if ! OUT=$(npx prisma migrate deploy --schema="$SCHEMA" 2>&1); then
  echo "$OUT"
  if echo "$OUT" | grep -q "P3005"; then
    echo "Pre-existing untracked schema detected — baselining 0_init once."
    npx prisma migrate resolve --applied 0_init --schema="$SCHEMA"
    npx prisma migrate deploy --schema="$SCHEMA"
  else
    echo "migrate deploy failed (not a baseline case) — aborting startup." >&2
    exit 1
  fi
else
  echo "$OUT"
fi

# Demo mode only (DEMO_SEED=1, see docker-compose.demo.yml): seed the demo user and the fake
# sample clients on boot. The demo is read-only and its login is shown on the sign-in page. Both
# seeders are idempotent — seedAdmin no-ops if the email exists; seedDemo refuses (non-zero) once
# any client exists, which is expected on every boot after the first, hence the `||`.
if [ "$DEMO_SEED" = "1" ]; then
  node apps/api/dist/seedAdmin.js
  node apps/api/dist/seedDemo.js || echo "Demo sample data already present - skipping."
  echo "Demo mode: read-only. Sign in as $ADMIN_EMAIL (password shown on the login page)."
fi

exec node apps/api/dist/index.js
