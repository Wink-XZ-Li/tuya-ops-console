import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsagePanel } from './UsagePanel';

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

const days = [
  { date: '2026-10-20', value: 2 },
  { date: '2026-10-22', value: 5 },
];

describe('UsagePanel', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (path: string) => {
      const url = new URL(path, 'http://local');
      const from = url.searchParams.get('from') ?? '';
      const wide = from.startsWith('2026-09-23');
      return {
        metricId: url.searchParams.get('metric'),
        name: '用水量',
        unit: 'G',
        from,
        to: url.searchParams.get('to'),
        total: wide ? 9 : 7,
        dailyAvg: wide ? 3 : 3.5,
        peakDay: { date: '2026-10-22', value: 5 },
        days,
        note: '表计出现回落，已按清零处理：当日只计入回落后的读数，不出现负用量。',
      };
    });
  });

  it('stays hidden when the product has no usage meters', () => {
    const view = render(<UsagePanel deviceId="dev-a" productId="0wyzpxylwzjx6gej" now={NOW} />);
    expect(view.container).toBeEmptyDOMElement();
    expect(api).not.toHaveBeenCalled();
  });

  it('draws daily bars, keeps gaps empty, and matches the 7 and 30 day totals', async () => {
    render(<UsagePanel deviceId="dev-a" productId="1x0qz5jtlabxywcg" now={NOW} />);

    expect(await screen.findByText('本区间合计 7 G')).toBeInTheDocument();
    expect(screen.getByText('日均 3.5 G')).toBeInTheDocument();
    expect(screen.getByText(/峰值日 2026-10-22 5 G/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '用水量' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '用气量' })).toBeInTheDocument();

    const first = new URL(String(api.mock.calls[0]?.[0]), 'http://local');
    expect(first.searchParams.get('metric')).toBe('water');
    expect(first.searchParams.get('from')).toBe('2026-10-16T00:00:00.000Z');

    expect(document.querySelectorAll('.usage-bar')).toHaveLength(2);
    expect(document.querySelector('.usage-bar[data-value="5"]')?.getAttribute('title')).toContain('2026-10-22 5 G');
    expect(document.querySelector('[data-date="2026-10-21"]')?.getAttribute('data-gap')).toBe('1');
    expect(document.querySelector('[data-date="2026-10-21"] .usage-bar')).toBeNull();
    expect(screen.getByText(/不出现负用量/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '近 30 天' }));
    expect(await screen.findByText('本区间合计 9 G')).toBeInTheDocument();
    expect(screen.getByText('日均 3 G')).toBeInTheDocument();
    const last = api.mock.calls.map((call) => String(call[0])).at(-1) ?? '';
    expect(new URL(last, 'http://local').searchParams.get('from')).toBe('2026-09-23T00:00:00.000Z');

    fireEvent.click(screen.getByRole('tab', { name: '用气量' }));
    await waitFor(() => {
      expect(api.mock.calls.some((call) => String(call[0]).includes('metric=gas'))).toBe(true);
    });
  });
});
