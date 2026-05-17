/*
  Warnings:

  - You are about to drop the column `db_name` on the `data_sources` table. All the data in the column will be lost.
  - You are about to drop the column `host` on the `data_sources` table. All the data in the column will be lost.
  - You are about to drop the column `port` on the `data_sources` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `data_sources` table. All the data in the column will be lost.
  - The `type` column on the `data_sources` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `data_sources` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `sql` on the `queries` table. All the data in the column will be lost.
  - You are about to drop the column `cron` on the `schedules` table. All the data in the column will be lost.
  - Added the required column `connection_details` to the `data_sources` table without a default value. This is not possible if the table is not empty.
  - Added the required column `data_source_id` to the `queries` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sql_text` to the `queries` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('POSTGRESQL', 'MYSQL', 'CSV', 'API');

-- CreateEnum
CREATE TYPE "DataSourceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutionTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'RETRY');

-- AlterTable
ALTER TABLE "data_sources" DROP COLUMN "db_name",
DROP COLUMN "host",
DROP COLUMN "port",
DROP COLUMN "username",
ADD COLUMN     "connection_details" JSONB NOT NULL,
ADD COLUMN     "last_tested" TIMESTAMP(3),
DROP COLUMN "type",
ADD COLUMN     "type" "DataSourceType" NOT NULL DEFAULT 'POSTGRESQL',
DROP COLUMN "status",
ADD COLUMN     "status" "DataSourceStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "file_retention_days" INTEGER NOT NULL DEFAULT 90;

-- AlterTable
ALTER TABLE "queries" DROP COLUMN "sql",
ADD COLUMN     "data_source_id" UUID NOT NULL,
ADD COLUMN     "parameters" JSONB,
ADD COLUMN     "sql_text" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "report_templates" ADD COLUMN     "columns_config" JSONB,
ADD COLUMN     "query_id" UUID,
ADD COLUMN     "template_file" TEXT;

-- AlterTable
ALTER TABLE "schedules" DROP COLUMN "cron",
ADD COLUMN     "cron_expr" TEXT NOT NULL DEFAULT '0 9 * * 1',
ADD COLUMN     "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "report_id" UUID,
ADD COLUMN     "retry_count" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "query_versions" (
    "id" UUID NOT NULL,
    "query_id" UUID NOT NULL,
    "sql_text" TEXT NOT NULL,
    "parameters" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_logs" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" "ExecutionTrigger" NOT NULL DEFAULT 'MANUAL',
    "duration" INTEGER,
    "output" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_files" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "schedule_id" UUID,
    "report_id" UUID,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_files_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_versions" ADD CONSTRAINT "query_versions_query_id_fkey" FOREIGN KEY ("query_id") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_files" ADD CONSTRAINT "generated_files_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
