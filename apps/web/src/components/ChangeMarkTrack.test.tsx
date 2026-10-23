import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChangeMarkTrack, changeMarkerLegend } from './ChangeMarkTrack';

const markers = [
  {
    t: '2026-10-20T00:00:00.000Z',
    kind: 'firmware' as const,
    label: '固件升级',
    detail: '1.0.0 → 1.0.2',
  },
  {
    t: '2026-10-22T03:00:00.000Z',
    kind: 'command' as const,
    label: '指令 switch',
    detail: 'true',
  },
];

describe('ChangeMarkTrack', () => {
  it('draws nothing when there are no markers', () => {
    const view = render(<ChangeMarkTrack markers={[]} from="2026-10-16T00:00:00.000Z" to="2026-10-23T00:00:00.000Z" />);
    expect(view.container).toBeEmptyDOMElement();
    expect(changeMarkerLegend([])).toBeNull();
  });

  it('places marks on the window and shows the shanghai time on hover', () => {
    render(
      <div className="marker-host">
        <ChangeMarkTrack markers={markers} from="2026-10-16T00:00:00.000Z" to="2026-10-23T00:00:00.000Z" />
      </div>,
    );

    const firmware = document.querySelector('.change-mark.is-firmware');
    expect(firmware).toHaveAttribute('data-t', '2026-10-20T00:00:00.000Z');
    expect(firmware?.getAttribute('style')).toContain('57.142');
    expect(document.querySelector('.change-mark.is-command')).toBeTruthy();
    expect(changeMarkerLegend(markers)).toContain('固件变更');
    expect(changeMarkerLegend(markers)).toContain('不表示原因');

    fireEvent.mouseEnter(firmware!);
    const tip = screen.getByRole('tooltip').textContent ?? '';
    expect(tip).toContain('固件升级');
    expect(tip).toContain('1.0.0 → 1.0.2');
    expect(tip).toContain('2026-10-20 08:00');
  });
});