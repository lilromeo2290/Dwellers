-- AlterTable
ALTER TABLE "job_requests" ADD COLUMN "clientToken" TEXT;
ALTER TABLE "job_requests" ADD COLUMN "respondedAt" DATETIME;
ALTER TABLE "job_requests" ADD COLUMN "responseKind" TEXT;
ALTER TABLE "job_requests" ADD COLUMN "urgency" TEXT;
ALTER TABLE "job_requests" ADD COLUMN "viewedAt" DATETIME;

-- CreateTable
CREATE TABLE "job_request_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobRequestId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_request_events_jobRequestId_fkey" FOREIGN KEY ("jobRequestId") REFERENCES "job_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_job_request_attachments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobRequestId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "kind" TEXT NOT NULL DEFAULT 'PHOTO',
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_request_attachments_jobRequestId_fkey" FOREIGN KEY ("jobRequestId") REFERENCES "job_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_job_request_attachments" ("createdAt", "id", "jobRequestId", "kind", "mimeType", "originalName", "sizeBytes", "storageKey") SELECT "createdAt", "id", "jobRequestId", "kind", "mimeType", "originalName", "sizeBytes", "storageKey" FROM "job_request_attachments";
DROP TABLE "job_request_attachments";
ALTER TABLE "new_job_request_attachments" RENAME TO "job_request_attachments";
CREATE INDEX "job_request_attachments_jobRequestId_idx" ON "job_request_attachments"("jobRequestId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "job_request_events_jobRequestId_createdAt_idx" ON "job_request_events"("jobRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "job_requests_providerId_status_idx" ON "job_requests"("providerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_requests_clientToken_key" ON "job_requests"("clientToken");

