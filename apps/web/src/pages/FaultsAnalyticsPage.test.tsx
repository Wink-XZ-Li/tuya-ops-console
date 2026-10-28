import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatProductLabel } from '../constants/product-names';
import { FaultsAnalyticsPage } from './FaultsAnalyticsPage';

const api = vi.hoisted(() => vi.fn());

vi.mock('../api/client', () => ({
  api,
  qs: (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    const text = search.toString();
    return text ? `?${text}` : '';
  },
}));

const heater = 'nohrp3vbmef7vxvx';
const rv = 'uhmj5b0ba31zpme6';
const switchPid = 'qxjzruuqz40bty7e';

describe('FaultsAnalyticsPage fault codes', () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
    api.mockResolvedValue({
      startDay: '20261001',
      endDay: '20261022',
      productId: null,
      kpis: {
        faultDevicesNow: 0,
        openAlerts: 0,
        avgMttrMinutes: null,
        avgDurationMinutes: null,
        qualityFaultDevices: 0,
        inServiceDevices: 3,
        qualityFaultRate: 0,
        pendingDeviceCount: 0,
        surveyFault: null,
      },
      dailyTrend: [],
      faultCodeHistogram: [
        { productId: heater, faultCode: 'E3', count: 19 },
        { productId: rv, faultCode: 'E3', count: 19 },
      ],
      correlation: [
        { productId: rv, faultCode: 'E3', newCount: 19, liveFaultDevices: 0 },
        { productId: heater, faultCode: 'E1', newCount: 16, liveFaultDevices: 0 },
        { productId: switchPid, faultCode: 'E0', newCount: 18, liveFaultDevices: 0 },
        { productId: heater, faultCode: 'E3', newCount: 19, liveFaultDevices: 0 },
      ],
      byLocation: [],
      warnings: [],
    });
  });

  it('splits fault codes into one section per product', async () => {
    render(
      <MemoryRouter>
        <FaultsAnalyticsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '故障码分析' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '故障码分布' })).not.toBeInTheDocument();

    const headings = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
    expect(headings).toEqual([
      formatProductLabel(heater),
      formatProductLabel(rv),
      formatProductLabel(switchPid),
    ]);

    const heaterSection = screen.getByRole('region', { name: formatProductLabel(heater) });
    expect(within(heaterSection).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      'E3',
      'E1',
    ]);
    expect(within(heaterSection).queryByRole('cell', { name: 'E0' })).not.toBeInTheDocument();
    expect(within(heaterSection).queryByText(formatProductLabel(rv))).not.toBeInTheDocument();
  });
});
