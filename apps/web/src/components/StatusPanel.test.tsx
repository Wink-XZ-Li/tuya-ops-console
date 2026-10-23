import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusPanel } from './StatusPanel';

const functions = Array.from({ length: 12 }, (_, index) => ({
  code: `dp_${index}`,
  name: `点${index}`,
  type: 'value',
  mode: 'ro',
  sortOrder: index,
}));

describe('StatusPanel', () => {
  it('shows ten rows and reveals the rest with 展开更多', () => {
    render(
      <StatusPanel
        deviceId="dev-a"
        functions={functions}
        statusJson={Object.fromEntries(functions.map((fn) => [fn.code, indexValue(fn.code)]))}
      />,
    );

    expect(screen.getByText('点0')).toBeInTheDocument();
    expect(screen.getByText('点9')).toBeInTheDocument();
    expect(screen.queryByText('点10')).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11);

    fireEvent.click(screen.getByRole('button', { name: '展开更多（2）' }));
    expect(screen.getByText('点11')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(13);

    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(screen.queryByText('点10')).not.toBeInTheDocument();
  });
});

function indexValue(code: string): number {
  return Number(code.slice(3));
}
