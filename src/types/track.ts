export type PointType = 'ALL' | 'GPS' | 'DOPPLER';

export interface TrackPeriod {
  id: string;
  from: string;   // ISO yyyy-mm-dd
  to: string;     // ISO yyyy-mm-dd
  color: string;  // #rrggbb
  label?: string; // Optional user label
}

export interface TrackPathSettings {
  show: boolean;
  type: PointType;
  from?: string;
  to?: string;
  color: string;           // default #6366f1
  width: number;           // 1..8
  showPoints: boolean;
  periodsEnabled: boolean;
  periods: TrackPeriod[];
}

export const DEFAULT_TRACK_SETTINGS: TrackPathSettings = {
  show: true,
  type: 'ALL',
  color: '#6366f1',
  width: 3,
  showPoints: false,
  periodsEnabled: false,
  periods: [],
};

export interface ColoredTrackSegment {
  id: string;
  label: string;
  color: string;
  positions: [number, number][];
  pointCount: number;
  startDate: string;
  endDate: string;
}
