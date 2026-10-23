import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FaultHistoryPanel, type FaultHistoryItem } from './FaultHistoryPanel';

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

const NOW = new Date('2026-10-23T00:00:00.000Z');

function item(partial: Partial<FaultHistoryItem> & Pick<FaultHistoryItem, 'id' | 'faultCode'>): FaultHistoryItem {
  return {
    status: 'closed',
    category: 'fault',
    title: `故障 ${partial.faultCode}`,
    openedAt: '2026-10-11T00:00:00.000Z',
    closedAt: '2026-10-11T01:00:00.000Z',
    conditionStartedAt: '2026-10-11T00:00:00.000Z',
    occurrenceCount: 1,
    closedReason: 'auto_clear',
    closedReasonLabel: '自动恢复',
    symptom: null,
    suggestedAction: null,
    durationMinutes: 60,
    connectivity: false,
    ...partial,
  };
}

const openE1 = item({
  id: 'open-e1',
  status: 'open',
  faultCode: 'E1',
  openedAt: '2026-10-20T00:00:00.000Z',
  closedAt: null,
  conditionStartedAt: '2026-10-20T00:00:00.000Z',
  occurrenceCount: 4,
  closedReason: null,
  closedReasonLabel: null,
  symptom: '火焰故障',
  suggestedAction: '检查燃气供应',
  durationMinutes: 3 * 24 * 60,
});

const closedE1 = item({
  id: 'closed-e1',
  faultCode: 'E1',
  openedAt: '2026-10-02T00:00:00.000Z',
  closedAt: '2026-10-02T02:00:00.000Z',
  conditionStartedAt: '2026-10-02T00:00:00.000Z',
  occurrenceCount: 2,
  symptom: '火焰故障',
  suggestedAction: '检查燃气供应',
  durationMinutes: 120,
  closedReasonLabel: '自动恢复',
});

const bare = item({
  id: 'bare',
  faultCode: 'ZZ',
  symptom: null,
  suggestedAction: null,
  closedReasonLabel: '人工关闭',
  durationMinutes: 30,
});

const extra = ['E2', 'E3', 'E4', 'E6'].map((code, index) =>
  item({
    id: `extra-${code}`,
    faultCode: code,
    suggestedAction: index === 3 ? '第六条建议' : `建议 ${code}`,
    openedAt: new Date(NOW.getTime() - (index + 3) * 24 * 60 * 60_000).toISOString(),
  }),
);

const offline = item({
  id: 'offline',
  status: 'open',
  category: 'connectivity',
  faultCode: 'offline',
  title: '设备离线',
  openedAt: '2026-10-22T12:00:00.000Z',
  closedAt: null,
  conditionStartedAt: '2026-10-22T12:00:00.000Z',
  occurrenceCount: 1,
  closedReason: null,
  closedReasonLabel: null,
  symptom: null,
  suggestedAction: null,
  durationMinutes: 12 * 60,
  connectivity: true,
});

const quality = [openE1, closedE1, bare, ...extra];

describe('FaultHistoryPanel', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (path: string) => {
      const url = new URL(path, 'http://local');
      const include = url.searchParams.get('includeConnectivity') === '1';
      const cursor = url.searchParams.get('cursor');
      const base = include ? [offline, ...quality] : quality;
      if (cursor) {
        return {
          items: [item({ id: 'page-2', faultCode: 'E8', suggestedAction: '第二页建议' })],
          summary: { openCount: 2, openedInRange: quality.length, longestDurationMinutes: 3 * 24 * 60 },
          nextCursor: null,
        };
      }
      return {
        items: base,
        summary: {
          openCount: include ? 2 : 1,
          openedInRange: base.length,
          longestDurationMinutes: 3 * 24 * 60,
        },
        nextCursor: 'next-page',
      };
    });
  });

  it('shows open faults first, repeated codes, dictionary copy, and hides offline until asked', async () => {
    render(<FaultHistoryPanel deviceId="vdevo1" now={NOW} />);

    const openCode = await screen.findByText('3 天前开');
    const closedWhen = screen.getByText('已关 · 持续 2h');
    expect(
      openCode.compareDocumentPosition(closedWhen) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(openCode.closest('.fault-item')).toHaveClass('is-open');
    expect(screen.getAllByText('E1')).toHaveLength(2);
    expect(screen.getAllByText('火焰故障').length).toBeGreaterThan(0);
    expect(screen.getAllByText('检查燃气供应').length).toBeGreaterThan(0);
    expect(screen.getByText('ZZ')).toBeInTheDocument();
    expect(screen.queryByText('离线')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '关单' })).not.toBeInTheDocument();
    expect(screen.queryByText('第六条建议')).not.toBeInTheDocument();

    const firstCall = String(api.mock.calls[0]?.[0]);
    const firstUrl = new URL(firstCall, 'http://local');
    expect(firstUrl.searchParams.get('includeConnectivity')).toBe('0');
    expect(firstUrl.searchParams.get('from')).toBe(
      new Date(NOW.getTime() - 30 * 24 * 60 * 60_000).toISOString(),
    );
    expect(screen.getByRole('button', { name: '近 30 天' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: '展开更多' }));
    expect(screen.getByText('第六条建议')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '含离线' }));
    await waitFor(() => {
      expect(screen.getByText('离线')).toBeInTheDocument();
    });
    expect(screen.getByText('offline').closest('.fault-item')).toHaveClass('is-connectivity');
    expect(screen.getByText('offline').closest('.fault-item')).toHaveClass('is-open');

    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await waitFor(() => {
      expect(screen.getByText('E8')).toBeInTheDocument();
    });
    const moreCall = api.mock.calls.map((call) => String(call[0])).find((path) => path.includes('cursor='));
    expect(moreCall).toContain('cursor=next-page');
    expect(moreCall).toContain('includeConnectivity=1');

    fireEvent.click(screen.getByRole('button', { name: '未关闭 2' }));
    await waitFor(() => {
      expect(api.mock.calls.some((call) => String(call[0]).includes('focus=open'))).toBe(true);
    });
  });
});
