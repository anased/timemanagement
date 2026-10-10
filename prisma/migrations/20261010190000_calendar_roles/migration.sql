-- CreateEnum
CREATE TYPE "CalendarRole" AS ENUM ('PLAN', 'SHOW', 'OFF');

-- AlterTable
ALTER TABLE "CalendarSelection" ADD COLUMN     "color" TEXT,
ADD COLUMN     "role" "CalendarRole" NOT NULL DEFAULT 'PLAN';

-- Keep existing choices: unticked calendars become OFF.
UPDATE "CalendarSelection" SET "role" = 'OFF' WHERE "enabled" = false;

-- AlterTable
ALTER TABLE "CalendarSelection" DROP COLUMN "enabled";
