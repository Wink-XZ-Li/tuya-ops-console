-- Phase C: indexes for dashboard / detail / retention, plus a monthly cold archive.
-- DeviceEvent stays the hot table (it has a foreign key; MySQL cannot partition that).
-- DeviceEventArchive has no foreign key so it can be RANGE-partitioned by month.

CREATE INDEX `Device_createdAt_idx` ON `Device`(`createdAt`);
CREATE INDEX `Device_productId_createdAt_idx` ON `Device`(`productId`, `createdAt`);
CREATE INDEX `Device_faultStatus_productId_idx` ON `Device`(`faultStatus`, `productId`);

CREATE INDEX `DeviceEvent_deviceId_bizCode_eventTime_idx` ON `DeviceEvent`(`deviceId`, `bizCode`, `eventTime`);

CREATE INDEX `Alert_category_openedAt_idx` ON `Alert`(`category`, `openedAt`);
CREATE INDEX `Alert_status_closedAt_idx` ON `Alert`(`status`, `closedAt`);
CREATE INDEX `Alert_openedAt_idx` ON `Alert`(`openedAt`);

CREATE INDEX `DailyDeviceMetric_productId_day_idx` ON `DailyDeviceMetric`(`productId`, `day`);
CREATE INDEX `DailyFaultStat_productId_day_idx` ON `DailyFaultStat`(`productId`, `day`);

CREATE TABLE `DeviceEventArchive` (
    `id` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NOT NULL,
    `bizCode` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `eventTime` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DeviceEventArchive_deviceId_eventTime_idx`(`deviceId`, `eventTime`),
    INDEX `DeviceEventArchive_deviceId_bizCode_eventTime_idx`(`deviceId`, `bizCode`, `eventTime`),
    INDEX `DeviceEventArchive_eventTime_idx`(`eventTime`),
    PRIMARY KEY (`id`, `eventTime`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(`eventTime`)) (
    PARTITION p202607 VALUES LESS THAN (TO_DAYS('2026-08-01')),
    PARTITION p202608 VALUES LESS THAN (TO_DAYS('2026-09-01')),
    PARTITION p202609 VALUES LESS THAN (TO_DAYS('2026-10-01')),
    PARTITION p202610 VALUES LESS THAN (TO_DAYS('2026-11-01')),
    PARTITION p202611 VALUES LESS THAN (TO_DAYS('2026-12-01')),
    PARTITION p202612 VALUES LESS THAN (TO_DAYS('2027-01-01')),
    PARTITION p202701 VALUES LESS THAN (TO_DAYS('2027-02-01')),
    PARTITION p202702 VALUES LESS THAN (TO_DAYS('2027-03-01')),
    PARTITION p202703 VALUES LESS THAN (TO_DAYS('2027-04-01')),
    PARTITION p202704 VALUES LESS THAN (TO_DAYS('2027-05-01')),
    PARTITION p202705 VALUES LESS THAN (TO_DAYS('2027-06-01')),
    PARTITION p202706 VALUES LESS THAN (TO_DAYS('2027-07-01')),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);
