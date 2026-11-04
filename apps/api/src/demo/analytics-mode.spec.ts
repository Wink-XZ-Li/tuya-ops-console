import { parseDemoAnalyticsHeader, resolveAnalyticsDataMode } from './analytics-mode';

describe('resolveAnalyticsDataMode', () => {
  it('keeps production on live even when the header and env ask for virtual', () => {
    expect(
      resolveAnalyticsDataMode({
        profile: 'production',
        headerValue: 'virtual',
        envValue: 'virtual',
      }),
    ).toEqual({ mode: 'live', virtualIgnored: true });
  });

  it('serves virtual in demo only when the header or env asks for it', () => {
    expect(resolveAnalyticsDataMode({ profile: 'demo' })).toEqual({
      mode: 'live',
      virtualIgnored: false,
    });
    expect(
      resolveAnalyticsDataMode({ profile: 'demo', headerValue: 'Virtual' }),
    ).toEqual({ mode: 'virtual', virtualIgnored: false });
    expect(resolveAnalyticsDataMode({ profile: 'demo', envValue: 'virtual' })).toEqual({
      mode: 'virtual',
      virtualIgnored: false,
    });
  });

  it('parses the demo analytics header', () => {
    expect(parseDemoAnalyticsHeader('virtual')).toBe('virtual');
    expect(parseDemoAnalyticsHeader(['nope'])).toBeUndefined();
    expect(parseDemoAnalyticsHeader(undefined)).toBeUndefined();
  });
});
