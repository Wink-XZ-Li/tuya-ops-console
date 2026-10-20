-- Westinghouse T6-WX2 fault bitmap. Labels are bit placeholders until product confirms names.
-- bit i → labels[i]; fault=32 is bit5. Do not copy Electrolux E0–EL onto this PID.
INSERT INTO `FaultCodeDefinition`
    (`id`, `productId`, `code`, `label`, `sortOrder`, `countInQualityRate`, `notifyAftersales`, `createdAt`, `updatedAt`)
VALUES
    ('fcd_wx2_0', '90wi2aimyqstn9qc', 'fault', 'bit0', 0, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_1', '90wi2aimyqstn9qc', 'fault', 'bit1', 1, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_2', '90wi2aimyqstn9qc', 'fault', 'bit2', 2, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_3', '90wi2aimyqstn9qc', 'fault', 'bit3', 3, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_4', '90wi2aimyqstn9qc', 'fault', 'bit4', 4, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('fcd_wx2_5', '90wi2aimyqstn9qc', 'fault', 'bit5', 5, true, false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- Drop empty unknown rollup rows left by alerts that had no fault code.
DELETE FROM `DailyFaultStat`
WHERE `faultCode` = 'unknown' AND `newCount` = 0 AND `openCount` = 0;
