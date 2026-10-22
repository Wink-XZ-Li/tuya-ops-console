import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { FaultCodeDictionaryPage } from './FaultCodeDictionaryPage';

const api = vi.hoisted(() => vi.fn());

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return { ...actual, api };
});

const heater = [
  row('e1', 'E1', 0, null),
  row('e3', 'E3', 1, '风机故障'),
  row('e4', 'E4', 2, null),
  row('e2', 'E2', 3, null),
];

function row(id: string, label: string, sortOrder: number, symptom: string | null) {
  return {
    id,
    productId: 'nohrp3vbmef7vxvx',
    code: 'fault',
    label,
    sortOrder,
    symptom,
    cause: null,
    suggestedAction: symptom ? '检查风机供电、转速与风道是否堵塞。' : null,
    countInQualityRate: true,
    notifyAftersales: false,
  };
}

describe('FaultCodeDictionaryPage', () => {
  beforeEach(() => {
    api.mockReset();
    let items = heater.map((item) => ({ ...item }));
    api.mockImplementation((path: string, options?: RequestInit) => {
      const method = options?.method ?? 'GET';
      if (method === 'GET' && path.startsWith('/api/fault-codes?')) {
        return Promise.resolve(items);
      }
      if (method === 'GET' && path.startsWith('/api/fault-codes/')) {
        const id = path.split('/').pop();
        return Promise.resolve(items.find((item) => item.id === id));
      }
      if (method === 'PATCH') {
        const id = path.split('/').pop();
        const body = JSON.parse(String(options?.body));
        if (id === 'e2' && body.sortOrder !== 3) {
          return Promise.reject(
            new ApiError(400, {
              message: '热水器 nohrp3vbmef7vxvx 的故障码顺序必须保持 E1,E3,E4,E2',
            }),
          );
        }
        items = items.map((item) => (item.id === id ? { ...item, ...body } : item));
        return Promise.resolve(items.find((item) => item.id === id));
      }
      if (method === 'DELETE') {
        return Promise.reject(
          new ApiError(400, { message: '不能删除热水器 nohrp3vbmef7vxvx 位图已定义的故障码 E1' }),
        );
      }
      return Promise.reject(new Error(`unexpected ${method} ${path}`));
    });
  });

  it('shows the water heater labels as E1, E3, E4, E2 and saves a symptom', async () => {
    render(<FaultCodeDictionaryPage />);

    expect(await screen.findByRole('cell', { name: 'E2' })).toBeInTheDocument();
    const labels = screen
      .getAllByRole('row')
      .slice(1)
      .map((line) => within(line).getAllByRole('cell')[1]?.textContent);
    expect(labels).toEqual(['E1', 'E3', 'E4', 'E2']);
    expect(screen.getByRole('cell', { name: '风机故障' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '编辑 E3' }));
    const symptom = await screen.findByLabelText('现象');
    fireEvent.change(symptom, { target: { value: '现场改成风轮卡滞' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(api).toHaveBeenCalledWith(
        '/api/fault-codes/e3',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
    expect(await screen.findByRole('cell', { name: '现场改成风轮卡滞' })).toBeInTheDocument();
  });

  it('shows the rejection when the water heater order is changed or a bitmap label is deleted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<FaultCodeDictionaryPage />);
    expect(await screen.findByRole('cell', { name: 'E2' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '编辑 E2' }));
    fireEvent.change(await screen.findByLabelText('sortOrder'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText(/顺序必须保持 E1,E3,E4,E2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除 E1' }));
    expect(await screen.findByText(/不能删除热水器/)).toBeInTheDocument();
  });
});
