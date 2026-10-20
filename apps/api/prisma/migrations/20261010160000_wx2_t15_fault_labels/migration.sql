-- T6-WX2 temporarily uses the T15 fault bitmap. fault=32 → bit5 → E5.
INSERT INTO `FaultCodeDefinition`
    (`id`, `productId`, `code`, `label`, `sortOrder`, `symptom`, `suggestedAction`, `countInQualityRate`, `notifyAftersales`, `createdAt`, `updatedAt`)
VALUES
    ('fcd_wx2_e0', '90wi2aimyqstn9qc', 'fault', 'E0', 0, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_e1', '90wi2aimyqstn9qc', 'fault', 'E1', 1, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_e2', '90wi2aimyqstn9qc', 'fault', 'E2', 2, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_e3', '90wi2aimyqstn9qc', 'fault', 'E3', 3, '上报故障码 E3。占位，待产品确认', '核对当前状态后联系售后。占位，待产品确认', true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_e4', '90wi2aimyqstn9qc', 'fault', 'E4', 4, '上报故障码 E4。占位，待产品确认', '记录出现时间，确认是否反复。占位，待产品确认', true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_e5', '90wi2aimyqstn9qc', 'fault', 'E5', 5, '上报故障码 E5。占位，待产品确认', '先看设备是否仍在报该码。占位，待产品确认', true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_e6', '90wi2aimyqstn9qc', 'fault', 'E6', 6, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_e7', '90wi2aimyqstn9qc', 'fault', 'E7', 7, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_e8', '90wi2aimyqstn9qc', 'fault', 'E8', 8, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_e9', '90wi2aimyqstn9qc', 'fault', 'E9', 9, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_ea', '90wi2aimyqstn9qc', 'fault', 'EA', 10, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_eb', '90wi2aimyqstn9qc', 'fault', 'Eb', 11, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_ef', '90wi2aimyqstn9qc', 'fault', 'EF', 12, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_el', '90wi2aimyqstn9qc', 'fault', 'EL', 13, NULL, NULL, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
    `sortOrder` = VALUES(`sortOrder`),
    `symptom` = VALUES(`symptom`),
    `suggestedAction` = VALUES(`suggestedAction`);

DELETE FROM `FaultCodeDefinition`
WHERE `productId` = '90wi2aimyqstn9qc' AND `label` LIKE 'bit%';
