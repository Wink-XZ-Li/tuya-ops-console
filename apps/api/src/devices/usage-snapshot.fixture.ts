/**
 * Extracted from the 2026-11-10T10:24+08 evidence zip, not live production.
 * Files: 6cacc0e565a69e000flgna-24h-events.json (2090 events),
 *        6cd64f1804551a53b01wkg-24h-events.json (1992 events).
 * Method: every event.properties[] row whose code is gas_consumption,
 * runtime, or water_consumption. `t` is that row's time field (epoch ms),
 * `raw` is the integer stored on the DP. Rows were sorted by t.
 * Counts equal the source files, so identical consecutive values were not collapsed.
 * Both files start at 2026-11-09T10:24:00+08:00 and contain no earlier event.
 * A raw 0 here is a stored reading inside the file, not an assumed pre-window baseline.
 * Device 6c8be136 has no events JSON in the zip; do not add a baseline for it from this file.
 */
export type SnapshotPoint = { t: number; raw: number };
export const SNAPSHOT_FROM = '2026-11-09T10:24:00+08:00';
export const SNAPSHOT_TO = '2026-11-10T10:24:00+08:00';
export const DEVICE_6cacc0e565a69e000flgna = {
  deviceId: '6cacc0e565a69e000flgna',
  from: '2026-11-09T10:24:00+08:00',
  to: '2026-11-10T10:24:00+08:00',
  gas: [{ t: 1794196825444, raw: 2 }, { t: 1794196826447, raw: 0 }, { t: 1794227393176, raw: 1 }, { t: 1794227394156, raw: 0 }, { t: 1794241823093, raw: 1 }, { t: 1794241824089, raw: 0 }, { t: 1794266992131, raw: 1 }, { t: 1794266993133, raw: 0 }, { t: 1794275991935, raw: 1 }, { t: 1794275992937, raw: 0 }] as SnapshotPoint[],
  runtime: [{ t: 1794196825452, raw: 6 }, { t: 1794196826467, raw: 0 }, { t: 1794241823099, raw: 3 }, { t: 1794241824095, raw: 0 }, { t: 1794266992138, raw: 1 }, { t: 1794266993140, raw: 0 }] as SnapshotPoint[],
  water: [{ t: 1794194994347, raw: 90 }, { t: 1794194995363, raw: 0 }, { t: 1794195045734, raw: 2 }, { t: 1794195047834, raw: 0 }, { t: 1794195048837, raw: 2 }, { t: 1794195050850, raw: 4 }, { t: 1794195051895, raw: 2 }, { t: 1794196825447, raw: 1158 }, { t: 1794196826451, raw: 0 }, { t: 1794200394080, raw: 84 }, { t: 1794200395082, raw: 0 }, { t: 1794203993613, raw: 8 }, { t: 1794203994657, raw: 0 }, { t: 1794220248556, raw: 2 }, { t: 1794220250610, raw: 0 }, { t: 1794220251665, raw: 2 }, { t: 1794220258835, raw: 0 }, { t: 1794223793239, raw: 34 }, { t: 1794223794239, raw: 0 }, { t: 1794227393185, raw: 30 }, { t: 1794227394160, raw: 0 }, { t: 1794229193564, raw: 190 }, { t: 1794229194568, raw: 0 }, { t: 1794230993095, raw: 62 }, { t: 1794231025175, raw: 0 }, { t: 1794232792713, raw: 80 }, { t: 1794232793717, raw: 0 }, { t: 1794241823096, raw: 502 }, { t: 1794241824092, raw: 0 }, { t: 1794266992134, raw: 182 }, { t: 1794266993136, raw: 0 }, { t: 1794268792079, raw: 34 }, { t: 1794268793085, raw: 0 }, { t: 1794270591989, raw: 128 }, { t: 1794270592991, raw: 0 }, { t: 1794274191960, raw: 164 }, { t: 1794274192963, raw: 0 }, { t: 1794275991938, raw: 24 }, { t: 1794275992940, raw: 0 }, { t: 1794276072571, raw: 2 }, { t: 1794276074672, raw: 0 }] as SnapshotPoint[],
};
export const DEVICE_6cd64f1804551a53b01wkg = {
  deviceId: '6cd64f1804551a53b01wkg',
  from: '2026-11-09T10:24:00+08:00',
  to: '2026-11-10T10:24:00+08:00',
  gas: [{ t: 1794274161397, raw: 1 }, { t: 1794274162443, raw: 0 }] as SnapshotPoint[],
  runtime: [{ t: 1794200424606, raw: 1 }, { t: 1794200425607, raw: 0 }, { t: 1794220223569, raw: 1 }, { t: 1794220224548, raw: 0 }, { t: 1794274161401, raw: 1 }, { t: 1794274162446, raw: 0 }] as SnapshotPoint[],
  water: [{ t: 1794198624330, raw: 98 }, { t: 1794198625330, raw: 0 }, { t: 1794200424605, raw: 130 }, { t: 1794200425603, raw: 0 }, { t: 1794202224802, raw: 184 }, { t: 1794202225754, raw: 0 }, { t: 1794214824148, raw: 42 }, { t: 1794214825189, raw: 0 }, { t: 1794220223569, raw: 84 }, { t: 1794220224544, raw: 0 }, { t: 1794222023490, raw: 224 }, { t: 1794222024490, raw: 0 }, { t: 1794232823297, raw: 424 }, { t: 1794232824299, raw: 0 }, { t: 1794238222943, raw: 88 }, { t: 1794238223943, raw: 0 }, { t: 1794265162629, raw: 154 }, { t: 1794265163628, raw: 0 }, { t: 1794266962086, raw: 6 }, { t: 1794266963138, raw: 0 }, { t: 1794267011299, raw: 2 }, { t: 1794267012295, raw: 0 }, { t: 1794267013352, raw: 2 }, { t: 1794267014410, raw: 0 }, { t: 1794272362390, raw: 56 }, { t: 1794272363385, raw: 0 }, { t: 1794274161398, raw: 142 }, { t: 1794274162445, raw: 0 }, { t: 1794275961493, raw: 42 }, { t: 1794275962495, raw: 0 }] as SnapshotPoint[],
};
