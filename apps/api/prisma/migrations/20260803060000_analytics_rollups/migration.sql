-- CreateTable
CREATE TABLE `DailyDeviceMetric` (
    `id` VARCHAR(191) NOT NULL,
    `day` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL DEFAULT '',
    `onlineCount` INTEGER NOT NULL DEFAULT 0,
    `offlineCount` INTEGER NOT NULL DEFAULT 0,
    `faultCount` INTEGER NOT NULL DEFAULT 0,
    `totalDevices` INTEGER NOT NULL DEFAULT 0,
    `modeCounts` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DailyDeviceMetric_day_idx`(`day`),
    UNIQUE INDEX `DailyDeviceMetric_day_productId_key`(`day`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyFaultStat` (
    `id` VARCHAR(191) NOT NULL,
    `day` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL DEFAULT '',
    `faultCode` VARCHAR(191) NOT NULL,
    `openCount` INTEGER NOT NULL DEFAULT 0,
    `newCount` INTEGER NOT NULL DEFAULT 0,
    `closedCount` INTEGER NOT NULL DEFAULT 0,
    `mttrMinutesAvg` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DailyFaultStat_day_idx`(`day`),
    INDEX `DailyFaultStat_faultCode_idx`(`faultCode`),
    UNIQUE INDEX `DailyFaultStat_day_productId_faultCode_key`(`day`, `productId`, `faultCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OpsReport` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `template` ENUM('week', 'month', 'custom') NOT NULL,
    `startDay` VARCHAR(191) NOT NULL,
    `endDay` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `sections` JSON NOT NULL,
    `status` ENUM('pending', 'ready', 'failed') NOT NULL DEFAULT 'pending',
    `resultJson` JSON NULL,
    `csvText` LONGTEXT NULL,
    `error` VARCHAR(1024) NULL,
    `createdByAdminUserId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    INDEX `OpsReport_createdAt_idx`(`createdAt`),
    INDEX `OpsReport_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OpsReport` ADD CONSTRAINT `OpsReport_createdByAdminUserId_fkey` FOREIGN KEY (`createdByAdminUserId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
