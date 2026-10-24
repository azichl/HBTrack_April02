export * from '../features/track/trackRenderModel';
import { TrackSettings, DEFAULT_TRACK_SETTINGS } from '../features/track/trackRenderModel';

export type TrackPathSettings = TrackSettings;
export { DEFAULT_TRACK_SETTINGS as DEFAULT_TRACK_PATH_SETTINGS };

export interface ColoredTrackSegment {
  id: string;
  label: string;
  color: string;
  positions: [number, number][];
  pointCount: number;
  startDate: string;
  endDate: string;
}
