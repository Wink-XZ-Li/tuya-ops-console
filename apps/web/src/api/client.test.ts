import { applyDemoAnalyticsHeader } from './client';

describe('applyDemoAnalyticsHeader', () => {
  it('adds the virtual header only for an explicit flag', () => {
    const headers = new Headers();
    applyDemoAnalyticsHeader(headers, undefined);
    applyDemoAnalyticsHeader(headers, '');
    expect(headers.has('X-Demo-Analytics')).toBe(false);

    applyDemoAnalyticsHeader(headers, 'virtual');
    expect(headers.get('X-Demo-Analytics')).toBe('virtual');
  });

  it('does not overwrite a header the caller already set', () => {
    const headers = new Headers({ 'X-Demo-Analytics': 'live' });
    applyDemoAnalyticsHeader(headers, 'virtual');
    expect(headers.get('X-Demo-Analytics')).toBe('live');
  });
});
