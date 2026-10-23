import { describe, expect, it } from 'vitest';
import { formatTimelineDuration, formatTimelineWhen } from './fault-history-format';

describe('formatTimelineWhen', () => {
  const now = new Date('2026-10-23T00:00:00.000Z');

  it('phrases an open fault as relative time and a closed one as duration', () => {
    expect(
      formatTimelineWhen(
        {
          status: 'open',
          openedAt: '2026-10-20T00:00:00.000Z',
          conditionStartedAt: '2026-10-20T00:00:00.000Z',
          durationMinutes: 4320,
        },
        now,
      ),
    ).toBe('3 天前开');
    expect(
      formatTimelineWhen(
        {
          status: 'closed',
          openedAt: '2026-10-21T00:00:00.000Z',
          conditionStartedAt: '2026-10-21T00:00:00.000Z',
          durationMinutes: 120,
        },
        now,
      ),
    ).toBe('已关 · 持续 2h');
    expect(formatTimelineDuration(45)).toBe('45分钟');
    expect(formatTimelineDuration(60 * 24 * 2)).toBe('2天');
  });
});
