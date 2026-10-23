import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DpTrendPanel } from './DpTrendPanel';

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

const series = [
  {
    dpId: 'temp_out',
    name: '出水温度',
    unit: '℃',
    points: [
      { t: '2026-10-20T00:00:00.000Z', avg: 40, min: 38, max: 42 },
      { t: '2026-10-20T02:00:00.000Z', avg: 41, min: 39, max: 44 },
    ],
  },
  {
    dpId: 'temp_in',
    name: '进水温度',
    unit: '℃',
    points: [{ t: '2026-10-20T00:00:00.000Z', avg: 18, min: 17, max: 19 }],
  },
  {
    dpId: 'ph',
    name: 'PH采暖最大比例阀电流',
    unit: null,
    points: [
      { t: '2026-10-20T00:00:00.000Z', avg: 80, min: 80, max: 80 },
      { t: '2026-10-20T02:00:00.000Z', avg: 81, min: 81, max: 81 },
    ],
  },
  {
    dpId: 'lhd',
    name: 'LH-D（大气式）卫浴最大比例阀电流',
    unit: null,
    points: [{ t: '2026-10-20T00:00:00.000Z', avg: 90, min: 90, max: 90 }],
  },
  {
    dpId: 'temp_set',
    name: '目标温度',
    unit: '℃',
    points: [
      { t: '2026-10-20T00:00:00.000Z', avg: 45, min: 45, max: 45 },
      { t: '2026-10-20T02:00:00.000Z', avg: 46, min: 46, max: 46 },
    ],
  },
  {
    dpId: 'gas_consumption',
    name: '耗气量',
    unit: 'm³',
    points: [{ t: '2026-10-20T00:00:00.000Z', avg: 3, min: 3, max: 3 }],
  },
  {
    dpId: 'runtime',
    name: '运行时间',
    unit: '分钟',
    points: [{ t: '2026-10-20T00:00:00.000Z', avg: 12, min: 12, max: 12 }],
  },
];

