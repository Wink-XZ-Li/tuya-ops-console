/**
 * 故障码含义：从各产品面板工程 i18n/schema 收集，供告警与 FaultCodeDefinition 播种。
 * 数据同源：仓库根目录 PRODUCT_FAULT_MEANINGS.json
 * 生成日期：2026-10-22
 */

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

export const FAULT_FAMILY_MEANINGS: Record<FaultFamilyId, Record<string, FaultMeaning>> = {
  gas_boiler: {
    "E0": { nameZh: "系统水路异常", nameEn: "System water circuit abnormality", symptom: "系统水路异常", suggestedAction: "检查水路、过滤器与水泵是否正常，必要时联系售后。" },
    "E1": { nameZh: "点火失败或残火/伪火", nameEn: "Ignition failure, residual flame, or false flame", symptom: "点火失败或残火，伪火", suggestedAction: "检查燃气供应与点火系统，确认无残火后复位再试。" },
    "E2": { nameZh: "机械温控器故障", nameEn: "Mechanical thermostat failure", symptom: "机械温控器故障", suggestedAction: "检查机械温控器接线与触点，异常则更换。" },
    "E3": { nameZh: "风机故障", nameEn: "Fan failure", symptom: "风机故障", suggestedAction: "检查风机供电、转速与风道是否堵塞。" },
    "E4": { nameZh: "水压故障", nameEn: "Water pressure failure", symptom: "水压故障（面板约显示故障码 10 秒）", suggestedAction: "检查系统水压是否在正常范围，补水排气后观察。" },
    "E5": { nameZh: "开关阀驱动电路故障", nameEn: "On/off valve drive circuit failure", symptom: "开关阀驱动电路故障", suggestedAction: "检查开关阀驱动电路与阀体，必要时更换主板或阀。" },
    "E6": { nameZh: "卫浴温度传感器故障", nameEn: "Bathroom temperature sensor failure", symptom: "卫浴温度传感器故障", suggestedAction: "检查卫浴 NTC 传感器插头与阻值。" },
    "E7": { nameZh: "供暖温度传感器故障", nameEn: "Heating temperature sensor failure", symptom: "供暖温度传感器故障", suggestedAction: "检查供暖 NTC 传感器插头与阻值。" },
    "E8": { nameZh: "采暖水温度过高", nameEn: "Heating water temperature too high (≥90°C)", symptom: "采暖水温度过高（≥90℃）", suggestedAction: "检查循环、过滤器与设定温度，待降温后复位。" },
    "E9": { nameZh: "管道结冰故障", nameEn: "Pipe freezing failure (≤1°C)", symptom: "采暖或零冷水管道结冰故障，温度≤1℃", suggestedAction: "确认环境温度与防冻措施，化冻后检查是否漏水。" },
    "EA": { nameZh: "燃气泄漏/CO 报警", nameEn: "Gas valve gas leak, CO alarm failure", symptom: "燃气阀燃气泄漏故障，CO 报警故障", suggestedAction: "立即开窗通风、关闭气源，勿开关电器，联系专业人员。" },
    "Eb": { nameZh: "烟气温度传感器故障", nameEn: "Flue gas temperature sensor failure (≥110°C)", symptom: "烟气温度传感器故障（≥110℃）", suggestedAction: "检查烟温传感器与烟道散热。" },
    "EF": { nameZh: "冷凝水堵塞", nameEn: "Condensate blockage failure", symptom: "冷凝水堵塞故障", suggestedAction: "清理冷凝水管与水封，保持排水通畅。" },
    "EL": { nameZh: "零冷水水路故障", nameEn: "Cold water circuit / recirculation failure", symptom: "零冷水水路故障", suggestedAction: "检查零冷水循环管路、水泵与阀门。" },
  },
  gas_instant_water_heater: {
    "E0": { nameZh: "水温探头故障", nameEn: "Water temperature probe fault", symptom: "水温探头故障", suggestedAction: "检查出水/水温探头接线与阻值。" },
    "E1": { nameZh: "火焰故障", nameEn: "Flame fault", symptom: "火焰故障", suggestedAction: "检查燃气供应是否正常并确认气路连接正确后再使用。" },
    "E2": { nameZh: "伪火故障", nameEn: "False fire fault", symptom: "伪火故障", suggestedAction: "检查火焰检测电路，排除伪火信号后复位。" },
    "E3": { nameZh: "温控器保护", nameEn: "Thermostat protection", symptom: "温控器保护", suggestedAction: "待温度回落后复位；反复出现则检查温控器。" },
    "E4": { nameZh: "水温探头故障", nameEn: "Water temperature probe fault", symptom: "水温探头故障", suggestedAction: "检查水温探头接线与阻值。" },
    "E5": { nameZh: "风机故障", nameEn: "Fan fault", symptom: "风机故障（点火前 8s 转速<1000r/min，或燃烧中连续 6s<600r/min）", suggestedAction: "检查风机供电、风轮与烟道阻力。" },
    "E6": { nameZh: "过热保护", nameEn: "Over-heating protection", symptom: "过热保护", suggestedAction: "检查水压是否过低，确认水压高于启动压力后再使用。" },
    "E7": { nameZh: "电磁阀故障", nameEn: "Solenoid valve fault", symptom: "电磁阀故障", suggestedAction: "检查燃气电磁阀供电与阀体。" },
    "E8": { nameZh: "烟道堵塞", nameEn: "Flue jam fault", symptom: "烟道堵塞故障", suggestedAction: "清理烟道，确认排烟通畅。" },
    "En": { nameZh: "到达设定关机时间", nameEn: "The set shutdown time has been reached", symptom: "已到达设定关机时间", suggestedAction: "属定时关机提示；需继续使用请重新开机或调整定时。" },
  },
  rv_ac_controller: {
    "E1": { nameZh: "通信故障", nameEn: "Communication fault", symptom: "通信故障", suggestedAction: "检查电源与线控器之间的连线；必要时更换 PCB 或线控器。" },
    "E2": { nameZh: "室内温度传感器故障", nameEn: "Room temperature sensor fault", symptom: "室内温度传感器故障", suggestedAction: "检查电源与线控器连线；必要时更换线控器。" },
    "E3": { nameZh: "线控器 DC12V 供电过低", nameEn: "Controller DC 12V power supply voltage is too low", symptom: "线控器 DC 12V 供电电压过低", suggestedAction: "将线控器接到标准、正确的 DC 12V 电源。" },
    "E4": { nameZh: "线控器 DC12V 供电过高", nameEn: "Controller DC 12V power supply voltage is too high", symptom: "线控器 DC 12V 供电电压过高", suggestedAction: "将线控器接到标准、正确的 DC 12V 电源。" },
    "E5": { nameZh: "E5（面板未提供说明）", nameEn: "E5 (no panel copy)", symptom: "上报故障码 E5，面板未提供含义", suggestedAction: "对照整机说明书或联系售后确认。" },
    "E6": { nameZh: "E6（面板未提供说明）", nameEn: "E6 (no panel copy)", symptom: "上报故障码 E6，面板未提供含义", suggestedAction: "对照整机说明书或联系售后确认。" },
    "E7": { nameZh: "E7（面板未提供说明）", nameEn: "E7 (no panel copy)", symptom: "上报故障码 E7，面板未提供含义", suggestedAction: "对照整机说明书或联系售后确认。" },
    "E8": { nameZh: "E8（面板未提供说明）", nameEn: "E8 (no panel copy)", symptom: "上报故障码 E8，面板未提供含义", suggestedAction: "对照整机说明书或联系售后确认。" },
  },
  water_purifier_faucet_comm: {
    "E8": { nameZh: "龙头通信失败", nameEn: "Faucet communication failure", symptom: "水龙头与净水器通信失败", suggestedAction: "请检查龙头与主机连接。" },
    "E15": { nameZh: "连续运行超时保护", nameEn: "System overrun protection after 2 hours", symptom: "系统连续运行 2 小时触发超时保护", suggestedAction: "断电休息后重新上电；若反复出现请联系客服。" },
  },
  water_purifier_heat: {
    "E1": { nameZh: "系统异常", nameEn: "System malfunction", symptom: "系统异常", suggestedAction: "请断电 1 分钟后重新上电并观察是否恢复。若仍显示错误码，请联系客服。" },
    "E2": { nameZh: "长时间持续加热", nameEn: "Continuous heating too long", symptom: "系统长时间持续加热", suggestedAction: "检查当地沸点；若低于 203˚F，先调整沸点后重新上电。若错误仍存在，请联系客服。" },
    "E3": { nameZh: "水路/流量异常", nameEn: "Water flow abnormality", symptom: "可能无出水、流量异常或系统异常（常见未进水或水管弯折）", suggestedAction: "检查进水与水管后重新上电。若错误仍存在，请联系客服。" },
    "E4": { nameZh: "水路/流量异常", nameEn: "Water flow abnormality", symptom: "可能无出水、流量异常或系统异常（常见未进水或水管弯折）", suggestedAction: "检查进水与水管后重新上电。若错误仍存在，请联系客服。" },
    "E6": { nameZh: "系统异常", nameEn: "System malfunction", symptom: "系统异常", suggestedAction: "请断电 1 分钟后重新上电；若仍报错请联系客服。" },
    "E7": { nameZh: "系统异常", nameEn: "System malfunction", symptom: "系统异常", suggestedAction: "请断电 1 分钟后重新上电；若仍报错请联系客服。" },
    "E8": { nameZh: "系统异常", nameEn: "System malfunction", symptom: "系统异常", suggestedAction: "请断电 1 分钟后重新上电；若仍报错请联系客服。" },
    "E9": { nameZh: "系统异常", nameEn: "System malfunction", symptom: "系统异常", suggestedAction: "请断电 1 分钟后重新上电；若仍报错请联系客服。" },
    "F0": { nameZh: "加热水箱温度异常", nameEn: "Heating tank temperature abnormal", symptom: "加热水箱温度异常", suggestedAction: "请重新上电恢复。若仍报错，可能为温度传感器故障，请联系客服。" },
    "F1": { nameZh: "系统异常", nameEn: "System malfunction", symptom: "系统异常", suggestedAction: "请断电 1 分钟后重新上电；若仍报错请联系客服。" },
    "F2": { nameZh: "长时间持续加热", nameEn: "Continuous heating too long", symptom: "系统长时间持续加热", suggestedAction: "检查沸点设置后重新上电；若仍报错请联系客服。" },
    "F3": { nameZh: "水路/流量异常", nameEn: "Water flow abnormality", symptom: "可能无出水、流量异常或系统异常", suggestedAction: "检查进水与水管后重新上电；若仍报错请联系客服。" },
    "F4": { nameZh: "系统异常", nameEn: "System malfunction", symptom: "系统异常", suggestedAction: "请断电 1 分钟后重新上电；若仍报错请联系客服。" },
  },
  water_purifier_pureone_hot: {
    "E0": { nameZh: "E0（面板未提供说明）", nameEn: "E0 (no panel copy)", symptom: "上报故障码 E0，该 PID 面板分支未配置说明文案", suggestedAction: "对照产品说明书或联系售后确认。" },
    "E1": { nameZh: "E1（面板未提供说明）", nameEn: "E1 (no panel copy)", symptom: "上报故障码 E1，该 PID 面板分支未配置说明文案", suggestedAction: "对照产品说明书或联系售后确认。" },
    "E2": { nameZh: "E2（面板未提供说明）", nameEn: "E2 (no panel copy)", symptom: "上报故障码 E2，该 PID 面板分支未配置说明文案", suggestedAction: "对照产品说明书或联系售后确认。" },
    "E3": { nameZh: "E3（面板未提供说明）", nameEn: "E3 (no panel copy)", symptom: "上报故障码 E3，该 PID 面板分支未配置说明文案", suggestedAction: "对照产品说明书或联系售后确认。" },
    "E4": { nameZh: "E4（面板未提供说明）", nameEn: "E4 (no panel copy)", symptom: "上报故障码 E4，该 PID 面板分支未配置说明文案", suggestedAction: "对照产品说明书或联系售后确认。" },
    "E5": { nameZh: "E5（面板未提供说明）", nameEn: "E5 (no panel copy)", symptom: "上报故障码 E5，该 PID 面板分支未配置说明文案", suggestedAction: "对照产品说明书或联系售后确认。" },
    "E6": { nameZh: "E6（面板未提供说明）", nameEn: "E6 (no panel copy)", symptom: "上报故障码 E6，该 PID 面板分支未配置说明文案", suggestedAction: "对照产品说明书或联系售后确认。" },
    "E7": { nameZh: "E7（面板未提供说明）", nameEn: "E7 (no panel copy)", symptom: "上报故障码 E7，该 PID 面板分支未配置说明文案", suggestedAction: "对照产品说明书或联系售后确认。" },
    "E8": { nameZh: "E8（面板未提供说明）", nameEn: "E8 (no panel copy)", symptom: "上报故障码 E8，该 PID 面板分支未配置说明文案", suggestedAction: "对照产品说明书或联系售后确认。" },
    "E9": { nameZh: "E9（面板未提供说明）", nameEn: "E9 (no panel copy)", symptom: "上报故障码 E9，该 PID 面板分支未配置说明文案", suggestedAction: "对照产品说明书或联系售后确认。" },
  },
  water_softener: {
    "salt_lack": { nameZh: "缺盐", nameEn: "Low Salt", symptom: "盐量不足", suggestedAction: "缺盐警告，请及时补盐。" },
    "motor_fault": { nameZh: "电机故障", nameEn: "Motor Failure", symptom: "电机故障", suggestedAction: "检查再生电机与传动机构，必要时联系售后。" },
    "sensor_fault": { nameZh: "传感器故障", nameEn: "Sensor Fault", symptom: "传感器故障", suggestedAction: "检查相关传感器接线与状态。" },
  },
  zero_cold_water_heater: {
    "E0": { nameZh: "出水探头故障", nameEn: "Outlet probe fault", symptom: "出水探头故障", suggestedAction: "检查出水探头接线与阻值。" },
    "E1": { nameZh: "点火失败", nameEn: "Ignition failure", symptom: "点火失败", suggestedAction: "检查燃气供应与点火针/检测针。" },
    "E2": { nameZh: "温度传感器故障", nameEn: "Temperature sensor fault", symptom: "温度传感器故障", suggestedAction: "检查温度传感器插头与阻值。" },
    "E3": { nameZh: "过热保护", nameEn: "Overheat protection", symptom: "过热保护", suggestedAction: "待降温后复位；检查水压与换热器。" },
    "E4": { nameZh: "风机故障", nameEn: "Fan fault", symptom: "风机故障", suggestedAction: "检查风机供电与烟道阻力。" },
    "E5": { nameZh: "燃气阀故障", nameEn: "Gas valve fault", symptom: "燃气阀故障", suggestedAction: "检查燃气阀供电与阀体。" },
    "E6": { nameZh: "水流量故障", nameEn: "Water flow fault", symptom: "水流量故障", suggestedAction: "检查进水压力、流量传感器与管路。" },
    "E7": { nameZh: "比例阀故障", nameEn: "Proportional valve fault", symptom: "比例阀故障", suggestedAction: "检查比例阀驱动电路与阀体。" },
    "E8": { nameZh: "残火故障", nameEn: "Residual flame fault", symptom: "残火故障", suggestedAction: "检查火焰检测，确认熄火后复位。" },
    "EH": { nameZh: "意外熄火故障", nameEn: "Unexpected flameout fault", symptom: "意外熄火故障", suggestedAction: "检查燃气压力与火焰稳定性。" },
    "En": { nameZh: "烟道堵塞", nameEn: "Flue blockage", symptom: "烟道堵塞", suggestedAction: "清理烟道，确认排烟通畅。" },
    "Eb": { nameZh: "漏电保护", nameEn: "Leakage protection", symptom: "漏电保护", suggestedAction: "切断电源，检查接地与漏电保护器，联系专业人员。" },
    "Ec": { nameZh: "冷凝水故障", nameEn: "Condensate fault", symptom: "冷凝水故障", suggestedAction: "清理冷凝水管与水封。" },
  },
};

