-- Per-client posture goals, set on the client page by an admin.
-- Deliberately nullable with no default: NULL means "use DEFAULT_CLIENT_GOALS" rather than a
-- stored copy of it, so every existing client keeps scoring on 10 / 75% and would follow the
-- shared default if it ever moved. Backfilling literals here would silently pin every client.
ALTER TABLE "Client" ADD COLUMN "vulnTargetPerAsset" DOUBLE PRECISION;
ALTER TABLE "Client" ADD COLUMN "ispmTargetPct" DOUBLE PRECISION;
