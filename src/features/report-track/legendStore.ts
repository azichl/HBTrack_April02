// src/features/report-track/legendStore.ts
// Tiny external store = the single source of truth for the legend. The editor and the printed legend
// subscribe to the SAME store, so an edit is visible on the map legend in the same render (no draft, no Apply).
// Wire `onChange` to the report document autosave (ReportDocument.legend).

import { useSyncExternalStore } from 'react';
import { DEFAULT_LEGEND_STATE, type LegendState } from './legendModel';

export interface LegendStore {
  get(): LegendState;
  set(next: LegendState | ((s: LegendState) => LegendState)): void;
  subscribe(l: () => void): () => void;
}

export function createLegendStore(initial: LegendState = DEFAULT_LEGEND_STATE, onChange?: (s: LegendState) => void): LegendStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? next(state) : next;
      if (value === state) return;
      state = value;
      listeners.forEach(l => l());
      onChange?.(state);
    },
    subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

export const useLegendState = (store: LegendStore): LegendState =>
  useSyncExternalStore(store.subscribe, store.get, store.get);
