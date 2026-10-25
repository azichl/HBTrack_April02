import { describe, it, expect } from 'vitest';
import { QATAR_POLYGON_COORDS, CUSTOM_COUNTRY_POLYGONS } from '../src/constants/countryGeometries';

describe('Country Silhouettes & Qatar Peninsula Shape', () => {
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
});
