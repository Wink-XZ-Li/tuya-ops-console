import { composeLocationText, lookupChinaAdmin, presentLocationText } from './china-admin';

describe('china admin location', () => {
  it('resolves prefecture cities to 省+市', () => {
    expect(lookupChinaAdmin(114.0859, 22.547)).toEqual({
      province: '广东省',
      city: '深圳市',
    });
    expect(lookupChinaAdmin(104.0508, 30.7099)).toEqual({
      province: '四川省',
      city: '成都市',
    });
    expect(lookupChinaAdmin(103.8696, 30.694)).toEqual({
      province: '四川省',
      city: '成都市',
    });
  });

  it('keeps municipalities as a single city name', () => {
    expect(lookupChinaAdmin(116.4074, 39.9042)).toEqual({
      province: '北京市',
      city: null,
    });
  });

  it('prefixes province and city onto a district-only address', () => {
    expect(
      composeLocationText('金牛区电子科技大学(九里堤校区)东50米', {
        province: '四川省',
        city: '成都市',
      }),
    ).toBe('四川省成都市金牛区电子科技大学(九里堤校区)东50米');
  });

  it('does not repeat a city already present in the address', () => {
    expect(
      composeLocationText('成都市温江区消防救援大队', {
        province: '四川省',
        city: '成都市',
      }),
    ).toBe('四川省成都市温江区消防救援大队');
  });

  it('formats a bare city as 广东省xx市', () => {
    expect(composeLocationText(null, { province: '广东省', city: '深圳市' })).toBe(
      '广东省深圳市',
    );
  });

  it('uses coordinates when the stored text is only lat,lon', () => {
    expect(presentLocationText('22.547,114.0859', '22.547', '114.0859')).toBe('广东省深圳市');
  });
});
