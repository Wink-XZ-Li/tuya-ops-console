/** Fault bitmap labels from product debug schemas (Pro_Key → code → labels). */
export const PRODUCT_FAULT_BITMAP_LABELS: Record<string, Record<string, string[]>> = {
  'uhmj5b0ba31zpme6': {
    'fault': ["E1", "E2", "E3", "E4"],
  },
  'nohrp3vbmef7vxvx': {
    'fault': ["E1", "E3", "E4", "E2"],
  },
  '7sylzgrdnnq2w5mo': {
    'fault': ["E0", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "EA", "Eb", "EF", "EL"],
  },
  // 暂用 T15 位图，待 T6-WX2 调试文件确认。bit i → labels[i]；fault=32 → bit5 → E5。
  '90wi2aimyqstn9qc': {
    'fault': ["E0", "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "EA", "Eb", "EF", "EL"],
  },
};

/** 演示用短文案，不是硬件故障说明。 */
export const DEMO_FAULT_COPY: Record<string, { symptom: string; suggestedAction: string }> = {
  E3: {
    symptom: '上报故障码 E3。占位，待产品确认',
    suggestedAction: '核对当前状态后联系售后。占位，待产品确认',
  },
  E4: {
    symptom: '上报故障码 E4。占位，待产品确认',
    suggestedAction: '记录出现时间，确认是否反复。占位，待产品确认',
  },
  E5: {
    symptom: '上报故障码 E5。占位，待产品确认',
    suggestedAction: '先看设备是否仍在报该码。占位，待产品确认',
  },
};

export function getFaultBitmapLabels(productId: string | undefined | null, code: string): string[] | null {
  if (!productId) return null;
  const labels = PRODUCT_FAULT_BITMAP_LABELS[productId]?.[code];
  return labels?.length ? labels : null;
}

