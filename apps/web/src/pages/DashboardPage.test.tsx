import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_MODE_STORAGE_KEY } from '../data-mode/preference';
import { DashboardPage } from './DashboardPage';

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

const payload = {
  startDay: '20261001',
  endDay: '20261030',
  productId: null,
  cachedAt: '2026-10-28T01:00:00.000Z',
  fromCache: false,
  note: '演示数据',
  kpis: {
    activationTotal: 12480,
    activationNew: 420,
    activeLatest: 7410,
    registerTotal: 9680,
    registerNew: 330,
    controlTotal: 190000,
    controlUsers: 120000,
  },
  series: { device: [], register: [], control: [] },
  locations: {
    dateType: 'month',
    items: [{ name: '广东', value: 2860, percentage: '22.92%' }],
  },
  warnings: [],
  virtual: true,
  quotaExhausted: true,
  dataMode: 'virtual' as const,
  virtualReason: 'quota-fallback' as const,
};

describe('DashboardPage virtual data', () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
    api.mockResolvedValue(payload);
  });

  it('auto-switches to virtual data and keeps a manual live choice', async () => {
    render(<DashboardPage />);

    expect(await screen.findByText('试用套餐已用完，当前显示虚拟数据')).toBeInTheDocument();
    expect(screen.getByText('12,480')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '虚拟' })).toHaveAttribute('aria-pressed', 'true');
    expect(api).toHaveBeenCalledWith(expect.stringContaining('dataSource=live'));
    expect(JSON.parse(localStorage.getItem(DATA_MODE_STORAGE_KEY) ?? '{}')).toMatchObject({
      mode: 'virtual',
      manual: false,
      quotaExhausted: true,
    });

    fireEvent.click(screen.getByRole('button', { name: '真实' }));

    expect(await screen.findByText(/不会自动改回/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '真实' })).toHaveAttribute('aria-pressed', 'true');
    expect(api).toHaveBeenLastCalledWith(expect.stringContaining('dataSource=live'));
    expect(api).toHaveBeenLastCalledWith(expect.stringContaining('probe=1'));
    expect(JSON.parse(localStorage.getItem(DATA_MODE_STORAGE_KEY) ?? '{}')).toMatchObject({
      mode: 'live',
      manual: true,
      quotaExhausted: true,
    });
  });
});
