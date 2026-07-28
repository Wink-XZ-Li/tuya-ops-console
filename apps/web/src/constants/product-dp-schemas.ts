/** Product DP schemas from Tuya debug files (Pro_Key → Dp_Data). */
export type ProductDp = { id: number; code: string; name: string };

export const PRODUCT_DP_SCHEMAS: Record<string, ProductDp[]> = {
  'uhmj5b0ba31zpme6': [
    { id: 1, code: "switch", name: "开关" },
    { id: 2, code: "temp_set", name: "温度设置" },
    { id: 3, code: "temp_current", name: "当前温度" },
    { id: 4, code: "mode", name: "模式" },
    { id: 5, code: "fan_speed_enum", name: "风速" },
    { id: 12, code: "heat", name: "取暖器联动开关" },
    { id: 13, code: "light", name: "照明开关" },
    { id: 19, code: "temp_unit_convert", name: "温标切换" },
    { id: 22, code: "fault", name: "故障告警" },
    { id: 23, code: "temp_current_f", name: "当前温度_F" },
    { id: 24, code: "temp_set_f", name: "目标温度_F" },
    { id: 25, code: "sleep", name: "睡眠模式开关" },
    { id: 33, code: "switch_horizontal", name: "左右摆风" },
    { id: 120, code: "screen_saver", name: "屏保开关" },
    { id: 150, code: "usage_time", name: "使用时长" },
    { id: 110, code: "support_light", name: "是否支持照明" },
    { id: 101, code: "filter_health", name: "滤网健康度" },
    { id: 103, code: "reset_filter_timer", name: "滤网计时复位" },
  ],
  'qxjzruuqz40bty7e': [
    { id: 1, code: "switch_1", name: "开关 1" },
  ],
  'nohrp3vbmef7vxvx': [
    { id: 1, code: "switch", name: "开关" },
    { id: 2, code: "mode", name: "模式" },
    { id: 9, code: "temp_set", name: "温度设置（℃）" },
    { id: 10, code: "temp_current", name: "当前温度（℃）" },
    { id: 12, code: "power_consumption", name: "耗电量0" },
    { id: 17, code: "temp_unit_convert", name: "温标切换" },
    { id: 20, code: "fault", name: "故障告警" },
    { id: 21, code: "water_flow", name: "水流量" },
    { id: 25, code: "temp_set_f", name: "温度设置（℉）" },
    { id: 26, code: "temp_current_f", name: "当前温度（℉）" },
    { id: 101, code: "heating", name: "加热状态" },
    { id: 102, code: "flow", name: "水流信号" },
    { id: 103, code: "water_consumption", name: "耗水量0" },
    { id: 105, code: "cur_power_stats", name: "当次电量统计" },
    { id: 199, code: "show_power_consumption", name: "展示电量统计" },
    { id: 198, code: "hw_version", name: "硬件版本" },
    { id: 120, code: "power_consumption_1", name: "耗电量1" },
    { id: 121, code: "water_consumption_1", name: "耗水量1" },
  ],
};

export function getProductDps(productId: string): ProductDp[] {
  return PRODUCT_DP_SCHEMAS[productId] ?? [];
}

export function formatProductDpLabel(dp: ProductDp): string {
  return `${dp.id} · ${dp.code}（${dp.name}）`;
}
