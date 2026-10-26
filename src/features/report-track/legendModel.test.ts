import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LEGEND_STATE as S0, addCustom, legendContainerStyle, moveItem, removeCustom, resetItem,
  resolveLegend, setAllVisible, setLayout, setOverride,
} from './legendModel';
import { createLegendStore } from './legendStore';

describe('legendModel', () => {
  it('defaults: all present items are shown, labels from defaults', () => {
    const r = resolveLegend(S0);
    expect(r.items).toHaveLength(8); expect(r.shown).toHaveLength(8);
    expect(r.items[1].displayLabel).toBe('Latest Location');
    expect(resolveLegend(S0, { lang: 'ar' }).items[0].displayLabel).toBe('موقع الإطلاق');
  });
  it('override label/colour/shape/visibility applies to the printed list immediately', () => {
    let s = setOverride(S0, 'release', { label: 'Release Loc', color: '#000000', shape: 'square' });
    s = setOverride(s, 'camp', { visible: false });
    const r = resolveLegend(s);
    expect(r.items[0]).toMatchObject({ displayLabel: 'Release Loc', color: '#000000', shape: 'square', overridden: true });
    expect(r.shown.map(i => i.id)).not.toContain('camp');
  });
  it('cleared text falls back to the default label (editor keeps the empty string)', () => {
    const r = resolveLegend(setOverride(S0, 'release', { label: '' }));
    expect(r.items[0].label).toBe(''); expect(r.items[0].displayLabel).toBe('Release Location');
  });
  it('items whose element is not on the map are listed but not printed (and flagged)', () => {
    const r = resolveLegend(S0, { presence: { distCamp: false, mainRoad: false, towns: false } });
    expect(r.items.find(i => i.id === 'distCamp')).toMatchObject({ visible: true, onMap: false, shown: false });
    expect(r.shown).toHaveLength(5);
  });
  it('extra items (periods) replace the track entry via presence', () => {
    const r = resolveLegend(S0, { presence: { track: false }, extra: [
      { id: 'period:a', label: 'Winter', color: '#f59e0b', shape: 'line' }, { id: 'period:b', label: 'Summer', color: '#10b981', shape: 'line' }] });
    expect(r.shown.map(i => i.id)).toEqual(['release', 'latest', 'camp', 'distCamp', 'distRelease', 'mainRoad', 'towns', 'period:a', 'period:b']);
  });
  it('custom items: add, edit in place, remove', () => {
    let s = addCustom(S0, { id: 'c1', label: 'Nest' });
    s = setOverride(s, 'c1', { label: 'Nest site', color: '#123456' });
    expect(resolveLegend(s).items.at(-1)).toMatchObject({ id: 'c1', displayLabel: 'Nest site', color: '#123456', custom: true });
    expect(resolveLegend(removeCustom(s, 'c1')).items).toHaveLength(8);
  });
  it('reorder + reset item + show/hide all', () => {
    const ids = resolveLegend(S0).items.map(i => i.id);
    const s = moveItem(S0, ids, 'track', -1);
    expect(resolveLegend(s).items.map(i => i.id).indexOf('track')).toBe(4);
    expect(moveItem(S0, ids, 'release', -1)).toBe(S0);
    const hidden = setAllVisible(S0, ids, false);
    expect(resolveLegend(hidden).shown).toHaveLength(0);
    expect(resolveLegend(resetItem(hidden, 'camp')).shown.map(i => i.id)).toEqual(['camp']);
  });
  it('layout: mode styles + clamped scales', () => {
    expect(legendContainerStyle(S0.layout, 6)).toMatchObject({ display: 'flex', flexWrap: 'wrap' });
    const c2 = legendContainerStyle({ ...S0.layout, mode: 'cols-2' }, 5);
    expect(c2).toMatchObject({ display: 'grid', gridAutoFlow: 'column', gridTemplateRows: 'repeat(3, auto)', gridTemplateColumns: 'repeat(2, max-content)' });
    const c3 = legendContainerStyle({ ...S0.layout, mode: 'cols-3' }, 2);
    expect(c3.gridTemplateColumns).toBe('repeat(2, max-content)');           // never more columns than items
    expect(legendContainerStyle({ ...S0.layout, mode: 'cols-1' }, 5).gridTemplateRows).toBe('repeat(5, auto)');
    expect(setLayout(S0, { fontScale: 9, iconScale: 0.1 }).layout).toMatchObject({ fontScale: 1.8, iconScale: 0.6 });
    expect(legendContainerStyle({ ...S0.layout, fontScale: 1.3 }, 3)['--hb-legend-scale']).toBe(1.3);
  });
  it('store notifies subscribers and calls onChange once per change', () => {
    const seen: number[] = []; let n = 0;
    const store = createLegendStore(S0, () => n++);
    const off = store.subscribe(() => seen.push(1));
    store.set(s => setOverride(s, 'release', { label: 'X' })); store.set(store.get());
    expect(seen).toHaveLength(1); expect(n).toBe(1); off();
    store.set(s => setOverride(s, 'release', { label: 'Y' })); expect(seen).toHaveLength(1);
  });
});
