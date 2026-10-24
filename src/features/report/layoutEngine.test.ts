import { describe, it, expect } from 'vitest';
import {
  findZone,
  moveWithinZone,
  moveAcrossZones,
  moveBlockByStep,
  moveBlockToZone,
  hideBlock,
  showBlock,
  resetLayout
} from './layoutEngine';
import { DEFAULT_LAYOUT, ReportLayout } from '../../types/report';

describe('Layout Engine Contracts (§4.4)', () => {
  it('findZone returns the current zone of any block', () => {
    const layout = resetLayout();
    expect(findZone(layout, 'birdData')).toBe('left');
    expect(findZone(layout, 'map')).toBe('right');
    expect(findZone(layout, 'notes')).toBe(undefined);
  });

  it('moves blocks within the same zone', () => {
    const layout = resetLayout();
    expect(layout.zones.left).toEqual(['birdData', 'trackTable', 'kpis', 'temperature']);

    // Move birdData below trackTable (index 0 -> 1)
    const next = moveWithinZone(layout, 'left', 0, 1);
    expect(next.zones.left).toEqual(['trackTable', 'birdData', 'kpis', 'temperature']);

    // Move temperature to the top (index 3 -> 0)
    const next2 = moveWithinZone(next, 'left', 3, 0);
    expect(next2.zones.left).toEqual(['temperature', 'trackTable', 'birdData', 'kpis']);
  });

  it('moves blocks across zones', () => {
    const layout = resetLayout();
    // Move legend from right to full-bottom
    const next = moveAcrossZones(layout, 'right', 'full-bottom', 'legend');
    expect(next.zones.right).toEqual(['map']);
    expect(next.zones['full-bottom']).toEqual(['legend']);
  });

  it('moves blocks up and down with step buttons', () => {
    const layout = resetLayout();
    // Move kpis up (index 2 -> 1)
    const next = moveBlockByStep(layout, 'kpis', 'up');
    expect(next.zones.left[1]).toBe('kpis');

    // Move kpis down (index 1 -> 2)
    const next2 = moveBlockByStep(next, 'kpis', 'down');
    expect(next2.zones.left[2]).toBe('kpis');
  });

  it('moves block directly to target zone', () => {
    const layout = resetLayout();
    const next = moveBlockToZone(layout, 'birdData', 'full-top');
    expect(next.zones['full-top']).toEqual(['birdData']);
    expect(next.zones.left.includes('birdData')).toBe(false);
  });

  it('handles hiding and showing blocks', () => {
    const layout = resetLayout();
    const hidden = hideBlock(layout, 'temperature');
    expect(hidden.hidden).toContain('temperature');

    const shown = showBlock(hidden, 'temperature');
    expect(shown.hidden).not.toContain('temperature');
  });

  it('resets layout to DEFAULT_LAYOUT', () => {
    const layout = resetLayout();
    expect(layout.zones.left).toEqual(['birdData', 'trackTable', 'kpis', 'temperature']);
    expect(layout.zones.right).toEqual(['map', 'legend']);
  });
});
