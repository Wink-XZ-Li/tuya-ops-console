import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusBarPanel } from './StatusBarPanel';

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

const bars = [
  {
    dpId: 'work_state',
    name: '工作状态',
    type: 'enum',
    range: ['code_standby', 'hot_standby', 'heating'],
    segments: [
      {
        tStart: '2026-10-16T00:00:00.000Z',
        tEnd: '2026-10-20T00:00:00.000Z',
        value: 'code_standby',
        label: '冷待机',
      },
      {
        tStart: '2026-10-20T00:00:00.000Z',
        tEnd: '2026-10-20T02:00:00.000Z',
        value: 'heating',
        label: '加热',
      },
    ],
  },
  {
    dpId: 'flame_status',
    name: '火焰状态',
    type: 'bool',
    range: [],
    segments: [
      {
        tStart: '2026-10-16T00:00:00.000Z',
        tEnd: '2026-10-23T00:00:00.000Z',
        value: null,
        label: '未知',
      },
    ],
  },
];

describe('StatusBarPanel', () => {
  beforeEach(() => {
    api.mockReset();
  });

  it('stays hidden when the product has no status-bar DPs', () => {
    const view = render(<StatusBarPanel deviceId="dev-a" productId="0wyzpxylwzjx6gej" now={NOW} />);
    expect(view.container).toBeEmptyDOMElement();
    expect(api).not.toHaveBeenCalled();
  });

  it('draws one ribbon per state and shows the hovered stretch', async () => {
    api.mockResolvedValue({
      from: '2026-10-16T00:00:00.000Z',
      to: '2026-10-23T00:00:00.000Z',
      bars,
    });
    render(<StatusBarPanel deviceId="dev-a" productId="1x0qz5jtlabxywcg" now={NOW} />);

    expect(await screen.findByText('工作状态')).toBeInTheDocument();
    expect(screen.getByText('火焰状态')).toBeInTheDocument();
    expect(screen.getByText('枚举与布尔，不含数值')).toBeInTheDocument();
    expect(screen.getByText('冷待机')).toBeInTheDocument();
    expect(screen.getByText('加热')).toBeInTheDocument();

    const first = new URL(String(api.mock.calls[0]?.[0]), 'http://local');
    expect(first.pathname).toContain('/status-bars');
    expect(first.searchParams.get('from')).toBe('2026-10-16T00:00:00.000Z');

    const heating = document.querySelector('.status-seg.is-v2');
    const standby = document.querySelector('.status-seg.is-v0');
    expect(heating).toHaveAttribute('data-value', 'heating');
    expect(standby).toHaveAttribute('data-value', 'code_standby');
    expect(document.querySelector('.status-seg.is-unknown')).toHaveAttribute('data-value', '');

    fireEvent.mouseEnter(heating!);
    const tip = screen.getByRole('tooltip').textContent ?? '';
    expect(tip).toContain('加热');
    expect(tip).toContain('2026-10-20 08:00');
    expect(tip).toContain('2026-10-20 10:00');
    expect(tip).toContain('持续 2 小时');
    expect(document.querySelector('.connectivity-scale')?.textContent).toContain('10/16');
  });

  it('shows an unknown ribbon instead of throwing when nothing was reported', async () => {
    api.mockResolvedValue({
      from: '2026-10-16T00:00:00.000Z',
      to: '2026-10-23T00:00:00.000Z',
      bars: [bars[1]],
    });
    render(<StatusBarPanel deviceId="dev-a" productId="1x0qz5jtlabxywcg" now={NOW} />);
    expect(await screen.findByText('这段时间没有状态上报，记为未知。')).toBeInTheDocument();
    expect(document.querySelector('.error')).toBeNull();
    expect(document.querySelector('.status-seg.is-unknown')).toBeTruthy();
  });

  it('rejects a manual range longer than 90 days', async () => {
    api.mockResolvedValue({ bars: [] });
    render(<StatusBarPanel deviceId="dev-a" productId="1x0qz5jtlabxywcg" now={NOW} />);
    fireEvent.change(await screen.findByLabelText('开始'), { target: { value: '2026-01-01T00:00' } });
    fireEvent.change(screen.getByLabelText('结束'), { target: { value: '2026-06-01T00:00' } });
    expect(await screen.findByText('区间不能超过 90 天')).toBeInTheDocument();
    expect(screen.queryByText('这段时间没有状态上报。')).not.toBeInTheDocument();
  });
});