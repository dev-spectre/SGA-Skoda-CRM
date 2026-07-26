-- CreateTable
CREATE TABLE "Lead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "googleAccessToken" TEXT,
    "googleRefreshToken" TEXT,
    "googleTokenExpiry" DATETIME,
    "selectedSpreadsheetId" TEXT,
    "selectedSpreadsheetName" TEXT,
    "selectedSheetName" TEXT,
    "notificationInterval" INTEGER NOT NULL DEFAULT 5,
    "columnMapping" TEXT,
    "lastSyncAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_phone_name_sheetId_key" ON "Lead"("phone", "name", "sheetId");