/** productId → family（按 Schema fault bitmap label 签名或面板显式 PID 归属） */
export const PRODUCT_FAULT_FAMILY: Record<string, FaultFamilyId> = {
  "1x0qz5jtlabxywcg": "gas_instant_water_heater",
  "2d2lzbcuvusrbfo1": "gas_instant_water_heater",
  "2x4ygqfjcyswdodq": "gas_boiler",
  "3nw4ptwrqhjrdg5p": "gas_instant_water_heater",
  "4am4do0zg9c9h8y3": "gas_instant_water_heater",
  "6himljlxce5aa7p1": "gas_instant_water_heater",
  "6pazcwmz1qujohmy": "water_softener",
  "7sylzgrdnnq2w5mo": "gas_boiler",
  "90wi2aimyqstn9qc": "gas_boiler",
  "9qrvh0z2wlj0tct1": "gas_boiler",
  "a3cbezgki7lkl8rr": "zero_cold_water_heater",
  "as5qghsmkvckz7go": "gas_boiler",
  "avkomece5wvqrhlh": "gas_instant_water_heater",
  "bijpoxamfcgyokmh": "water_purifier_faucet_comm",
  "bnqtq87x3yuxg6nf": "gas_instant_water_heater",
  "bxud7iebvak5uolk": "rv_ac_controller",
  "byr3ta1gq4heezwq": "gas_boiler",
  "cczbgdmzrrvl4vaz": "rv_ac_controller",
  "ckjfqtnqqystvfaa": "gas_boiler",
  "cruyrfbitjiodflw": "gas_boiler",
  "d6py8wxahqv55rir": "gas_instant_water_heater",
  "d86kgwqkmrwavhjz": "gas_instant_water_heater",
  "dknfai4pqtl1k2hf": "water_purifier_faucet_comm",
  "eafeymjzrvvvrnhs": "gas_boiler",
  "euihfxmzqhzv0bya": "rv_ac_controller",
  "fconahu8tglnx5nu": "gas_instant_water_heater",
  "fvyy0pj9zonxpeqw": "gas_instant_water_heater",
  "gn89ipbqe8aosccu": "gas_boiler",
  "gnx38ac3tuzwrjwd": "water_softener",
  "h7wrebiqdedekmiy": "gas_boiler",
  "hl6a7jbze7mojgev": "gas_boiler",
  "hlma4dxmjjsiicjg": "gas_instant_water_heater",
  "hyozflwormkccynw": "rv_ac_controller",
  "iepip6u1zyet9up1": "gas_instant_water_heater",
  "kaaz0cxdgvroa6qp": "water_purifier_faucet_comm",
  "l1qu0ab3xq43pnzn": "gas_boiler",
  "lja0jbxm9hdhargs": "water_purifier_faucet_comm",
  "m6wltakzavhgcnpk": "rv_ac_controller",
  "mmg4y0smgfpkmgge": "rv_ac_controller",
  "oekfxto4k2yaglsd": "water_purifier_faucet_comm",
  "ptrtzvzn3e7u8ijm": "water_purifier_heat",
  "pwmhao6ttj9coufl": "gas_boiler",
  "q6viwfyswchiitha": "rv_ac_controller",
  "qiw6gmxajty8zwgd": "gas_instant_water_heater",
  "qpqa79fkvvbf3lqi": "gas_boiler",
  "qrmwyjhwvnekkhas": "gas_boiler",
  "rdcekht56dbiytta": "gas_boiler",
  "rdrqs27qctf11vmn": "water_purifier_faucet_comm",
  "rfqymxbt8xma2yyz": "gas_boiler",
  "rtjt7vtjt6dunoqd": "rv_ac_controller",
  "snqq6cftzk9shssv": "water_purifier_heat",
  "suwbgmdr8sepzqbw": "gas_instant_water_heater",
  "t9t7lj3rhajwsheo": "rv_ac_controller",
  "tic7agibkckvbbyd": "gas_instant_water_heater",
  "twhhzvppvpjunelm": "water_softener",
  "uaaxd0vrmf3ez9zm": "gas_instant_water_heater",
  "uforlynlgj5xx3zg": "rv_ac_controller",
  "ufqk6ynt3urojzdn": "gas_instant_water_heater",
  "uhmj5b0ba31zpme6": "rv_ac_controller",
  "vr9kv5hobztnfvjl": "water_softener",
  "vzsefovko0uvjksm": "rv_ac_controller",
  "wcssrdbcufckhbzk": "water_purifier_faucet_comm",
  "wufkcgfidf57eqzg": "rv_ac_controller",
  "xem9ikmuzmelfjot": "rv_ac_controller",
  "xloeheptudhfapnj": "gas_instant_water_heater",
  "xwwar3mdmhpipujn": "gas_boiler",
  "yhk26gfskjuyafgh": "water_purifier_pureone_hot",
  "z0xsaptrkwdyjy9i": "water_purifier_faucet_comm",
  "zb7g4ffimeyqwvxt": "gas_instant_water_heater",
};

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
  const order: FaultFamilyId[] = ['gas_boiler','gas_instant_water_heater','zero_cold_water_heater','rv_ac_controller','water_purifier_heat','water_purifier_faucet_comm','water_purifier_pureone_hot','water_softener'];
  for (const fid of order) {
    const codes = FAULT_FAMILY_MEANINGS[fid];
    for (const [label, m] of Object.entries(codes)) {
      if (!DEMO_FAULT_COPY[label]) {
        DEMO_FAULT_COPY[label] = {
          symptom: m.symptom,
          suggestedAction: m.suggestedAction ?? '按产品说明书排查或联系售后。',
        };
      }
    }
  }
})();

