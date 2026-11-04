import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DevicesPage } from './DevicesPage';

const api = vi.hoisted(() => vi.fn());

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return { ...actual, api };
});

describe('DevicesPage', () => {
  beforeEach(() => {
    api.mockReset();
    localStorage.clear();
  });

  it('does not advertise a 50-device cap and shows a server total past 50', async () => {
    api.mockResolvedValue({
      items: [
        {
          deviceId: 'd-51',
          name: 'unit-51',
          productId: 'uhmj5b0ba31zpme6',
          onlineStatus: 'online',
        },
      ],
      total: 51,
      page: 1,
      pageSize: 20,
    });

    render(
      <MemoryRouter>
        <DevicesPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: '设备' })).toBeInTheDocument();
    expect(screen.queryByText(/设备上限/)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('共 51 台')).toBeInTheDocument();
    });
    expect(api).toHaveBeenCalledWith(expect.stringContaining('pageSize=20'));
    expect(screen.getByText('d-51')).toBeInTheDocument();
  });
});
