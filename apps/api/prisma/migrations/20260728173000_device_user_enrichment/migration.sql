-- CreateEnum
-- AlterTable EndUser
ALTER TABLE `EndUser` ADD COLUMN `remark` VARCHAR(512) NULL;

-- CreateEnum DeviceFaultStatus values applied via Prisma
-- AlterTable Device
ALTER TABLE `Device` ADD COLUMN `faultStatus` ENUM('normal', 'fault', 'unknown') NOT NULL DEFAULT 'unknown';
ALTER TABLE `Device` ADD COLUMN `faultInfo` VARCHAR(512) NULL;
ALTER TABLE `Device` ADD COLUMN `lat` VARCHAR(191) NULL;
ALTER TABLE `Device` ADD COLUMN `lon` VARCHAR(191) NULL;
ALTER TABLE `Device` ADD COLUMN `locationText` VARCHAR(128) NULL;
ALTER TABLE `Device` ADD COLUMN `signalStrength` VARCHAR(64) NULL;
CREATE INDEX `Device_faultStatus_idx` ON `Device`(`faultStatus`);
