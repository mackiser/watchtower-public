-- Hand-authored vulnerability titles and notes.
--
-- The Qualys subscription is not entitled to the KnowledgeBase API ("403: You are not allowed to
-- download the KnowledgeBase"), so QIDs arrive with counts but no name. These two columns let a
-- QID be named once and have that name apply to every client that has it.
--
-- "notes" is Watchtower's own and is never written by the KnowledgeBase fetch, so a hand-written
-- remediation note survives if the entitlement is ever granted. "fromQualys" records where the
-- rest of the row came from: refreshKbEntries() only skips a QID when it is true, so a
-- hand-titled row is still fetched for real later rather than being mistaken for a cache hit.
--
-- Existing rows default to false, which is correct — there are none, because the fetch has never
-- succeeded against this subscription.
ALTER TABLE "QualysKbEntry" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QualysKbEntry" ADD COLUMN "fromQualys" BOOLEAN NOT NULL DEFAULT false;
