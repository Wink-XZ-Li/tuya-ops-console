/** Product DP schemas from Tuya debug files (Pro_Key → Dp_Data). */
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
  '7sylzgrdnnq2w5mo': [
    { id: 1, code: "switch", name: "开关", mode: "rw", type: "bool", values: {"type":"bool"} },
    { id: 2, code: "mode", name: "模式", mode: "rw", type: "enum", values: {"range":["summer","winter"],"type":"enum"} },
    { id: 3, code: "dhw_temp_set", name: "生活/卫浴水温设置", mode: "rw", type: "value", values: {"max":60,"min":35,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 4, code: "dhw_temp_current", name: "生活/卫浴当前温度", mode: "ro", type: "value", values: {"max":100,"min":-30,"scale":0,"step":1,"type":"value","unit":"℃"} },
    { id: 5, code: "temp_set", name: "供暖温度设置", mode: "rw", type: "value", values: {"max":80,"min":30,"scale":0,"step":1,"type":"value","unit":"℃"} },
    { id: 6, code: "temp_current", name: "供暖当前温度", mode: "ro", type: "value", values: {"max":100,"min":-30,"scale":0,"step":1,"type":"value","unit":"℃"} },
    { id: 9, code: "water_pressure", name: "采暖水压", mode: "ro", type: "value", values: {"max":99,"min":0,"scale":1,"step":1,"type":"value","unit":"bar"} },
    { id: 14, code: "gas_consumption", name: "耗气量", mode: "ro", type: "value", values: {"max":2147483647,"min":0,"scale":1,"step":1,"type":"value","unit":"m³"} },
    { id: 20, code: "fault", name: "故障告警", mode: "ro", type: "bitmap", values: {"label":["E0","E1","E2","E3","E4","E5","E6","E7","E8","E9","EA","Eb","EF","EL"],"maxlen":14,"type":"bitmap"} },
    { id: 101, code: "water_consumption", name: "耗水量", mode: "ro", type: "value", values: {"max":2147483647,"min":0,"scale":1,"step":1,"type":"value","unit":"L"} },
    { id: 102, code: "flame_level", name: "火焰等级", mode: "ro", type: "value", values: {"max":7,"min":0,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 103, code: "water_press_status", name: "水压状态", mode: "ro", type: "bool", values: {"type":"bool"} },
    { id: 104, code: "eco", name: "ECO模式", mode: "rw", type: "bool", values: {"type":"bool"} },
    { id: 105, code: "runtime", name: "运行时间", mode: "rw", type: "value", values: {"max":30,"min":0,"scale":0,"step":1,"type":"value","unit":"分钟"} },
    { id: 114, code: "status", name: "工作状态", mode: "ro", type: "enum", values: {"range":["off","standby","shower_heating","warm_heating","antifreeze"],"type":"enum"} },
    { id: 142, code: "support_gas_consumption", name: "支持耗气量统计", mode: "ro", type: "bool", values: {"type":"bool"} },
    { id: 170, code: "ph", name: "PH采暖最大比例阀电流", mode: "rw", type: "value", values: {"max":249,"min":9,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 171, code: "lhd", name: "LH-D（大气式）卫浴最大比例阀电流", mode: "rw", type: "value", values: {"max":249,"min":9,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 172, code: "lhq", name: "LH-Q（全预混）卫浴最大风机转速", mode: "rw", type: "value", values: {"max":9000,"min":3000,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 173, code: "pl", name: "PL最小比例阀电流", mode: "rw", type: "value", values: {"max":249,"min":9,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 174, code: "dh", name: "dH点火比例阀电流", mode: "rw", type: "value", values: {"max":249,"min":9,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 175, code: "fh", name: "FH采暖最大风机转速", mode: "rw", type: "value", values: {"max":9000,"min":3000,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 176, code: "fn", name: "Fn卫浴最大风机转速", mode: "rw", type: "value", values: {"max":9000,"min":3000,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 177, code: "fl", name: "FL最小风机转速", mode: "rw", type: "value", values: {"max":9000,"min":500,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 178, code: "fp", name: "FP烟道堵塞保护等级", mode: "rw", type: "value", values: {"max":15,"min":0,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 179, code: "h0", name: "H0风压传感器开启值", mode: "rw", type: "value", values: {"max":250,"min":8,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 180, code: "h1", name: "H1风压传感器关闭值", mode: "rw", type: "value", values: {"max":250,"min":8,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 181, code: "id", name: "Id涂鸦PID", mode: "ro", type: "value", values: {"max":99,"min":0,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 182, code: "od", name: "od-SKU与成品编码", mode: "ro", type: "value", values: {"max":99,"min":0,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 183, code: "hc", name: "HC回差温度", mode: "rw", type: "value", values: {"max":30,"min":5,"scale":0,"step":1,"type":"value","unit":""} },
    { id: 184, code: "cn", name: "Cn地暖或散热片模式选择", mode: "ro", type: "bool", values: {"type":"bool"} },
    { id: 185, code: "yl", name: "yL水压检测方式选择", mode: "ro", type: "bool", values: {"type":"bool"} },
    { id: 186, code: "dn", name: "dn单暖/两用选择", mode: "ro", type: "bool", values: {"type":"bool"} },
  ],
};

export function getProductDps(productId: string): ProductDp[] {
  return PRODUCT_DP_SCHEMAS[productId] ?? [];
}

export function formatProductDpLabel(dp: ProductDp): string {
  return `${dp.id} · ${dp.code}（${dp.name}）`;
}
