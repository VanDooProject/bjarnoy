-- Add CreatedAt column to Players table
ALTER TABLE "Players" ADD COLUMN "CreatedAt" TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00';
-- Remove default after the column is added
ALTER TABLE "Players" ALTER COLUMN "CreatedAt" DROP DEFAULT;