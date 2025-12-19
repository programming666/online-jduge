-- Add user management fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isBanned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bannedReason" TEXT;

-- Create BannedIP table
CREATE TABLE IF NOT EXISTS "BannedIP" (
    "id" SERIAL NOT NULL,
    "ip" TEXT NOT NULL,
    "userId" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "BannedIP_pkey" PRIMARY KEY ("id")
);

-- Create unique index on IP
CREATE UNIQUE INDEX IF NOT EXISTS "BannedIP_ip_key" ON "BannedIP"("ip");

-- Add foreign key
ALTER TABLE "BannedIP" ADD CONSTRAINT "BannedIP_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;