/** Product DP schemas from Tuya debug files (API copy for functions merge) (Pro_Key → Dp_Data). */
export type ProductDp = {
  id: number;
  code: string;
  name: string;
  mode: string;
  type: string;
  values?: Record<string, unknown> | null;
};

export const PRODUCT_DP_SCHEMAS: Record<string, ProductDp[]> = {
  'uhmj5b0ba31zpme6': [
    { id: 1, code: "switch", name: "开关", mode: "rw", type: "bool", values: {"type": "bool"} },
    { id: 2, code: "temp_set", name: "温度设置", mode: "rw", type: "value", values: {"max": 31, "min": 16, "scale": 0, "step": 1, "type": "value", "unit": "℃"} },
    { id: 3, code: "temp_current", name: "当前温度", mode: "ro", type: "value", values: {"max": 100, "min": -20, "scale": 0, "step": 1, "type": "value", "unit": "℃"} },
    { id: 4, code: "mode", name: "模式", mode: "rw", type: "enum", values: {"range": ["dry", "airSupply", "heat", "cool"], "type": "enum"} },
    { id: 5, code: "fan_speed_enum", name: "风速", mode: "rw", type: "enum", values: {"range": ["low", "middle", "high"], "type": "enum"} },
    { id: 12, code: "heat", name: "取暖器联动开关", mode: "rw", type: "bool", values: {"type": "bool"} },
    { id: 13, code: "light", name: "照明开关", mode: "rw", type: "bool", values: {"type": "bool"} },
    { id: 19, code: "temp_unit_convert", name: "温标切换", mode: "rw", type: "enum", values: {"range": ["c", "f"], "type": "enum"} },
    { id: 22, code: "fault", name: "故障告警", mode: "ro", type: "bitmap", values: {"label": ["E1", "E2", "E3", "E4"], "maxlen": 4, "type": "bitmap"} },
    { id: 23, code: "temp_current_f", name: "当前温度_F", mode: "ro", type: "value", values: {"max": 200, "min": -40, "scale": 0, "step": 1, "type": "value", "unit": "℉"} },
    { id: 24, code: "temp_set_f", name: "目标温度_F", mode: "rw", type: "value", values: {"max": 88, "min": 61, "scale": 0, "step": 1, "type": "value", "unit": "℉"} },
    { id: 25, code: "sleep", name: "睡眠模式开关", mode: "rw", type: "bool", values: {"type": "bool"} },
    { id: 33, code: "switch_horizontal", name: "左右摆风", mode: "rw", type: "bool", values: {"type": "bool"} },
    { id: 120, code: "screen_saver", name: "屏保开关", mode: "rw", type: "bool", values: {"type": "bool"} },
    { id: 150, code: "usage_time", name: "使用时长", mode: "ro", type: "value", values: {"max": 30, "min": 0, "scale": 0, "step": 1, "type": "value", "unit": "分钟"} },
    { id: 110, code: "support_light", name: "是否支持照明", mode: "ro", type: "bool", values: {"type": "bool"} },
    { id: 101, code: "filter_health", name: "滤网健康度", mode: "ro", type: "value", values: {"max": 100, "min": 0, "scale": 0, "step": 1, "type": "value", "unit": ""} },
    { id: 103, code: "reset_filter_timer", name: "滤网计时复位", mode: "rw", type: "bool", values: {"type": "bool"} },
  ],
  'qxjzruuqz40bty7e': [
    { id: 1, code: "switch_1", name: "开关 1", mode: "rw", type: "bool", values: {"type": "bool"} },
  ],
  'nohrp3vbmef7vxvx': [
    { id: 1, code: "switch", name: "开关", mode: "rw", type: "bool", values: {"type": "bool"} },
    { id: 2, code: "mode", name: "模式", mode: "rw", type: "enum", values: {"range": ["undefined"], "type": "enum"} },
    { id: 9, code: "temp_set", name: "温度设置（℃）", mode: "rw", type: "value", values: {"max": 60, "min": 30, "scale": 0, "step": 1, "type": "value", "unit": "℃"} },
    { id: 10, code: "temp_current", name: "当前温度（℃）", mode: "ro", type: "value", values: {"max": 100, "min": 0, "scale": 0, "step": 1, "type": "value", "unit": "℃"} },
    { id: 12, code: "power_consumption", name: "耗电量0", mode: "ro", type: "value", values: {"max": 2147483647, "min": 0, "scale": 1, "step": 1, "type": "value", "unit": "kw·h"} },
    { id: 17, code: "temp_unit_convert", name: "温标切换", mode: "rw", type: "enum", values: {"range": ["c", "f"], "type": "enum"} },
    { id: 20, code: "fault", name: "故障告警", mode: "ro", type: "bitmap", values: {"label": ["E1", "E3", "E4", "E2"], "maxlen": 4, "type": "bitmap"} },
    { id: 21, code: "water_flow", name: "水流量", mode: "ro", type: "value", values: {"max": 1000, "min": 0, "scale": 1, "step": 1, "type": "value", "unit": "GPM"} },
    { id: 25, code: "temp_set_f", name: "温度设置（℉）", mode: "rw", type: "value", values: {"max": 140, "min": 86, "scale": 0, "step": 1, "type": "value", "unit": "℉"} },
    { id: 26, code: "temp_current_f", name: "当前温度（℉）", mode: "ro", type: "value", values: {"max": 212, "min": 32, "scale": 0, "step": 1, "type": "value", "unit": "℉"} },
    { id: 101, code: "heating", name: "加热状态", mode: "ro", type: "bool", values: {"type": "bool"} },
    { id: 102, code: "flow", name: "水流信号", mode: "ro", type: "bool", values: {"type": "bool"} },
    { id: 103, code: "water_consumption", name: "耗水量0", mode: "ro", type: "value", values: {"max": 2147483647, "min": 0, "scale": 1, "step": 1, "type": "value", "unit": "G"} },
    { id: 105, code: "cur_power_stats", name: "当次电量统计", mode: "ro", type: "value", values: {"max": 1000, "min": 0, "scale": 1, "step": 1, "type": "value", "unit": "kw·h"} },
    { id: 199, code: "show_power_consumption", name: "展示电量统计", mode: "ro", type: "bool", values: {"type": "bool"} },
    { id: 198, code: "hw_version", name: "硬件版本", mode: "ro", type: "value", values: {"max": 10, "min": 0, "scale": 0, "step": 1, "type": "value", "unit": ""} },
    { id: 120, code: "power_consumption_1", name: "耗电量1", mode: "ro", type: "value", values: {"max": 100000, "min": 0, "scale": 2, "step": 1, "type": "value", "unit": "kw·h"} },
    { id: 121, code: "water_consumption_1", name: "耗水量1", mode: "ro", type: "value", values: {"max": 100000, "min": 0, "scale": 1, "step": 1, "type": "value", "unit": "G"} },
  ],
};

export function getProductDps(productId: string): ProductDp[] {
  return PRODUCT_DP_SCHEMAS[productId] ?? [];
}

export function formatProductDpLabel(dp: ProductDp): string {
  return `${dp.id} · ${dp.code}（${dp.name}）`;
}
