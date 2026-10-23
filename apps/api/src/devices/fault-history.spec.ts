import { alertDurationMinutes } from '../alerts/alerts.service';
import {
  FAULT_HISTORY_PAGE_SIZE,
  type FaultHistoryRow,
  closedReasonLabel,
  pageFaultHistory,
  pickFaultCopy,
  selectFaultHistory,
  summarizeFaultHistory,
} from './fault-history';

const NOW = new Date('2026-10-23T00:00:00.000Z');
const FROM = new Date('2026-09-23T00:00:00.000Z');
const TO = NOW;

function row(partial: Partial<FaultHistoryRow> & Pick<FaultHistoryRow, 'id'>): FaultHistoryRow {
  const openedAt = partial.openedAt ?? new Date('2026-10-20T00:00:00.000Z');
  return {
    status: 'closed',
    category: 'fault',
    faultCode: 'E1',
    title: '故障 E1',
    openedAt,
    closedAt: partial.closedAt === undefined ? new Date(openedAt.getTime() + 60 * 60_000) : partial.closedAt,
    conditionStartedAt: partial.conditionStartedAt === undefined ? openedAt : partial.conditionStartedAt,
    occurrenceCount: 1,
    lastSeenAt: null,
    closedReason: 'auto_clear',
    ...partial,
    id: partial.id,
  };
}

