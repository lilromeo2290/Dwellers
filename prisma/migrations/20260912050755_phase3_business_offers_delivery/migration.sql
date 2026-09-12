-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_businesses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "description" TEXT,
    "logoKey" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "locationId" TEXT,
    "registrationNumber" TEXT,
    "taxId" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "offersDelivery" BOOLEAN NOT NULL DEFAULT false,
    "isSeedData" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "businesses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "businesses_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "towns" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_businesses" ("businessType", "createdAt", "deletedAt", "description", "email", "id", "isSeedData", "locationId", "logoKey", "name", "ownerId", "phone", "registrationNumber", "slug", "status", "taxId", "updatedAt", "verificationStatus") SELECT "businessType", "createdAt", "deletedAt", "description", "email", "id", "isSeedData", "locationId", "logoKey", "name", "ownerId", "phone", "registrationNumber", "slug", "status", "taxId", "updatedAt", "verificationStatus" FROM "businesses";
DROP TABLE "businesses";
ALTER TABLE "new_businesses" RENAME TO "businesses";
CREATE UNIQUE INDEX "businesses_slug_key" ON "businesses"("slug");
CREATE INDEX "businesses_ownerId_idx" ON "businesses"("ownerId");
CREATE INDEX "businesses_businessType_idx" ON "businesses"("businessType");
CREATE INDEX "businesses_status_idx" ON "businesses"("status");
CREATE INDEX "businesses_locationId_idx" ON "businesses"("locationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