describe('DpTrendPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private readonly cb: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.cb = cb;
        }
        observe() {
          this.cb(
            [{ contentRect: { width: 640, height: 260 } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
        }
        unobserve() {}
        disconnect() {}
      },
    );
    api.mockImplementation(async (path: string) => {
      const url = new URL(path, 'http://local');
      if (path.includes('/dp-trends')) {
        if (path.includes('/empty-dev/')) {
          return {
            from: url.searchParams.get('from'),
            to: url.searchParams.get('to'),
            bucket: url.searchParams.get('bucket'),
            series: [],
          };
        }
        return {
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
          bucket: url.searchParams.get('bucket'),
          series,
        };
      }
      if (path.includes('/fault-history')) {
        return {
          items: [
            {
              id: 'f1',
              status: 'closed',
              faultCode: 'E1',
              title: '故障 E1',
              openedAt: '2026-10-20T00:00:00.000Z',
              closedAt: '2026-10-20T02:00:00.000Z',
              conditionStartedAt: '2026-10-20T00:00:00.000Z',
              connectivity: false,
            },
          ],
          nextCursor: null,
        };
      }
      throw new Error(`unexpected ${path}`);
    });
  });

  it('connects real buckets into one line and hides PH and LHD', async () => {
    render(<DpTrendPanel deviceId="dev-a" productId="pid-a" now={NOW} />);

    expect(await screen.findByText('常用 DP：出水温度、进水温度')).toBeInTheDocument();
    const first = new URL(String(api.mock.calls[0]?.[0]), 'http://local');
    expect(first.searchParams.get('bucket')).toBe('1h');
    expect(first.searchParams.get('from')).toBe('2026-10-16T00:00:00.000Z');
    expect(first.searchParams.get('dpIds')).toBeNull();
    expect(document.querySelector('circle')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '展开' }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-dp="temp_out"] circle')).toHaveLength(2);
    });
    const charts = document.querySelectorAll('.dp-trend-chart');
    expect(charts).toHaveLength(2);
    const series = document.querySelector('[data-dp="temp_out"]');
    const other = document.querySelector('[data-dp="temp_in"]');
    expect(series).not.toBe(other);
    expect(series?.querySelector('svg')).not.toBe(other?.querySelector('svg'));
    const line = series?.querySelector('.dp-trend-line');
    const band = series?.querySelector('.dp-trend-band');
    expect(series?.getAttribute('data-runs')).toBe('1');
    expect(line?.tagName.toLowerCase()).toBe('polyline');
    expect(line?.getAttribute('points')?.trim().split(/\s+/)).toHaveLength(2);
    expect(band?.tagName.toLowerCase()).toBe('polygon');
    expect(band?.getAttribute('points')?.trim().split(/\s+/)).toHaveLength(4);
    expect(series?.querySelector('path')).toBeNull();
    expect(series?.querySelectorAll('.dp-trend-line')).toHaveLength(1);
    for (const chart of [series, other]) {
      const ticks = chart?.querySelectorAll('.dp-trend-x') ?? [];
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks[0]?.getAttribute('data-t')).toBe('2026-10-16T00:00:00.000Z');
      expect(ticks[ticks.length - 1]?.getAttribute('data-t')).toBe('2026-10-23T00:00:00.000Z');
      expect(ticks[0]?.textContent?.trim()).not.toBe('');
    }
    expect(document.querySelector('[data-dp="ph"]')).toBeNull();
    expect(document.querySelector('[data-dp="lhd"]')).toBeNull();
    expect(document.querySelector('[data-dp="temp_set"]')).toBeNull();
    expect(document.querySelector('[data-dp="gas_consumption"]')).toBeNull();
    expect(document.querySelector('[data-dp="runtime"]')).toBeNull();
    expect(screen.queryByText(/耗气量/)).not.toBeInTheDocument();
    expect(screen.queryByText(/运行时间/)).not.toBeInTheDocument();
    expect(screen.queryByText(/PH采暖/)).not.toBeInTheDocument();
    expect(screen.queryByText(/LH-D/)).not.toBeInTheDocument();
    expect(screen.queryByText(/目标温度/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /目标温度/ })).not.toBeInTheDocument();
    expect(
      [...document.querySelectorAll('[data-avg]')].some((node) => node.getAttribute('data-avg') === '0'),
    ).toBe(false);
    expect(document.querySelector('[data-avg="40"] title')?.textContent).toContain('40（38–42）');

    fireEvent.click(screen.getByRole('checkbox', { name: '对比故障' }));
    await waitFor(() => {
      expect(document.querySelector('[data-role="fault"]')).toBeTruthy();
    });
    const chart = document.querySelector('[data-dp="temp_out"]');
    const point = chart?.querySelector('[data-t="2026-10-20T00:00:00.000Z"]');
    const fault = chart?.querySelector('[data-start="2026-10-20T00:00:00.000Z"]');
    expect(point?.getAttribute('data-x')).toBe(fault?.getAttribute('data-x'));
    const faultCall = api.mock.calls.map((call) => String(call[0])).find((path) => path.includes('/fault-history'));
    expect(faultCall).toContain('from=2026-10-16T00%3A00%3A00.000Z');
    expect(faultCall).toContain('includeConnectivity=0');

    fireEvent.click(screen.getByRole('button', { name: '近 24 小时' }));
    await waitFor(() => {
      expect(
        api.mock.calls.some((call) => String(call[0]).includes('bucket=5min')),
      ).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: '近 30 天' }));
    await waitFor(() => {
      expect(api.mock.calls.some((call) => String(call[0]).includes('bucket=1d'))).toBe(true);
    });

    fireEvent.click(screen.getByRole('checkbox', { name: '出水温度 ℃' }));
    await waitFor(() => {
      expect(readLastDpIds('dev-a')).toBe('temp_in');
    });
    expect(localStorage.getItem('ops.dpTrends.pid-a')).toBe(JSON.stringify(['temp_in']));
  });

  it('remembers the product selection and stays quiet when there is no series', async () => {
    localStorage.setItem('ops.dpTrends.pid-a', JSON.stringify(['temp_in']));
    const first = render(<DpTrendPanel deviceId="dev-a" productId="pid-a" now={NOW} />);
    await waitFor(() => expect(readLastDpIds('dev-a')).toBe('temp_in'));
    first.unmount();

    render(<DpTrendPanel deviceId="dev-b" productId="pid-b" now={NOW} />);
    await waitFor(() => {
      expect(api.mock.calls.some((call) => String(call[0]).includes('/devices/dev-b/dp-trends'))).toBe(true);
    });
    const other = api.mock.calls
      .map((call) => String(call[0]))
      .filter((path) => path.includes('/devices/dev-b/dp-trends'))
      .at(-1);
    expect(other).not.toContain('dpIds=');

    render(<DpTrendPanel deviceId="empty-dev" productId="pid-empty" now={NOW} />);
    fireEvent.click(screen.getAllByRole('button', { name: '展开' }).at(-1)!);
    expect(
      await screen.findByText(/没有数值上报/),
    ).toHaveTextContent('桥接没有把属性事件写进来');
  });
});

function readLastDpIds(deviceId: string): string | null {
  const path = api.mock.calls
    .map((call) => String(call[0]))
    .filter((item) => item.includes(`/devices/${deviceId}/dp-trends`))
    .at(-1);
  if (!path) return null;
  return new URL(path, 'http://local').searchParams.get('dpIds');
}
