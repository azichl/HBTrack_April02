import { describe, it, expect } from 'vitest';
import { DEFAULT_MAP_ELEMENTS } from '../src/types/report';

describe('Map Elements Spec v4 Defaults & Contracts (§4)', () => {
  it('reproduces legacy render defaults exactly', () => {
    // Release ✓
    expect(DEFAULT_MAP_ELEMENTS.release.visible).toBe(true);
    expect(DEFAULT_MAP_ELEMENTS.release.showLabel).toBe(true);
    // Latest ✓
    expect(DEFAULT_MAP_ELEMENTS.latest.visible).toBe(true);
    expect(DEFAULT_MAP_ELEMENTS.latest.showLabel).toBe(true);
    // Camps ✓
    expect(DEFAULT_MAP_ELEMENTS.camps.visible).toBe(true);
    expect(DEFAULT_MAP_ELEMENTS.camps.showLabel).toBe(true);
    // Stopovers ✗
    expect(DEFAULT_MAP_ELEMENTS.stopovers.visible).toBe(false);
    // Flight track ✓
    expect(DEFAULT_MAP_ELEMENTS.track.visible).toBe(true);
    // Distance Release -> Latest ✓
    expect(DEFAULT_MAP_ELEMENTS.distRelease.visible).toBe(true);
    // Distance Camp -> Latest ✓
    expect(DEFAULT_MAP_ELEMENTS.distCamp.visible).toBe(true);
    // Place labels ✗
    expect(DEFAULT_MAP_ELEMENTS.placeLabels.visible).toBe(false);
    // North arrow ✓
    expect(DEFAULT_MAP_ELEMENTS.northArrow.visible).toBe(true);
    // Scale bar ✓
    expect(DEFAULT_MAP_ELEMENTS.scaleBar.visible).toBe(true);
    // Graticule ✓
    expect(DEFAULT_MAP_ELEMENTS.graticule.visible).toBe(true);
    // Mini-map ✓
    expect(DEFAULT_MAP_ELEMENTS.miniMap.visible).toBe(true);
  });

  it('binds real color values for all color chips', () => {
    expect(DEFAULT_MAP_ELEMENTS.release.color).toBeTruthy();
    expect(DEFAULT_MAP_ELEMENTS.latest.color).toBeTruthy();
    expect(DEFAULT_MAP_ELEMENTS.camps.color).toBeTruthy();
    expect(DEFAULT_MAP_ELEMENTS.track.color).toBeTruthy();
    expect(DEFAULT_MAP_ELEMENTS.distRelease.color).toBeTruthy();
    expect(DEFAULT_MAP_ELEMENTS.distCamp.color).toBeTruthy();
  });
});
