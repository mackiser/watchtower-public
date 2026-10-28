# Database backups

Watchtower keeps all state in one Postgres database, so a backup is one `pg_dump`.

## Taking a backup

Against the Docker Compose stack:

```bash
docker compose exec -T db pg_dump -U watchtower -Fc watchtower > watchtower-$(date +%Y%m%d).dump
```

`-Fc` is Postgres' custom format: compressed and restorable table-by-table. Run it from cron (or
any scheduler) and prune old dumps to taste. Skip it for local dev and for the demo stack, whose
fake data `seedDemo` recreates from scratch.

## Restoring

```bash
docker compose exec -T db pg_restore -U watchtower --clean --if-exists -d watchtower < watchtower-YYYYMMDD.dump
docker compose restart app
```

To inspect a dump without restoring it: `pg_restore --list <file>`. To rehearse a restore, restore
into a scratch database first (`createdb scratch && pg_restore -d scratch <file>`).

## Things to remember

- Keep dumps off the machine that runs the database. A backup on the same disk isn't one.
- Rotating `MFA_ENCRYPTION_KEY` makes the TOTP secrets in older dumps undecryptable. Keep the key
  that matches a dump for as long as you keep the dump.
