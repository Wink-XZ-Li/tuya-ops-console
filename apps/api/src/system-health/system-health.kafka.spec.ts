import {
  consumerLag,
  parseBroker,
  topicHasRecentMessages,
} from './system-health.kafka';

describe('system health kafka math', () => {
  it('parses host and port', () => {
    expect(parseBroker('127.0.0.1:19092')).toEqual({ host: '127.0.0.1', port: 19092 });
    expect(parseBroker('localhost:9092')).toEqual({ host: 'localhost', port: 9092 });
    expect(parseBroker('missing')).toBeNull();
  });

  it('sums lag from the high watermark, treating an uncommitted group as fully behind', () => {
    expect(
      consumerLag(
        [
          { partition: 0, high: '10', low: '0' },
          { partition: 1, high: '4', low: '1' },
        ],
        [
          { partition: 0, offset: '7' },
          { partition: 1, offset: '-1' },
        ],
      ),
    ).toBe(6);
  });

  it('detects a message at or after the cutoff when its offset is still below the high watermark', () => {
    expect(
      topicHasRecentMessages(
        [{ partition: 0, high: '10' }],
        [{ partition: 0, offset: '10' }],
      ),
    ).toBe(false);
    expect(
      topicHasRecentMessages(
        [{ partition: 0, high: '10' }],
        [{ partition: 0, offset: '7' }],
      ),
    ).toBe(true);
    expect(
      topicHasRecentMessages([{ partition: 0, high: '0' }], [{ partition: 0, offset: '0' }]),
    ).toBe(false);
  });
});