describe('fault history selection', () => {
  const openOld = row({
    id: 'open-old',
    status: 'open',
    faultCode: 'E3',
    openedAt: new Date('2026-08-01T00:00:00.000Z'),
    closedAt: null,
    closedReason: null,
  });
  const openRecent = row({
    id: 'open-recent',
    status: 'acked',
    faultCode: 'E1',
    openedAt: new Date('2026-10-20T00:00:00.000Z'),
    closedAt: null,
    closedReason: null,
  });
  const closedRecent = row({
    id: 'closed-recent',
    status: 'closed',
    faultCode: 'E1',
    openedAt: new Date('2026-10-21T00:00:00.000Z'),
    closedAt: new Date('2026-10-21T02:00:00.000Z'),
    closedReason: 'auto_clear',
  });
  const closedOlder = row({
    id: 'closed-older',
    status: 'closed',
    faultCode: 'E1',
    openedAt: new Date('2026-10-01T00:00:00.000Z'),
    closedAt: new Date('2026-10-01T01:00:00.000Z'),
    closedReason: 'manual',
  });
  const closedOutside = row({
    id: 'closed-outside',
    status: 'closed',
    faultCode: 'E5',
    openedAt: new Date('2026-08-02T00:00:00.000Z'),
  });
  const offline = row({
    id: 'offline',
    status: 'open',
    category: 'connectivity',
    faultCode: 'offline',
    title: '设备离线',
    openedAt: new Date('2026-10-22T00:00:00.000Z'),
    closedAt: null,
    closedReason: null,
  });
  const alerts = [closedRecent, offline, closedOutside, openOld, closedOlder, openRecent];

  it('pins unclosed faults and keeps every open/close cycle of the same code', () => {
    const items = selectFaultHistory(alerts, {
      from: FROM,
      to: TO,
      includeConnectivity: false,
    });

    expect(items.map((item) => item.id)).toEqual([
      'open-recent',
      'open-old',
      'closed-recent',
      'closed-older',
    ]);
    expect(items.filter((item) => item.faultCode === 'E1')).toHaveLength(3);
    expect(items.some((item) => item.id === 'offline' || item.id === 'closed-outside')).toBe(false);
    expect(items[0]?.status).not.toBe('closed');
    expect(items[1]?.status).not.toBe('closed');
  });

  it('sorts unclosed faults by start time even when openedAt is older than conditionStartedAt', () => {
    const startedLater = row({
      id: 'started-later',
      status: 'open',
      openedAt: new Date('2026-10-01T00:00:00.000Z'),
      conditionStartedAt: new Date('2026-10-22T00:00:00.000Z'),
      closedAt: null,
      closedReason: null,
    });
    const startedEarlier = row({
      id: 'started-earlier',
      status: 'open',
      openedAt: new Date('2026-10-21T00:00:00.000Z'),
      conditionStartedAt: new Date('2026-10-18T00:00:00.000Z'),
      closedAt: null,
      closedReason: null,
    });
    const items = selectFaultHistory([startedEarlier, startedLater], {
      includeConnectivity: false,
    });
    expect(items.map((item) => item.id)).toEqual(['started-later', 'started-earlier']);
  });

  it('hides pure offline alerts until connectivity is included, and marks them apart in the summary', () => {
    const hidden = selectFaultHistory(alerts, { from: FROM, to: TO, includeConnectivity: false });
    expect(hidden.some((item) => item.faultCode === 'offline')).toBe(false);

    const shown = selectFaultHistory(alerts, { from: FROM, to: TO, includeConnectivity: true });
    expect(shown[0]?.id).toBe('offline');
    expect(shown.some((item) => item.faultCode === 'E1')).toBe(true);

    const quality = summarizeFaultHistory(alerts, {
      from: FROM,
      to: TO,
      includeConnectivity: false,
    }, NOW);
    const withOffline = summarizeFaultHistory(alerts, {
      from: FROM,
      to: TO,
      includeConnectivity: true,
    }, NOW);
    expect(quality.openCount).toBe(2);
    expect(withOffline.openCount).toBe(3);
    expect(quality.openedInRange).toBe(3);
    expect(quality.longestDurationMinutes).toBe(alertDurationMinutes(openOld, NOW));
  });

  it('filters to unclosed or in-range opens without dropping the other summary basis', () => {
    const openOnly = selectFaultHistory(alerts, {
      from: FROM,
      to: TO,
      includeConnectivity: false,
      focus: 'open',
    });
    expect(openOnly.map((item) => item.id)).toEqual(['open-recent', 'open-old']);

    const openedOnly = selectFaultHistory(alerts, {
      from: FROM,
      to: TO,
      includeConnectivity: false,
      focus: 'opened',
    });
    expect(openedOnly.map((item) => item.id)).toEqual([
      'open-recent',
      'closed-recent',
      'closed-older',
    ]);
  });

  it('pages about 20 rows and continues after the cursor', () => {
    const many = Array.from({ length: FAULT_HISTORY_PAGE_SIZE + 3 }, (_, index) =>
      row({
        id: `c-${String(index).padStart(2, '0')}`,
        status: index === 0 ? 'open' : 'closed',
        openedAt: new Date(NOW.getTime() - index * 60_000),
        closedAt: index === 0 ? null : NOW,
        closedReason: index === 0 ? null : 'auto_clear',
      }),
    );
    const first = pageFaultHistory(
      selectFaultHistory(many, { includeConnectivity: false }),
    );
    expect(first.items).toHaveLength(FAULT_HISTORY_PAGE_SIZE);
    expect(first.items[0]?.id).toBe('c-00');
    expect(first.nextCursor).toBeTruthy();

    const second = pageFaultHistory(
      selectFaultHistory(many, { includeConnectivity: false }),
      first.nextCursor,
    );
    expect(second.items.map((item) => item.id)).toEqual(['c-20', 'c-21', 'c-22']);
    expect(second.nextCursor).toBeNull();
  });

  it('joins dictionary wording and still returns the code when copy is missing', () => {
    expect(
      pickFaultCopy(
        [
          { code: 'other', label: 'E1', symptom: '别的文案', suggestedAction: '别的动作' },
          { code: 'fault', label: 'E1', symptom: '火焰故障', suggestedAction: '检查燃气供应' },
        ],
        'E1',
        'fault',
      ),
    ).toEqual({ symptom: '火焰故障', suggestedAction: '检查燃气供应' });

    expect(
      pickFaultCopy(
        [
          { code: 'bitmap', label: 'E1', symptom: null, suggestedAction: null },
          { code: 'fault', label: 'E1', symptom: '火焰故障', suggestedAction: '检查燃气供应' },
        ],
        'E1',
        'bitmap',
      ).symptom,
    ).toBe('火焰故障');
    expect(pickFaultCopy([], 'ZZ')).toEqual({ symptom: null, suggestedAction: null });
    expect(closedReasonLabel('auto_clear', 'closed')).toBe('自动恢复');
    expect(closedReasonLabel('manual', 'closed')).toBe('人工关闭');
    expect(closedReasonLabel('online', 'closed')).toBe('设备上线');
    expect(closedReasonLabel('manual', 'open')).toBeNull();
  });
});
