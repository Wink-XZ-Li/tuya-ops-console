import { readFileSync } from 'fs';
import { join } from 'path';

type Ring = number[];

type Province = {
  name: string;
  adcode: number;
  center: [number, number];
  rings: Ring[];
};

type City = {
  name: string;
  provinceAdcode: number;
  lon: number;
  lat: number;
};

type ChinaAdmin = {
  province: string;
  city: string | null;
};

const data = JSON.parse(readFileSync(join(__dirname, 'china-admin.data.json'), 'utf8')) as {
  provinces: Province[];
  cities: City[];
};

const citiesByProvince = new Map<number, City[]>();
for (const city of data.cities) {
  const list = citiesByProvince.get(city.provinceAdcode);
  if (list) list.push(city);
  else citiesByProvince.set(city.provinceAdcode, [city]);
}

/** lat,lon string stored when reverse geocode has no address. */
const COORD_TEXT = /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/;

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function provinceContains(province: Province, lon: number, lat: number): boolean {
  return province.rings.some((ring) => pointInRing(lon, lat, ring));
}

function nearestProvince(lon: number, lat: number): Province | null {
  let best: Province | null = null;
  let bestDist = Infinity;
  for (const province of data.provinces) {
    const dist = (province.center[0] - lon) ** 2 + (province.center[1] - lat) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = province;
    }
  }
  return best;
}

function nearestCity(provinceAdcode: number, lon: number, lat: number): City | null {
  const cities = citiesByProvince.get(provinceAdcode);
  if (!cities?.length) return null;
  let best = cities[0];
  let bestDist = Infinity;
  for (const city of cities) {
    const dist = (city.lon - lon) ** 2 + (city.lat - lat) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = city;
    }
  }
  return best;
}

/** Province + prefecture city for a GCJ-02 point. Municipalities return city=null. */
export function lookupChinaAdmin(lon: number, lat: number): ChinaAdmin | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const province =
    data.provinces.find((item) => provinceContains(item, lon, lat)) ??
    nearestProvince(lon, lat);
  if (!province) return null;
  const city = nearestCity(province.adcode, lon, lat);
  return { province: province.name, city: city?.name ?? null };
}

/** 广东省 + 深圳市 → 广东省深圳市. 直辖市 uses the province name alone. */
export function locationHead(province: string, city: string | null): string {
  if (!city || city === province || province.endsWith('市')) return province;
  return `${province}${city}`;
}

export function composeLocationText(
  address: string | null | undefined,
  admin: ChinaAdmin | null,
): string | null {
  const raw = address?.trim() ?? '';
  const detail = COORD_TEXT.test(raw) ? '' : raw;
  if (!admin) return detail || null;

  const head = locationHead(admin.province, admin.city);
  if (!detail) return head;
  if (detail.startsWith(head)) return detail;

  const city = admin.city;
  if (city && city !== admin.province && detail.startsWith(city)) {
    return `${admin.province}${detail}`;
  }
  if (detail.startsWith(admin.province)) {
    const rest = detail.slice(admin.province.length);
    if (city && city !== admin.province && !rest.startsWith(city)) {
      return `${admin.province}${city}${rest}`;
    }
    return detail;
  }
  return `${head}${detail}`;
}

export function presentLocationText(
  locationText: string | null | undefined,
  lat?: string | null,
  lon?: string | null,
): string | null {
  const latitude = lat != null && lat !== '' ? Number(lat) : Number.NaN;
  const longitude = lon != null && lon !== '' ? Number(lon) : Number.NaN;
  const admin =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? lookupChinaAdmin(longitude, latitude)
      : null;
  const text = composeLocationText(locationText, admin);
  return text ? text.slice(0, 128) : null;
}

