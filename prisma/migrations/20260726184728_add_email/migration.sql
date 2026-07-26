-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "zipCode" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT '',
    "remark" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "sheetRow" INTEGER,
    "sheetId" TEXT,
    "notifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Lead" ("city", "createdAt", "id", "name", "notifiedAt", "phone", "platform", "remark", "sheetId", "sheetRow", "status", "updatedAt", "zipCode") SELECT "city", "createdAt", "id", "name", "notifiedAt", "phone", "platform", "remark", "sheetId", "sheetRow", "status", "updatedAt", "zipCode" FROM "Lead";
DROP TABLE "Lead";
ALTER TABLE "new_Lead" RENAME TO "Lead";
CREATE UNIQUE INDEX "Lead_phone_name_sheetId_key" ON "Lead"("phone", "name", "sheetId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
