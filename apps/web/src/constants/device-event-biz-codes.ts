/** BizCode options for device event log filters (Tuya message types). */
export const DEVICE_EVENT_BIZ_CODES: Array<{ code: string; label: string }> = [
  { code: 'devicePropertyMessage', label: '设备上报属性' },
  { code: 'deviceEventMessage', label: '设备上报事件' },
  { code: 'deviceActionResponseMessage', label: '设备调用动作结果' },
  { code: 'deviceOnline', label: '设备上线' },
  { code: 'deviceOffline', label: '设备下线' },
  { code: 'deviceTransfer', label: '设备转移' },
  { code: 'deviceBindSpace', label: '设备绑定' },
  { code: 'deviceUnbindSpace', label: '设备解绑' },
  { code: 'deviceNameUpdate', label: '设备属性变更' },
  { code: 'deviceOtaProgress', label: 'OTA升级通知' },
  { code: 'online', label: '设备上线' },
  { code: 'offline', label: '设备离线' },
  { code: 'statusReport', label: '状态上报' },
  { code: 'nameUpdate', label: '修改设备名称' },
  { code: 'dpNameUpdate', label: '修改设备功能点名称' },
  { code: 'bindUser', label: '设备绑定用户' },
  { code: 'delete', label: '删除设备' },
  { code: 'upgradeStatus', label: '设备升级状态' },
  { code: 'event_notify', label: '事件通知' },
  { code: 'userRegisterEvent', label: '用户注册' },
  { code: 'userUpdateEvent', label: '用户更新' },
  { code: 'userDeleteEvent', label: '用户注销' },
];

export function formatBizCodeLabel(code: string): string {
  const hit = DEVICE_EVENT_BIZ_CODES.find((item) => item.code === code);
  return hit ? `${hit.code}（${hit.label}）` : code;
}
