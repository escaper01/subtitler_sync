-- DropForeignKey
ALTER TABLE "DeviceSignal" DROP CONSTRAINT "DeviceSignal_userId_fkey";

-- DropForeignKey
ALTER TABLE "Entitlement" DROP CONSTRAINT "Entitlement_userId_fkey";

-- DropForeignKey
ALTER TABLE "License" DROP CONSTRAINT "License_userId_fkey";

-- DropForeignKey
ALTER TABLE "LicenseActivation" DROP CONSTRAINT "LicenseActivation_licenseId_fkey";

-- DropForeignKey
ALTER TABLE "SearchLog" DROP CONSTRAINT "SearchLog_userId_fkey";

-- DropIndex
DROP INDEX "SearchLog_userId_createdAt_idx";

-- AlterTable
ALTER TABLE "SearchLog" DROP COLUMN "userId";

-- AlterTable
ALTER TABLE "SiteSetting" DROP COLUMN "defaultDeviceLimit",
DROP COLUMN "promptColor",
DROP COLUMN "promptEnabled",
DROP COLUMN "promptMessage",
DROP COLUMN "promptUrl",
DROP COLUMN "trialDays",
ADD COLUMN     "donateColor" TEXT NOT NULL DEFAULT '#38bdf8',
ADD COLUMN     "donateEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "donateHeading" TEXT NOT NULL DEFAULT 'Support the extension',
ADD COLUMN     "donateMessage" TEXT NOT NULL DEFAULT 'This is free and has no ads. If it saved you an evening, a coffee helps keep the server running.';

-- DropTable
DROP TABLE "DeviceSignal";

-- DropTable
DROP TABLE "Entitlement";

-- DropTable
DROP TABLE "License";

-- DropTable
DROP TABLE "LicenseActivation";

-- DropTable
DROP TABLE "Plan";

-- DropTable
DROP TABLE "TrialClaim";

-- DropTable
DROP TABLE "User";

-- DropEnum
DROP TYPE "EntitlementSource";

-- DropEnum
DROP TYPE "LicenseSource";

-- DropEnum
DROP TYPE "LicenseStatus";

-- DropEnum
DROP TYPE "PlanInterval";

-- DropEnum
DROP TYPE "UserStatus";

-- CreateTable
CREATE TABLE "DonationLink" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DonationLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DonationLink_visible_sortOrder_idx" ON "DonationLink"("visible", "sortOrder");

-- CreateIndex
CREATE INDEX "SearchLog_installId_createdAt_idx" ON "SearchLog"("installId", "createdAt");

