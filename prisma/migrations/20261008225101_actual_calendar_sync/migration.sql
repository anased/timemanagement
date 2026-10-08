-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "googleEventId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "actualCalendarId" TEXT,
ADD COLUMN     "syncToCalendar" BOOLEAN NOT NULL DEFAULT true;
