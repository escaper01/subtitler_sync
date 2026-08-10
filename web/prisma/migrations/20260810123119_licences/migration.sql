-- Licence keys replace accounts-plus-tokens.
--
-- Hand-ordered. The generated order altered "EntitlementSource" before dropping
-- "PendingGrant", whose `source` column still referenced the old type — so the final
-- DROP TYPE failed with "other objects depend on it". Tables that are going away are
-- therefore dropped first, and only then is the enum rebuilt.

-- CreateEnum
CREATE TYPE "LicenseSource" AS ENUM ('LEMON', 'TRIAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "PlanInterval" AS ENUM ('TRIAL', 'MONTH', 'YEAR');

-- DropForeignKey
ALTER TABLE "CodeRedemption" DROP CONSTRAINT "CodeRedemption_codeId_fkey";

-- DropForeignKey
ALTER TABLE "CodeRedemption" DROP CONSTRAINT "CodeRedemption_userId_fkey";

-- DropForeignKey
ALTER TABLE "ExtensionToken" DROP CONSTRAINT "ExtensionToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "PendingGrant" DROP CONSTRAINT "PendingGrant_codeId_fkey";

-- DropTable
DROP TABLE "CodeRedemption";

-- DropTable
DROP TABLE "ExtensionToken";

-- DropTable
DROP TABLE "PatreonMember";

-- DropTable
DROP TABLE "PendingGrant";

-- DropTable
DROP TABLE "SubscriptionCode";

-- AlterEnum
BEGIN;
CREATE TYPE "EntitlementSource_new" AS ENUM ('TRIAL', 'LEMON', 'ADMIN');
-- (Prisma emitted a DROP DEFAULT on PendingGrant.source here; that table has already
--  been dropped above, so the statement would fail.)
ALTER TABLE "User" ALTER COLUMN "entitlementSource" TYPE "EntitlementSource_new" USING ("entitlementSource"::text::"EntitlementSource_new");
ALTER TABLE "Entitlement" ALTER COLUMN "source" TYPE "EntitlementSource_new" USING ("source"::text::"EntitlementSource_new");
ALTER TYPE "EntitlementSource" RENAME TO "EntitlementSource_old";
ALTER TYPE "EntitlementSource_new" RENAME TO "EntitlementSource";
DROP TYPE "public"."EntitlementSource_old";
COMMIT;

-- AlterTable
ALTER TABLE "SiteSetting" DROP COLUMN "donationColor",
DROP COLUMN "donationEnabled",
DROP COLUMN "donationMessage",
DROP COLUMN "donationUrl",
ADD COLUMN     "defaultDeviceLimit" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "promptColor" TEXT NOT NULL DEFAULT '#38bdf8',
ADD COLUMN     "promptEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promptMessage" TEXT NOT NULL DEFAULT 'Subtitle search keeps a server running. A subscription is what pays for it.',
ADD COLUMN     "promptUrl" TEXT,
ADD COLUMN     "searchPerDay" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "searchPerHour" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "trialDays" INTEGER NOT NULL DEFAULT 7;

-- DropEnum
DROP TYPE "PendingGrantStatus";

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "source" "LicenseSource" NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT NOT NULL,
    "externalId" TEXT,
    "subscriptionId" TEXT,
    "activationLimit" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseActivation" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" "PlanInterval" NOT NULL,
    "days" INTEGER NOT NULL,
    "checkoutUrl" TEXT,
    "blurb" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "License_keyHash_key" ON "License"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "License_externalId_key" ON "License"("externalId");

-- CreateIndex
CREATE INDEX "License_userId_idx" ON "License"("userId");

-- CreateIndex
CREATE INDEX "License_subscriptionId_idx" ON "License"("subscriptionId");

-- CreateIndex
CREATE INDEX "LicenseActivation_licenseId_idx" ON "LicenseActivation"("licenseId");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseActivation_licenseId_installId_key" ON "LicenseActivation"("licenseId", "installId");

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseActivation" ADD CONSTRAINT "LicenseActivation_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
