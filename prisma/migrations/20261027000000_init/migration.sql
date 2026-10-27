-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "Tone" AS ENUM ('FORMAL', 'FRIENDLY', 'SHORT');

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL,
    "requesterName" VARCHAR(100) NOT NULL,
    "category" TEXT NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "tone" "Tone" NOT NULL DEFAULT 'FORMAL',
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "draftReply" VARCHAR(5000) NOT NULL DEFAULT '',
    "draftSourceLabel" TEXT,
    "draftBasisHash" CHAR(64),
    "draftNeedsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTemplate" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "exampleIssue" TEXT NOT NULL,
    "templateReply" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SupportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportRequest_updatedAt_idx" ON "SupportRequest"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTemplate_category_exampleIssue_key" ON "SupportTemplate"("category", "exampleIssue");
