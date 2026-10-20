-- Alert accounting fields. activeKey is NULL when closed (multiple NULLs allowed).
ALTER TABLE `Alert`
    ADD COLUMN `category` VARCHAR(32) NULL,
    ADD COLUMN `faultCode` VARCHAR(64) NULL,
    ADD COLUMN `fingerprint` VARCHAR(191) NULL,
    ADD COLUMN `activeKey` VARCHAR(191) NULL,
    ADD COLUMN `conditionStartedAt` DATETIME(3) NULL,
    ADD COLUMN `occurrenceCount` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `lastSeenAt` DATETIME(3) NULL,
    ADD COLUMN `closedReason` VARCHAR(32) NULL;

-- Keep the earliest open offline alert per device; close the rest before assigning activeKey.
UPDATE `Alert` AS a
INNER JOIN (
    SELECT `id`,
           ROW_NUMBER() OVER (PARTITION BY `deviceId` ORDER BY `openedAt` ASC, `id` ASC) AS rn
    FROM `Alert`
    WHERE `status` <> 'closed' AND `source` = 'local_offline'
) AS ranked ON ranked.`id` = a.`id`
SET a.`status` = 'closed',
    a.`closedAt` = CURRENT_TIMESTAMP(3),
    a.`closedReason` = 'migration_dedupe',
    a.`activeKey` = NULL
WHERE ranked.rn > 1;

UPDATE `Alert`
SET `category` = 'connectivity',
    `faultCode` = 'offline',
    `fingerprint` = CONCAT(`deviceId`, ':connectivity:offline'),
    `activeKey` = CONCAT(`deviceId`, ':connectivity:offline'),
    `conditionStartedAt` = `openedAt`,
    `lastSeenAt` = COALESCE(`lastSeenAt`, `openedAt`)
WHERE `status` <> 'closed' AND `source` = 'local_offline';

CREATE UNIQUE INDEX `Alert_activeKey_key` ON `Alert`(`activeKey`);
CREATE INDEX `Alert_deviceId_faultCode_status_idx` ON `Alert`(`deviceId`, `faultCode`, `status`);
CREATE INDEX `Alert_category_status_idx` ON `Alert`(`category`, `status`);

-- Legacy source=device rows are merged by prisma/backfill-fault-alerts.ts
-- (bitmap labels cannot be decoded in SQL). Do not invent fault codes here.

CREATE TABLE `FaultCodeDefinition` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(64) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `label` VARCHAR(64) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `symptom` VARCHAR(256) NULL,
    `cause` VARCHAR(256) NULL,
    `suggestedAction` VARCHAR(256) NULL,
    `countInQualityRate` BOOLEAN NOT NULL DEFAULT true,
    `notifyAftersales` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FaultCodeDefinition_productId_code_label_key`(`productId`, `code`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `FaultCodeDefinition`
    (`id`, `productId`, `code`, `label`, `sortOrder`, `countInQualityRate`, `notifyAftersales`, `createdAt`, `updatedAt`)
VALUES
    ('fcd_ac_0', 'uhmj5b0ba31zpme6', 'fault', 'E1', 0, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_ac_1', 'uhmj5b0ba31zpme6', 'fault', 'E2', 1, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_ac_2', 'uhmj5b0ba31zpme6', 'fault', 'E3', 2, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_ac_3', 'uhmj5b0ba31zpme6', 'fault', 'E4', 3, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wh_0', 'nohrp3vbmef7vxvx', 'fault', 'E1', 0, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wh_1', 'nohrp3vbmef7vxvx', 'fault', 'E3', 1, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wh_2', 'nohrp3vbmef7vxvx', 'fault', 'E4', 2, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wh_3', 'nohrp3vbmef7vxvx', 'fault', 'E2', 3, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_0', '7sylzgrdnnq2w5mo', 'fault', 'E0', 0, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_1', '7sylzgrdnnq2w5mo', 'fault', 'E1', 1, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_2', '7sylzgrdnnq2w5mo', 'fault', 'E2', 2, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_3', '7sylzgrdnnq2w5mo', 'fault', 'E3', 3, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_4', '7sylzgrdnnq2w5mo', 'fault', 'E4', 4, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_5', '7sylzgrdnnq2w5mo', 'fault', 'E5', 5, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_6', '7sylzgrdnnq2w5mo', 'fault', 'E6', 6, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_7', '7sylzgrdnnq2w5mo', 'fault', 'E7', 7, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_8', '7sylzgrdnnq2w5mo', 'fault', 'E8', 8, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_9', '7sylzgrdnnq2w5mo', 'fault', 'E9', 9, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_10', '7sylzgrdnnq2w5mo', 'fault', 'EA', 10, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_11', '7sylzgrdnnq2w5mo', 'fault', 'Eb', 11, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_12', '7sylzgrdnnq2w5mo', 'fault', 'EF', 12, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_bl_13', '7sylzgrdnnq2w5mo', 'fault', 'EL', 13, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
