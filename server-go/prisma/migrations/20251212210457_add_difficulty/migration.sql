-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('LEVEL1', 'LEVEL2', 'LEVEL3', 'LEVEL4', 'LEVEL5', 'LEVEL6', 'LEVEL7');

-- CreateEnum
CREATE TYPE "ContestRule" AS ENUM ('OI', 'IOI', 'ACM');

-- AlterTable
ALTER TABLE "Problem" 
  ADD COLUMN "difficulty" "Difficulty" NOT NULL DEFAULT 'LEVEL2',
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Submission" 
  ADD COLUMN "score" INTEGER DEFAULT 0,
  ADD COLUMN "testCaseResults" JSONB;

-- CreateTable
CREATE TABLE "Setting" (
  "key"   TEXT PRIMARY KEY,
  "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Contest" (
  "id"          SERIAL PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "startTime"   TIMESTAMP(3) NOT NULL,
  "endTime"     TIMESTAMP(3) NOT NULL,
  "rule"        "ContestRule" NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "ContestProblem" (
  "id"        SERIAL PRIMARY KEY,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "contestId" INTEGER NOT NULL,
  "problemId" INTEGER NOT NULL
);

-- AddForeignKey
ALTER TABLE "ContestProblem" 
  ADD CONSTRAINT "ContestProblem_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestProblem" 
  ADD CONSTRAINT "ContestProblem_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
