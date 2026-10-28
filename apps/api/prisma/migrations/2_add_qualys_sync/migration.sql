-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "qualysLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "qualysSyncError" TEXT,
ADD COLUMN     "qualysTag" TEXT;
