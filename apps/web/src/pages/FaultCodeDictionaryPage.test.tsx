import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { formatProductLabel } from '../constants/product-names';
import { FaultCodeDictionaryPage } from './FaultCodeDictionaryPage';

const api = vi.hoisted(() => vi.fn());

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return { ...actual, api };
});

const heater = 'nohrp3vbmef7vxvx';
const boilerA = '7sylzgrdnnq2w5mo';
const boilerB = '90wi2aimyqstn9qc';

function code(id: string, label: string, sortOrder: number, symptom: string | null = null) {
  return {
    id,
    code: 'fault',
    label,
    sortOrder,
    symptom,
    cause: null,
    suggestedAction: null,
    countInQualityRate: true,
    notifyAftersales: false,
  };
}

const groups = [
  {
    id: 'wh',
    name: '西屋即热旋钮款 · E1,E3,E4,E2',
    productIds: [heater],
    codes: [code('e1', 'E1', 0), code('e3', 'E3', 1, '过热保护'), code('e4', 'E4', 2), code('e2', 'E2', 3)],
  },
  {
    id: 'boiler',
    name: '壁挂炉 · E0,E1',
    productIds: [boilerA, boilerB],
    codes: [code('b0', 'E0', 0, '系统水路异常'), code('b1', 'E1', 1, '点火失败或残火，伪火')],
  },
];

describe('FaultCodeDictionaryPage', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation((path: string, options?: RequestInit) => {
      const method = options?.method ?? 'GET';
      if (method === 'GET' && path === '/api/fault-code-groups') return Promise.resolve(groups);
      if (method === 'POST' && path === '/api/fault-code-groups') {
        const body = JSON.parse(String(options?.body));
        return Promise.resolve({ id: 'new', name: body.name, productIds: [], codes: [] });
      }
      if (method === 'PATCH' && path === '/api/fault-code-groups/wh') {
        const body = JSON.parse(String(options?.body));
        const e2 = body.codes?.find((item: { label: string }) => item.label === 'E2');
        if (e2 && e2.sortOrder !== 3) {
          return Promise.reject(
            new ApiError(400, {
              message: '热水器 nohrp3vbmef7vxvx 的故障码顺序必须保持 E1,E3,E4,E2',
            }),
          );
        }
        return Promise.resolve({ ...groups[0], ...body, productIds: body.productIds ?? groups[0].productIds });
      }
      return Promise.reject(new Error(`unexpected ${method} ${path}`));
    });
  });

  it('shows one shared code table for a group of products', async () => {
    render(<FaultCodeDictionaryPage />);

    expect(await screen.findByRole('option', { name: /壁挂炉/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('故障组'), { target: { value: 'boiler' } });

    const table = screen.getByRole('table');
    const labels = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
    expect(labels).toEqual(['E0', 'E1']);
    expect(screen.getByText(formatProductLabel(boilerA))).toBeInTheDocument();
    expect(screen.getByText(formatProductLabel(boilerB))).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: 'E0' })).toHaveLength(1);
  });

  it('rejects a water heater reorder and can create a group', async () => {
    render(<FaultCodeDictionaryPage />);
    expect(await screen.findByRole('cell', { name: 'E2' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '编辑 E2' }));
    fireEvent.change(await screen.findByLabelText('sortOrder'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存故障码' }));
    expect(await screen.findByText(/顺序必须保持 E1,E3,E4,E2/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('新故障组名称'), { target: { value: '自定义组' } });
    fireEvent.click(screen.getByRole('button', { name: '新增组' }));
    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/api/fault-code-groups',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
