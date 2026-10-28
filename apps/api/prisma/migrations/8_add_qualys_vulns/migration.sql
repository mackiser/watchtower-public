-- Top vulnerabilities per client.
--
-- "QualysVuln" is per-client current state, replaced wholesale on every sync exactly like
-- "IspmControl" — no date column, because history is out of scope and a date column would invite
-- someone to start appending. The composite primary key (clientId, qid) is the real grain, so the
-- per-sync delete+insert is idempotent without a surrogate id.
--
-- "QualysKbEntry" is keyed by QID alone and shared across every client on purpose: a QID's
-- write-up is identical for all of them, and the same Windows/Chrome QIDs recur across most of the
-- 43, so caching per-QID dedupes the KnowledgeBase fetch ~43 ways.
--
-- There is deliberately NO foreign key from QualysVuln.qid to QualysKbEntry.qid. A QID is counted
-- the moment a scan sees it, which is before its KB entry has been fetched — an FK would reject
-- that write, and a KB outage would take the counts down with it. The join is done in application
-- code and a missing entry renders as a bare QID.

-- CreateTable
CREATE TABLE "QualysVuln" (
    "clientId" TEXT NOT NULL,
    "qid" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "assetCount" INTEGER NOT NULL,
    "detectionCount" INTEGER NOT NULL,

    CONSTRAINT "QualysVuln_pkey" PRIMARY KEY ("clientId","qid")
);

-- CreateTable
CREATE TABLE "QualysKbEntry" (
    "qid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "patchable" BOOLEAN NOT NULL,
    "cves" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "consequence" TEXT NOT NULL,
    "solution" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualysKbEntry_pkey" PRIMARY KEY ("qid")
);

-- CreateIndex
CREATE INDEX "QualysVuln_clientId_assetCount_idx" ON "QualysVuln"("clientId", "assetCount");

-- AddForeignKey
ALTER TABLE "QualysVuln" ADD CONSTRAINT "QualysVuln_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
