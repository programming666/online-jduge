CREATE TABLE IF NOT EXISTS "AccessHistoryArchive" (
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
    "statusCode" INTEGER,
    "requestPath" TEXT,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessHistoryArchive_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AccessHistory"
    ADD COLUMN IF NOT EXISTS "statusCode" INTEGER,
    ADD COLUMN IF NOT EXISTS "requestPath" TEXT,
    ADD COLUMN IF NOT EXISTS "isSensitive" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "AccessHistory_statusCode_idx" ON "AccessHistory"("statusCode");
CREATE INDEX IF NOT EXISTS "AccessHistory_requestPath_idx" ON "AccessHistory"("requestPath");
CREATE INDEX IF NOT EXISTS "AccessHistory_isSensitive_idx" ON "AccessHistory"("isSensitive");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'IPMarkType') THEN
        CREATE TYPE "IPMarkType" AS ENUM ('MALICIOUS', 'SUSPICIOUS', 'WHITELIST');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS "IPMark" (
    "ipAddress" TEXT NOT NULL,
    "markType" "IPMarkType" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireAt" TIMESTAMP(3),
    "operator" TEXT,
    CONSTRAINT "IPMark_pkey" PRIMARY KEY ("ipAddress")
);

CREATE INDEX IF NOT EXISTS "IPMark_markType_idx" ON "IPMark"("markType");
CREATE INDEX IF NOT EXISTS "IPMark_expireAt_idx" ON "IPMark"("expireAt");

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" SERIAL NOT NULL,
    "operatorId" INTEGER,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_operatorId_idx" ON "AuditLog"("operatorId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

