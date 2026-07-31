/** Product display names from schema filenames (sans Debugfile_/date). */
export const PRODUCT_NAMES: Record<string, string> = {
  'uhmj5b0ba31zpme6': "房车空调-TyOS-开发测试",
  'qxjzruuqz40bty7e': "一路开关",
  'nohrp3vbmef7vxvx': "西屋即热式电热水器-旋钮款",
  '7sylzgrdnnq2w5mo': "国内伊莱克斯燃气壁挂炉T15（T8b）",
};

export const PRODUCT_IDS = Object.keys(PRODUCT_NAMES);

export function getProductName(productId: string): string | undefined {
  return PRODUCT_NAMES[productId];
}

export function formatProductLabel(productId: string): string {
  const name = PRODUCT_NAMES[productId];
  return name ? `${name}（${productId}）` : productId;
}
