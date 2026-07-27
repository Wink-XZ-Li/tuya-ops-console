import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommandPanel, functionLabel } from './CommandPanel';

describe('CommandPanel', () => {
  it('renders alias when present, otherwise code', () => {
    expect(functionLabel({ code: 'switch', alias: '主开关' })).toBe('主开关');
    expect(functionLabel({ code: 'temp_set' })).toBe('temp_set');

    render(
      <CommandPanel
        deviceId="demo-001"
        functions={[
          { code: 'switch', type: 'Boolean', alias: '主开关' },
          { code: 'temp_set', type: 'Integer' },
        ]}
        disabled
      />,
    );

    expect(screen.getByText('主开关')).toBeInTheDocument();
    expect(screen.getByText('temp_set')).toBeInTheDocument();
  });
});
