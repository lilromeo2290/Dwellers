-- CreateTable
CREATE TABLE "discovery_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "categoryId" TEXT,
    "serviceId" TEXT,
    "regionId" TEXT,
    "districtId" TEXT,
    "townId" TEXT,
    "communityId" TEXT,
    "providerId" TEXT,
    "resultCount" INTEGER,
    "sort" TEXT,
    "page" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "discovery_events_eventType_createdAt_idx" ON "discovery_events"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "discovery_events_categoryId_idx" ON "discovery_events"("categoryId");

-- CreateIndex
CREATE INDEX "discovery_events_townId_idx" ON "discovery_events"("townId");

-- CreateIndex
CREATE INDEX "discovery_events_providerId_idx" ON "discovery_events"("providerId");
