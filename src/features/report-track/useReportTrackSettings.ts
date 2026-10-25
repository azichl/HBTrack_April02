import { useState, useCallback, useEffect } from 'react';
import {
  type TrackSettings,
  DEFAULT_TRACK_SETTINGS,
} from './trackRenderModel';

export function liveToReportSettings(): TrackSettings {
  return {
    ...DEFAULT_TRACK_SETTINGS,
    show: true,
    type: 'ALL',
    color: '#6366f1',
    width: 3,
    opacity: 1,
    dash: 'solid',
    showPoints: false,
    pointSize: 6,
    pointOpacity: 1,
    pointColorMode: 'track',
    gpsColor: '#16a34a',
    dopplerColor: '#f59e0b',
    showCoordinateLabels: false,
    labelFontSize: 10,
    labelMinSpacingPx: 70,
    coordFormat: 'DMM',
    periodsEnabled: false,
    periods: [],
  };
}

export function useReportTrackSettings(subjectKey: string = 'default') {
  const storageKey = `hb_report_track_settings_${subjectKey}`;

  const loadInitialSettings = (): TrackSettings => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_TRACK_SETTINGS, ...parsed };
      }
    } catch (e) {
      // ignore
    }
    return liveToReportSettings();
  };

  const [committed, setCommitted] = useState<TrackSettings>(loadInitialSettings);
  const [draft, setDraft] = useState<TrackSettings>(committed);
  const [isPreviewActive, setIsPreviewActive] = useState<boolean>(false);

  useEffect(() => {
    const s = loadInitialSettings();
    setCommitted(s);
    setDraft(s);
    setIsPreviewActive(false);
  }, [subjectKey]);

  const updateDraft = useCallback((updater: Partial<TrackSettings> | ((prev: TrackSettings) => TrackSettings)) => {
    setDraft(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      return next;
    });
    setIsPreviewActive(true);
  }, []);

  const apply = useCallback((nextSettings?: TrackSettings) => {
    const target = nextSettings ?? draft;
    setDraft(target);
    setCommitted(target);
    setIsPreviewActive(false);
    try {
      localStorage.setItem(storageKey, JSON.stringify(target));
    } catch (e) {
      // ignore
    }
  }, [draft, storageKey]);

  const cancel = useCallback(() => {
    setDraft(committed);
    setIsPreviewActive(false);
  }, [committed]);

  const reset = useCallback(() => {
    const def = DEFAULT_TRACK_SETTINGS;
    setDraft(def);
    setCommitted(def);
    setIsPreviewActive(false);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      // ignore
    }
  }, [storageKey]);

  const importFromLive = useCallback(() => {
    const live = liveToReportSettings();
    setDraft(live);
    setIsPreviewActive(true);
  }, []);

  const effective = isPreviewActive ? draft : committed;

  return {
    committed,
    draft,
    preview: effective,
    updateDraft,
    apply,
    cancel,
    reset,
    importFromLive,
    isPreviewActive,
  };
}
