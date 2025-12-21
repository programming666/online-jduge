-- CreateTable
CREATE TABLE "AccessHistory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "country" TEXT,
    "province" TEXT,
    "city" TEXT,
    "isp" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "device" TEXT,
    "userAgent" TEXT,
    "accessType" TEXT NOT NULL,
    "webrtcIP" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserIPAssociation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "UserIPAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessHistory_userId_idx" ON "AccessHistory"("userId");

-- CreateIndex
CREATE INDEX "AccessHistory_ip_idx" ON "AccessHistory"("ip");

-- CreateIndex
CREATE INDEX "AccessHistory_createdAt_idx" ON "AccessHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserIPAssociation_userId_ip_key" ON "UserIPAssociation"("userId", "ip");

-- CreateIndex
CREATE INDEX "UserIPAssociation_userId_idx" ON "UserIPAssociation"("userId");

-- CreateIndex
CREATE INDEX "UserIPAssociation_ip_idx" ON "UserIPAssociation"("ip");

-- CreateIndex for BannedIP table to support user lookup
CREATE INDEX IF NOT EXISTS "BannedIP_userId_idx" ON "BannedIP"("userId");

-- AddForeignKey
ALTER TABLE "AccessHistory" ADD CONSTRAINT "AccessHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIPAssociation" ADD CONSTRAINT "UserIPAssociation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
