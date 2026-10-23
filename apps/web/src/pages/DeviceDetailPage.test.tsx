import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceDetailPage } from './DeviceDetailPage';

const api = vi.hoisted(() => vi.fn());

vi.mock('../api/client', () => ({
  api,
  qs: (params: Record<string, string | number | undefined | null>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      search.set(key, String(value));
    }
    const s = search.toString();
    return s ? `?${s}` : '';
  },
}));

const device = {
  deviceId: 'vdevo1',
  productId: 'pid-1',
  name: '客厅热水器',
  onlineStatus: 'online',
  statusJson: {},
  faultStatus: 'normal',
  faultInfo: null,
  locationText: '杭州',
  signalStrength: '-40 dBm',
  bindings: [],
  openAlertCount: 0,
};

describe('DeviceDetailPage fault history placement', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (path: string) => {
      if (path.includes('/fault-history')) {
        return {
          items: [],
          summary: { openCount: 0, openedInRange: 0, longestDurationMinutes: null },
          nextCursor: null,
        };
      }
      if (path.includes('/dp-trends')) {
        return {
          from: '2026-10-16T00:00:00.000Z',
          to: '2026-10-23T00:00:00.000Z',
          bucket: '1h',
          series: [],
        };
      }
      if (path.includes('/functions')) return [];
      if (path.includes('/events')) return { items: [], total: 0 };
      if (path.includes('/cloud-logs')) {
        return { list: [], hasMore: false, startTime: 1, endTime: 2 };
      }
      if (path.includes('/firmware')) return { upgrades: [] };
      return device;
    });
  });

  it('places 历史故障 under the status set and above firmware, without a close action', async () => {
    render(
      <MemoryRouter initialEntries={['/devices/vdevo1']}>
        <Routes>
          <Route path="/devices/:deviceId" element={<DeviceDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const history = await screen.findByRole('region', { name: '历史故障' });
    const trends = await screen.findByRole('region', { name: '参数走势' });
    const status = screen.getByRole('heading', { name: /状态集/ });
    const firmware = screen.getByRole('heading', { name: '固件' });
    expect(status.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(history.compareDocumentPosition(trends) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(trends.compareDocumentPosition(firmware) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关单' })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: '展开状态集' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('暂无状态点')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '自动刷新' })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: '收起状态集' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('暂无状态点')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '自动刷新' })).toBeInTheDocument();
  });
});