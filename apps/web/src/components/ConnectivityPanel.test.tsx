import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectivityPanel } from './ConnectivityPanel';

const api = vi.hoisted(() => vi.fn());

vi.mock('../api/client', () => ({
  api,
  qs: (params: Record<string, string | number | undefined | null>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      search.set(key, String(value));
    }
    const text = search.toString();
    return text ? `?${text}` : '';
  },
}));

const NOW = new Date('2026-10-23T00:00:00.000Z');

const segments = [
  { state: 'unknown', from: '2026-10-16T00:00:00.000Z', to: '2026-10-20T00:00:00.000Z' },
  { state: 'offline', from: '2026-10-20T00:00:00.000Z', to: '2026-10-20T02:00:00.000Z' },
  { state: 'online', from: '2026-10-20T02:00:00.000Z', to: '2026-10-23T00:00:00.000Z' },
];

describe('ConnectivityPanel', () => {
  beforeEach(() => {
    api.mockReset();
  });

  it('draws a 7-day ribbon and shows the hovered stretch', async () => {
    api.mockResolvedValue({
      from: '2026-10-16T00:00:00.000Z',
      to: '2026-10-23T00:00:00.000Z',
      source: 'deviceEvent',
      segments,
    });

    render(<ConnectivityPanel deviceId="dev-a" now={NOW} />);

    expect(await screen.findByText(/在线 2 天 22 小时/)).toBeInTheDocument();
    expect(screen.getByText(/离线 2 小时/)).toBeInTheDocument();
    expect(screen.getByText('上下线事件，不含故障')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '详情' })).toHaveAttribute('href', '#device-logs');

    const first = new URL(String(api.mock.calls[0]?.[0]), 'http://local');
    expect(first.pathname).toContain('/connectivity');
    expect(first.searchParams.get('from')).toBe('2026-10-16T00:00:00.000Z');

    expect(document.querySelectorAll('.connectivity-seg')).toHaveLength(3);
    expect(document.querySelector('.connectivity-seg.is-online')).toHaveAttribute('data-state', 'online');
    expect(document.querySelector('.connectivity-seg.is-offline')).toHaveAttribute('data-state', 'offline');
    expect(document.querySelector('.connectivity-seg.is-unknown')).toHaveAttribute('data-state', 'unknown');
    expect(document.querySelector('.fault-item')).toBeNull();

    fireEvent.mouseEnter(document.querySelector('.connectivity-seg.is-offline')!);
    const tip = screen.getByRole('tooltip').textContent ?? '';
    expect(tip).toContain('离线');
    expect(tip).toContain('2026-10-20 08:00');
    expect(tip).toContain('2026-10-20 10:00');
    expect(tip).toContain('持续 2 小时');
    expect(document.querySelector('.connectivity-scale')?.textContent).toContain('10/16');
    expect(document.querySelector('.connectivity-scale')?.textContent).toContain('10/23');
  });

  it('stays quiet when the window has no connectivity events', async () => {
    api.mockResolvedValue({
      from: '2026-10-16T00:00:00.000Z',
      to: '2026-10-23T00:00:00.000Z',
      source: 'deviceEvent',
      segments: [
        { state: 'unknown', from: '2026-10-16T00:00:00.000Z', to: '2026-10-23T00:00:00.000Z' },
      ],
    });

    render(<ConnectivityPanel deviceId="dev-a" now={NOW} />);

    expect(await screen.findByText('这段时间没有连通上报，记为未知。')).toBeInTheDocument();
    expect(document.querySelector('.error')).toBeNull();
    expect(document.querySelector('.connectivity-seg.is-unknown')).toBeTruthy();
  });

  it('shows an empty hint instead of throwing when the response has no segments', async () => {
    api.mockResolvedValue({ from: '', to: '', segments: [] });
    render(<ConnectivityPanel deviceId="dev-a" now={NOW} />);
    expect(await screen.findByText('这段时间没有连通上报。')).toBeInTheDocument();
    expect(document.querySelector('.error')).toBeNull();
  });

  it('rejects a manual range longer than 90 days', async () => {
    api.mockResolvedValue({ segments: [] });
    render(<ConnectivityPanel deviceId="dev-a" now={NOW} />);
    fireEvent.change(screen.getByLabelText('开始'), { target: { value: '2026-01-01T00:00' } });
    fireEvent.change(screen.getByLabelText('结束'), { target: { value: '2026-06-01T00:00' } });
    expect(await screen.findByText('区间不能超过 90 天')).toBeInTheDocument();
  });
});
