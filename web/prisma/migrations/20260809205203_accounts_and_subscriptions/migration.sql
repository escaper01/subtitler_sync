-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BANNED');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('TRIAL', 'PATREON', 'CODE', 'ADMIN');

-- CreateEnum
CREATE TYPE "PendingGrantStatus" AS ENUM ('PENDING', 'CLAIMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SearchOutcome" AS ENUM ('OK', 'DENIED', 'UPSTREAM_ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "entitledUntil" TIMESTAMP(3),
    "entitlementSource" "EntitlementSource",
    "trialGrantedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "EntitlementSource" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ExtensionToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "maxRedemptions" INTEGER NOT NULL DEFAULT 1,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodeRedemption" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodeRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingGrant" (
    "id" TEXT NOT NULL,
    "source" "EntitlementSource" NOT NULL DEFAULT 'PATREON',
    "email" TEXT,
    "externalId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "status" "PendingGrantStatus" NOT NULL DEFAULT 'PENDING',
    "claimedByUserId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "codeId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatreonMember" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "tier" TEXT,
    "cents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastChargeDate" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatreonMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchLog" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "outcome" "SearchOutcome" NOT NULL,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "results" INTEGER NOT NULL DEFAULT 0,
    "ipHash" TEXT,
    "installId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "donationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "donationMessage" TEXT NOT NULL DEFAULT 'This extension is free. If it saved you an evening, consider chipping in.',
    "donationColor" TEXT NOT NULL DEFAULT '#38bdf8',
    "donationUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_entitledUntil_idx" ON "User"("entitledUntil");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_dedupeKey_key" ON "Entitlement"("dedupeKey");

-- CreateIndex
CREATE INDEX "Entitlement_userId_endsAt_idx" ON "Entitlement"("userId", "endsAt");

-- CreateIndex
CREATE INDEX "Entitlement_endsAt_idx" ON "Entitlement"("endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionToken_tokenHash_key" ON "ExtensionToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ExtensionToken_userId_createdAt_idx" ON "ExtensionToken"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExtensionToken_expiresAt_idx" ON "ExtensionToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCode_code_key" ON "SubscriptionCode"("code");

-- CreateIndex
CREATE INDEX "SubscriptionCode_createdAt_idx" ON "SubscriptionCode"("createdAt");

-- CreateIndex
CREATE INDEX "CodeRedemption_codeId_createdAt_idx" ON "CodeRedemption"("codeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CodeRedemption_codeId_userId_key" ON "CodeRedemption"("codeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingGrant_codeId_key" ON "PendingGrant"("codeId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingGrant_dedupeKey_key" ON "PendingGrant"("dedupeKey");

-- CreateIndex
CREATE INDEX "PendingGrant_email_idx" ON "PendingGrant"("email");

-- CreateIndex
CREATE INDEX "PendingGrant_status_createdAt_idx" ON "PendingGrant"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatreonMember_memberId_key" ON "PatreonMember"("memberId");

-- CreateIndex
CREATE INDEX "PatreonMember_active_lastEventAt_idx" ON "PatreonMember"("active", "lastEventAt");

-- CreateIndex
CREATE INDEX "PatreonMember_email_idx" ON "PatreonMember"("email");

-- CreateIndex
CREATE INDEX "SearchLog_userId_createdAt_idx" ON "SearchLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SearchLog_createdAt_idx" ON "SearchLog"("createdAt");

-- CreateIndex
CREATE INDEX "SearchLog_query_idx" ON "SearchLog"("query");

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionToken" ADD CONSTRAINT "ExtensionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRedemption" ADD CONSTRAINT "CodeRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "SubscriptionCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CodeRedemption" ADD CONSTRAINT "CodeRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingGrant" ADD CONSTRAINT "PendingGrant_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "SubscriptionCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchLog" ADD CONSTRAINT "SearchLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
