import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LABEL_SCALE,
  effectiveLabelScale,
  labelScaleVars,
  setLabelMaster,
  setLabelItem,
  clampLabelScale
} from './labelScale';

describe('labelScale', () => {
  it('defaults to 1 for all items and master', () => {
    expect(DEFAULT_LABEL_SCALE.master).toBe(1);
    expect(DEFAULT_LABEL_SCALE.items.release).toBe(1);
    expect(DEFAULT_LABEL_SCALE.items.latest).toBe(1);
    expect(DEFAULT_LABEL_SCALE.items.camps).toBe(1);
    expect(DEFAULT_LABEL_SCALE.items.distances).toBe(1);
    expect(DEFAULT_LABEL_SCALE.items.custom).toBe(1);
  });

  it('clamps scales between 0.5 and 2.0', () => {
    expect(clampLabelScale(0.2)).toBe(0.5);
    expect(clampLabelScale(3.5)).toBe(2.0);
    expect(clampLabelScale(1.25)).toBe(1.25);
  });

  it('multiplies master and item in effectiveLabelScale', () => {
    const s = {
      master: 1.2,
      items: { release: 1.1, latest: 0.9, camps: 1.0, distances: 1.0, custom: 1.0 }
    };
    expect(effectiveLabelScale(s, 'release')).toBe(1.32);
    expect(effectiveLabelScale(s, 'latest')).toBe(1.08);
  });

  it('generates CSS variables correctly', () => {
    const s = {
      master: 1.0,
      items: { release: 0.8, latest: 1.2, camps: 1.0, distances: 0.9, custom: 1.1 }
    };
    const vars = labelScaleVars(s);
    expect(vars['--hb-label-scale-release']).toBe('0.8');
    expect(vars['--hb-label-scale-latest']).toBe('1.2');
    expect(vars['--hb-label-scale-camps']).toBe('1');
    expect(vars['--hb-label-scale-distances']).toBe('0.9');
    expect(vars['--hb-label-scale-custom']).toBe('1.1');
  });

  it('setLabelMaster and setLabelItem return new state without mutating original', () => {
    const s1 = DEFAULT_LABEL_SCALE;
    const s2 = setLabelMaster(s1, 1.3);
    expect(s1.master).toBe(1);
    expect(s2.master).toBe(1.3);

    const s3 = setLabelItem(s2, 'release', 0.85);
    expect(s2.items.release).toBe(1);
    expect(s3.items.release).toBe(0.85);
  });
});
