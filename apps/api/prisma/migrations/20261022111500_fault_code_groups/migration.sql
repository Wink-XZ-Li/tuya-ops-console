-- CreateTable
CREATE TABLE `FaultCodeGroup` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FaultCodeGroupMember` (
    `groupId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(64) NOT NULL,

    PRIMARY KEY (`groupId`, `productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FaultCodeGroupCode` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `label` VARCHAR(64) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `symptom` VARCHAR(256) NULL,
    `cause` VARCHAR(256) NULL,
    `suggestedAction` VARCHAR(256) NULL,
    `countInQualityRate` BOOLEAN NOT NULL DEFAULT true,
    `notifyAftersales` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `FaultCodeGroupMember_productId_key` ON `FaultCodeGroupMember`(`productId`);

-- CreateIndex
CREATE UNIQUE INDEX `FaultCodeGroupCode_groupId_code_label_key` ON `FaultCodeGroupCode`(`groupId`, `code`, `label`);

-- AddForeignKey
ALTER TABLE `FaultCodeGroupMember` ADD CONSTRAINT `FaultCodeGroupMember_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `FaultCodeGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FaultCodeGroupCode` ADD CONSTRAINT `FaultCodeGroupCode_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `FaultCodeGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
