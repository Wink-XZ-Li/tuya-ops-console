export type DeviceBusMessage = {
  bizCode: string;
  ts: number;
  productId?: string;
  deviceId: string;
  payload: Record<string, unknown>;
};
