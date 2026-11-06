-- DropForeignKey
ALTER TABLE "project" DROP CONSTRAINT "project_owner_id_fkey";

-- AlterTable
ALTER TABLE "project" ALTER COLUMN "owner_id" SET DATA TYPE TEXT;
