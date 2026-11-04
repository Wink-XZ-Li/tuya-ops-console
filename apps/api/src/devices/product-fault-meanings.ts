/**
 * Fault copy is loaded from the repo-root JSON. Do not paste meanings back into this file.
 * Collection flow: panel projects → PRODUCT_FAULT_MEANINGS.json → this loader → FaultCodeDefinition seed.
 */
import { readRepoJson } from './schema-files';

export type FaultMeaning = {
  nameZh: string;
  nameEn?: string;
  /** 现象 / 含义（中文，供后台展示） */
  symptom: string;
  /** 建议处理动作 */
  suggestedAction?: string;
  cause?: string;
};

export type FaultFamilyId =
  | 'gas_boiler'
  | 'gas_instant_water_heater'
  | 'rv_ac_controller'
  | 'water_purifier_faucet_comm'
  | 'water_purifier_heat'
  | 'water_purifier_pureone_hot'
  | 'water_softener'
  | 'zero_cold_water_heater';

const FAULT_FAMILY_IDS: readonly FaultFamilyId[] = [
  'gas_boiler',
  'gas_instant_water_heater',
  'rv_ac_controller',
  'water_purifier_faucet_comm',
  'water_purifier_heat',
  'water_purifier_pureone_hot',
  'water_softener',
  'zero_cold_water_heater',
];

type MeaningsFile = {
  families: Record<string, { codes?: Record<string, FaultMeaning> }>;
  productFamily: Record<string, string>;
};

function isFaultFamilyId(value: string): value is FaultFamilyId {
  return (FAULT_FAMILY_IDS as readonly string[]).includes(value);
}

function loadMeanings(file: MeaningsFile): {
  families: Record<FaultFamilyId, Record<string, FaultMeaning>>;
  productFamily: Record<string, FaultFamilyId>;
} {
  const families = {} as Record<FaultFamilyId, Record<string, FaultMeaning>>;
  for (const id of FAULT_FAMILY_IDS) {
    const codes = file.families[id]?.codes;
    if (!codes) {
      throw new Error(`PRODUCT_FAULT_MEANINGS.json is missing families.${id}.codes`);
    }
    families[id] = codes;
  }
  const productFamily: Record<string, FaultFamilyId> = {};
  for (const [productId, family] of Object.entries(file.productFamily ?? {})) {
    if (!isFaultFamilyId(family)) {
      throw new Error(`PRODUCT_FAULT_MEANINGS.json productFamily.${productId} is not a known family`);
    }
    productFamily[productId] = family;
  }
  return { families, productFamily };
}

const loaded = loadMeanings(readRepoJson<MeaningsFile>('PRODUCT_FAULT_MEANINGS.json'));

export const FAULT_FAMILY_MEANINGS = loaded.families;
export const PRODUCT_FAULT_FAMILY = loaded.productFamily;

export function getFaultMeaning(
  productId: string | null | undefined,
  label: string,
): FaultMeaning | undefined {
  if (!productId) return undefined;
  const family = PRODUCT_FAULT_FAMILY[productId];
  if (!family) return undefined;
  return FAULT_FAMILY_MEANINGS[family]?.[label];
}

/** 兼容旧 DEMO_FAULT_COPY：按 label 取文案（多品类同码时以壁挂炉/燃热等优先顺序合并）。 */
export const DEMO_FAULT_COPY: Record<string, { symptom: string; suggestedAction: string }> = {};
(() => {
  const order: FaultFamilyId[] = [
    'gas_boiler',
    'gas_instant_water_heater',
    'zero_cold_water_heater',
    'rv_ac_controller',
    'water_purifier_heat',
    'water_purifier_faucet_comm',
    'water_purifier_pureone_hot',
    'water_softener',
  ];
  for (const fid of order) {
    const codes = FAULT_FAMILY_MEANINGS[fid];
    for (const [label, meaning] of Object.entries(codes)) {
      if (!DEMO_FAULT_COPY[label]) {
        DEMO_FAULT_COPY[label] = {
          symptom: meaning.symptom,
          suggestedAction: meaning.suggestedAction ?? '按产品说明书排查或联系售后。',
        };
      }
    }
  }
})();
