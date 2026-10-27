import { describe, it, expect } from 'vitest';
import { QATAR_POLYGON_COORDS, CUSTOM_COUNTRY_POLYGONS } from '../src/constants/countryGeometries';
import { buildCountrySvgData, resolveLocationFromCoords } from '../components/reports/QGISMapProductionReport';

describe('Country Silhouettes & Locator Mini-Map', () => {
  it('correctly exports high-resolution Qatar polygon coordinates', () => {
    expect(CUSTOM_COUNTRY_POLYGONS.QA).toBe(QATAR_POLYGON_COORDS);
    expect(QATAR_POLYGON_COORDS.length).toBeGreaterThan(200);

    // Verify bounds of Qatar peninsula
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    QATAR_POLYGON_COORDS.forEach(([lon, lat]) => {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });

    // Qatar is between 50.7-51.7°E and 24.5-26.2°N
    expect(minLon).toBeGreaterThan(50.7);
    expect(maxLon).toBeLessThan(51.7);
    expect(minLat).toBeGreaterThan(24.5);
    expect(maxLat).toBeLessThan(26.2);
  });

  it('correctly resolves Spain for PTT 43627 coordinates in buildCountrySvgData', () => {
    // PTT 43627 last GPS fix in Cordoba, Andalusia, Spain
    const lon = -4.726;
    const lat = 37.6722;

    const result = buildCountrySvgData(lon, lat, 140, 78, 5);

    expect(result.countryNameEn).toBe('Spain');
    expect(result.countryNameAr).toBe('إسبانيا');
    expect(result.svgPath).toBeTruthy();
    expect(result.svgPath.length).toBeGreaterThan(100);
    expect(result.birdPoint.x).toBeGreaterThan(5);
    expect(result.birdPoint.x).toBeLessThan(135);
    expect(result.birdPoint.y).toBeGreaterThan(5);
    expect(result.birdPoint.y).toBeLessThan(73);
  });

  it('correctly resolves Spain in resolveLocationFromCoords', () => {
    const lon = -4.726;
    const lat = 37.6722;

    const loc = resolveLocationFromCoords(lat, lon);

    expect(loc.iso2).toBe('ES');
    expect(loc.countryEn).toBe('Spain');
    expect(loc.countryAr).toBe('إسبانيا');
    expect(loc.regionEn).toBe('Andalusia');
    expect(loc.regionAr).toBe('الأندلس');
  });

  it('correctly resolves Kazakhstan coordinates', () => {
    const lon = 67.0222;
    const lat = 46.9965;

    const result = buildCountrySvgData(lon, lat, 140, 78, 5);
    expect(result.countryNameEn).toBe('Kazakhstan');
    expect(result.countryNameAr).toBe('كازاخستان');
    expect(result.svgPath).toBeTruthy();
  });

  it('correctly resolves Qatar coordinates', () => {
    const lon = 51.2;
    const lat = 25.3;

    const result = buildCountrySvgData(lon, lat, 140, 78, 5);
    expect(result.countryNameEn).toBe('Qatar');
    expect(result.countryNameAr).toBe('قطر');
    expect(result.svgPath).toBeTruthy();
  });
});
