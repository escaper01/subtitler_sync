-- AlterEnum
ALTER TYPE "PlanInterval" ADD VALUE 'SIX_MONTH';

-- CreateTable
CREATE TABLE "DeviceSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "timezone" TEXT,
    "screen" TEXT,
    "platform" TEXT,
    "languages" TEXT,
    "ipHash" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceSignal_visitorHash_idx" ON "DeviceSignal"("visitorHash");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceSignal_userId_visitorHash_key" ON "DeviceSignal"("userId", "visitorHash");

-- AddForeignKey
ALTER TABLE "DeviceSignal" ADD CONSTRAINT "DeviceSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
