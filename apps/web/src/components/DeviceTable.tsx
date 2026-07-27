import { Link } from 'react-router-dom';

export type DeviceRow = {
  deviceId: string;
  name?: string | null;
  productId: string;
  onlineStatus: string;
  lastSeenAt?: string | null;
};

type Props = {
  items: DeviceRow[];
};

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
            <th>productId</th>
            <th>在线</th>
            <th>lastSeenAt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.deviceId}>
              <td>
                <Link to={`/devices/${encodeURIComponent(d.deviceId)}`}>
                  {d.deviceId}
                </Link>
              </td>
              <td>{d.name ?? '—'}</td>
              <td>{d.productId}</td>
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
              <td>{d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
