import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../components/AppLayout';
import { SystemHealthPage } from './SystemHealthPage';

const api = vi.hoisted(() => vi.fn());
const writeText = vi.hoisted(() => vi.fn());

vi.mock('../api/client', () => ({
  api,
}));

const report = {
  status: 'critical' as const,
  checkedAt: '2026-10-22T01:00:00.000Z',
  durationMs: 42,
  components: [
    { key: 'api', label: 'API', status: 'healthy' as const, summary: '本接口可响应' },
    { key: 'mysql', label: 'MySQL', status: 'healthy' as const, summary: 'SELECT 1 成功' },
    { key: 'redpanda', label: 'Redpanda', status: 'healthy' as const, summary: 'broker 可达' },
    {
      key: 'kafka_consumer',
      label: 'Kafka 消费',
      status: 'healthy' as const,
      summary: '消费组 Stable，lag 0',
    },
    {
      key: 'bridge',
      label: 'Bridge',
      status: 'critical' as const,
      summary: '事件停更，但 Device.lastSeenAt 仍新',
    },
    {
      key: 'device_event_freshness',
      label: '事件新鲜度',
      status: 'critical' as const,
      summary: '事件严重过期，lastSeen 仍新',
    },
    { key: 'demo_mode', label: '运行模式', status: 'healthy' as const, summary: 'DEMO_MODE=live' },
  ],
  issues: [
    {
      code: 'BRIDGE_STALE',
      severity: 'crit' as const,
      title: 'Bridge 假活',
      since: '2026-10-22T00:40:00.000Z',
      impact: '连接还在，但已经不再把设备事件写进队列',
      steps: ['在仓库根目录执行 pnpm dev:bridge'],
      commands: ['pnpm dev:bridge 2>&1 | tee -a logs/bridge.log'],
      status: 'open' as const,
    },
    {
      code: 'EVENT_GAP',
      severity: 'crit' as const,
      title: '事件停更但设备仍像在线',
      since: '2026-10-22T00:40:00.000Z',
      impact: '勿只靠同步',
      steps: ['勿只点「同步设备」'],
      commands: ['pnpm dev:bridge'],
      status: 'open' as const,
    },
  ],
};

describe('SystemHealthPage', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockResolvedValue(report);
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('shows the runbook with copyable commands and no restart action', async () => {
    render(<SystemHealthPage />);

    expect(await screen.findByText('BRIDGE_STALE')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '系统健康' })).toBeInTheDocument();
    expect(screen.getByText(/不是设备故障码/)).toBeInTheDocument();
    expect(screen.getByText('pnpm dev:bridge')).toBeInTheDocument();
    expect(screen.getByText('勿只点「同步设备」')).toBeInTheDocument();
    expect(screen.getAllByText('20 分钟').length).toBeGreaterThan(0);
    expect(screen.getByRole('checkbox', { name: '每 60 秒刷新' })).toBeChecked();
    expect(screen.queryByRole('button', { name: /重启|自愈/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '复制全部命令' })[0]);
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('pnpm dev:bridge'));
    });

    fireEvent.click(screen.getByRole('button', { name: '立即探测' }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith('/api/system-health/check', { method: 'POST' });
    });
    expect(api).toHaveBeenCalledWith('/api/system-health');
  });

  it('shows the API as unreachable without inventing a restart button', async () => {
    api.mockRejectedValue(new Error('Failed to fetch'));
    render(<SystemHealthPage />);

    expect(await screen.findByText('无响应')).toBeInTheDocument();
    expect(screen.queryByText('BRIDGE_DOWN')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /重启|自愈/ })).not.toBeInTheDocument();
  });
});

describe('system health navigation', () => {
  it('lists 系统健康 apart from 告警 and 故障看板', () => {
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '系统健康' })).toHaveAttribute('href', '/system-health');
    expect(screen.getByRole('link', { name: '告警' })).toHaveAttribute('href', '/alerts');
    expect(screen.getByRole('link', { name: '故障看板' })).toHaveAttribute('href', '/analytics/faults');
    expect(screen.queryByRole('link', { name: '故障字典' })).not.toBeInTheDocument();
  });

  it('shows 故障字典 for operators', () => {
    localStorage.setItem('ops_role', 'operator');
    render(
      <MemoryRouter>
        <AppLayout />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: '故障字典' })).toHaveAttribute('href', '/fault-codes');
    localStorage.removeItem('ops_role');
  });
});
