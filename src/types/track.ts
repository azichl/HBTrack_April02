export type PointType = 'ALL' | 'GPS' | 'DOPPLER';
export type CoordFormat = 'DD' | 'DMM' | 'DMS';
export type DashStyle = 'solid' | 'dashed' | 'dotted';
export type PointColorMode = 'track' | 'type' | 'period';

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
  // line
  color: string;           // default #6366f1
  width: number;           // 1..8
  opacity: number;         // 0.2..1
  dash: DashStyle;
  // points
  showPoints: boolean;
  pointSize: number;       // diameter px, 2..16
  pointOpacity: number;    // 0.2..1
  pointColorMode: PointColorMode;
  gpsColor: string;
  dopplerColor: string;
  // coordinate labels
  showCoordinateLabels: boolean;
  labelFontSize: number;   // px, 8..16
  labelMinSpacingPx: number; // 40..160
  coordFormat: CoordFormat;  // DMM reproduces the legacy report
  // periods
  periodsEnabled: boolean;
  periods: TrackPeriod[];
}

export const DEFAULT_TRACK_SETTINGS: TrackPathSettings = {
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

export interface ColoredTrackSegment {
  id: string;
  label: string;
  color: string;
  positions: [number, number][];
  pointCount: number;
  startDate: string;
  endDate: string;
}
