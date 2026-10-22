import { useState, useEffect, useCallback } from 'react';
import { TrackPathSettings, DEFAULT_TRACK_SETTINGS } from '../types/track';

export function useTrackSettings(birdId: string) {
  const storageKey = `hbtrack_track_settings_${birdId || 'default'}`;

  const [settings, setSettingsState] = useState<TrackPathSettings>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return { ...DEFAULT_TRACK_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Failed to parse track settings from localStorage', e);
    }
    return DEFAULT_TRACK_SETTINGS;
  });

  const [previewSettings, setPreviewSettings] = useState<TrackPathSettings>(settings);

  // Sync when birdId changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = { ...DEFAULT_TRACK_SETTINGS, ...JSON.parse(saved) };
        setSettingsState(parsed);
        setPreviewSettings(parsed);
        return;
      }
    } catch (e) {
      // ignore
    }
    setSettingsState(DEFAULT_TRACK_SETTINGS);
    setPreviewSettings(DEFAULT_TRACK_SETTINGS);
  }, [birdId, storageKey]);

  const setSettings = useCallback(
    (next: TrackPathSettings) => {
      setSettingsState(next);
      setPreviewSettings(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save track settings to localStorage', e);
      }
    },
    [storageKey]
  );

  return {
    settings,
    setSettings,
    previewSettings,
    setPreviewSettings
  };
}
