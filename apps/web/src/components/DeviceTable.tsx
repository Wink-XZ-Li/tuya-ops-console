import { Link } from 'react-router-dom';
import { formatFaultInfoDisplay } from '../constants/product-fault-schemas';
import { formatProductLabel } from '../constants/product-names';

export type DeviceRow = {
  deviceId: string;
  name?: string | null;
  productId: string;
  onlineStatus: string;
  lastSeenAt?: string | null;
  faultStatus?: string | null;
  faultInfo?: string | null;
  locationText?: string | null;
  signalStrength?: string | null;
};

type Props = {
  items: DeviceRow[];
};

function faultLabel(status?: string | null): string {
  if (status === 'fault') return '故障';
  if (status === 'normal') return '正常';
  return '未知';
}

export function DeviceTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="muted">暂无设备</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>deviceId</th>
            <th>名称</th>
            <th>产品</th>
            <th>网络状态</th>
            <th>信号强度</th>
            <th>故障情况</th>
            <th>故障信息</th>
            <th>所在城市</th>
            <th>lastSeenAt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.deviceId}>
              <td>
                <Link className="mono" to={`/devices/${encodeURIComponent(d.deviceId)}`}>
                  {d.deviceId}
                </Link>
              </td>
              <td>{d.name ?? '—'}</td>
              <td title={d.productId}>{formatProductLabel(d.productId)}</td>
              <td>
                <span
                  className={
                    d.onlineStatus === 'online'
                      ? 'status-online'
                      : d.onlineStatus === 'offline'
                        ? 'status-offline'
                        : undefined
                  }
                >
                  {d.onlineStatus}
                </span>
              </td>
              <td>{d.signalStrength ?? '—'}</td>
              <td>{faultLabel(d.faultStatus)}</td>
              <td className="mono">{formatFaultInfoDisplay(d.productId, d.faultInfo)}</td>
              <td>{d.locationText ?? '—'}</td>
              <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
