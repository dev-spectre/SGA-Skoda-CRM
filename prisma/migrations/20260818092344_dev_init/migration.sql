-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "assignedConsultant" TEXT,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'System',
ADD COLUMN     "testDrive" TEXT,
ADD COLUMN     "uploadedAt" TIMESTAMP(3),
ADD COLUMN     "uploadedById" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowExternalUpload" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "assignedPlatform" TEXT;

-- CreateIndex
CREATE INDEX "Lead_updatedAt_idx" ON "Lead"("updatedAt");

-- CreateIndex
CREATE INDEX "Lead_branch_idx" ON "Lead"("branch");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
