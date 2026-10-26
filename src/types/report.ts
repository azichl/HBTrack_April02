import { IconScaleState, DEFAULT_ICON_SCALE } from '../features/report-track/iconScale';
import { LabelScaleState, DEFAULT_LABEL_SCALE } from '../features/report-track/labelScale';

export type SectionId =
  | 'header'
  | 'regionInfo'
  | 'birdTable'
  | 'frequency'
  | 'coordsTable'
  | 'kpis'
  | 'distTraveledKpi'
  | 'tempCurve'
  | 'legend'
  | 'scaleBar'
  | 'northArrow'
  | 'footer';

export interface MapLabel {
  id: string;
  text: string;
  shape: 'pill' | 'rect' | 'circle' | 'arrow' | 'flag';
  bg: string;
  fg: string;
  border: string;
  fontSize: number;
  x: number; // % of map frame (0..100)
  y: number; // % of map frame (0..100)
  lat?: number;
  lon?: number;
  anchor?: 'geo' | 'frame';
  hidden?: boolean;
}

export type LegendShape = 'circle' | 'square' | 'line' | 'dashed-line' | 'triangle' | 'pin' | 'star';

export interface ReportLegendItem {
  id: string;
  label: string;
  color: string;
  shape: LegendShape;
  visible: boolean;
  custom?: boolean;
}

export interface ReportLegendLayout {
  position: 'below' | 'overlay-bottom' | 'overlay-top';
  columns: 'auto' | 1 | 2 | 3;
  fontSize: 's' | 'm' | 'l';
  background: 'none' | 'white-90' | 'dark';
}

/* ------------------- Section 1: Map Elements ------------------- */

export type MapElementId =
  | 'release' | 'latest' | 'camps' | 'stopovers' | 'trackPoints'
  | 'track' | 'distRelease' | 'distCamp' | 'distStopovers'
  | 'placeLabels' | 'graticule' | 'northArrow' | 'scaleBar' | 'miniMap';

export interface MapElementState {
  visible: boolean;
  showLabel?: boolean;
  label?: string;          // override text
  color?: string;          // overrides theme colour
  size?: number;
  pinnedInLegend?: boolean;
}

export interface LabelsConfigState {
  releaseTitle?: string;
  releasePosition?: 'top' | 'right' | 'bottom' | 'left';
  showReleaseLabel?: boolean;
  latestTitle?: string;
  latestPosition?: 'top' | 'right' | 'bottom' | 'left';
  showLatestLabel?: boolean;
  showCampLabels?: boolean;
  showDistanceLabels?: boolean;
}

export const DEFAULT_LABELS_CONFIG: LabelsConfigState = {
  releaseTitle: '',
  releasePosition: 'right',
  showReleaseLabel: true,
  latestTitle: '',
  latestPosition: 'top',
  showLatestLabel: true,
  showCampLabels: true,
  showDistanceLabels: true
};

export interface MapElements extends Partial<Record<MapElementId, MapElementState>> {
  iconScale?: IconScaleState;
  labelScale?: LabelScaleState;
  labelsConfig?: LabelsConfigState;
}

export const DEFAULT_MAP_ELEMENTS: MapElements = {
  iconScale: DEFAULT_ICON_SCALE,
  labelScale: DEFAULT_LABEL_SCALE,
  labelsConfig: DEFAULT_LABELS_CONFIG,
  release: { visible: true, showLabel: true, size: 8, color: '#701a2b' },
  latest: { visible: true, showLabel: true, size: 10, color: '#22c55e' },
  camps: { visible: true, showLabel: true, size: 8, color: '#f59e0b' },
  stopovers: { visible: false, showLabel: false, size: 6, color: '#3b82f6' },
  trackPoints: { visible: true, size: 4 },
  track: { visible: true, size: 3, color: '#6366f1' },
  distRelease: { visible: true, showLabel: true, color: '#dc2626' },
  distCamp: { visible: true, showLabel: true, color: '#d97706' },
  distStopovers: { visible: false, showLabel: false },
  placeLabels: { visible: false },
  graticule: { visible: true },
  northArrow: { visible: true },
  scaleBar: { visible: true },
  miniMap: { visible: true }
};

/* ------------------- Section 3: Layout Engine ------------------- */

export type BlockId =
  | 'birdData' | 'trackTable'   // Release / Latest Location coordinates table
  | 'kpis' | 'temperature' | 'map' | 'legend' | 'notes' | 'statusBadge';

export type ZoneId = 'left' | 'right' | 'full-top' | 'full-bottom';

export interface ReportLayout {
  split: number;                              // left column width %, default 42 (range 25–65)
  zones: Record<ZoneId, BlockId[]>;           // order inside each zone
  blockScale: Partial<Record<BlockId, number>>; // 0.7–1.5 text scale per block
  hidden: BlockId[];                          // driven by Sections popover
}

export const DEFAULT_LAYOUT: ReportLayout = {
  split: 42,
  zones: {
    'full-top': [],
    left: ['birdData', 'trackTable', 'kpis', 'temperature'],
    right: ['map', 'legend'],
    'full-bottom': [],
  },
  blockScale: {},
  hidden: [],
};

/* ------------------- Section 5: Bird Status ------------------- */

export type BirdStatus = 'alive' | 'dead' | 'potential_mortality';

export const STATUS_STYLE: Record<BirdStatus, { fg: string; bg: string; border: string; en: string; ar: string }> = {
  alive:               { fg: '#0f6b47', bg: '#e6f6ee', border: '#bfe6d2', en: 'Alive',               ar: 'حي' },
  dead:                { fg: '#b91c1c', bg: '#fdecec', border: '#f5c2c2', en: 'Dead',                ar: 'نافق' },
  potential_mortality: { fg: '#b45309', bg: '#fff3e0', border: '#fcd9a4', en: 'Potential mortality', ar: 'نفوق محتمل' },
};

export function normalizeBirdStatus(raw?: string | null): BirdStatus | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (['alive', 'حي', 'active', 'ok'].includes(s)) return 'alive';
  if (['dead', 'نافق', 'ميت', 'mortality'].includes(s)) return 'dead';
  if (['potential_mortality', 'potential mortality', 'نفوق محتمل', 'احتمال نفوق', 'warning'].includes(s)) return 'potential_mortality';
  return null;
}

/* ------------------- Section 7: Report Language ------------------- */

export type ReportLanguage = 'ar' | 'en' | 'ar+en';

export interface LocalizedText {
  ar?: string;
  en?: string;
  auto?: { ar?: boolean; en?: boolean };
}

/* ------------------- Full Report Document ------------------- */

export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  size?: 's' | 'm' | 'l';
  fontSize?: number;        // pt (8..48) or px
  fontFamily?: string;
  align?: 'start' | 'center' | 'end';
  color?: string;
}

export interface ReportDocument {
  lang: ReportLanguage;
  texts: Record<string, string | LocalizedText>;
  styles: Record<string, TextStyle>;
  colors: {
    primary: string;           // #7a1c32
    green: string;             // #128a5b
    lastLocation: string;      // #22c55e
    releaseDots: string;       // #701a2b
    stopoverDots: string;      // #f59e0b
    trackLine: string;         // #6366f1
    releaseDistance: string;   // #dc2626
    stopoverDistance: string;  // #d97706
  };
  sections: Record<SectionId, boolean>;
  sectionOrder: SectionId[];
  layout: ReportLayout;
  mapElements: MapElements;
  statusOverride?: BirdStatus;
  idDisplayType?: 'ptt' | 'ring' | 'darvic';
  reportScale: number;         // default 1.0 (0.7 .. 1.5)
  mapImage?: { url: string; fit: 'fill' | 'cover' | 'contain' };
  labels: MapLabel[];
  legend?: ReportLegendItem[];
  legendLayout?: ReportLegendLayout;
  columnLabels: Record<string, Record<string, string>>;
  cellOverrides: Record<string, Record<string, Record<string, string>>>;
  kpiOverrides: Record<string, { label?: string; value?: string; unit?: string; color?: string }>;
}

export const DEFAULT_REPORT_COLORS = {
  primary: '#7a1c32',
  green: '#128a5b',
  lastLocation: '#22c55e',
  releaseDots: '#701a2b',
  stopoverDots: '#f59e0b',
  trackLine: '#6366f1',
  releaseDistance: '#dc2626',
  stopoverDistance: '#d97706',
};

export const DEFAULT_SECTIONS: Record<SectionId, boolean> = {
  header: true,
  regionInfo: true,
  birdTable: true,
  frequency: false,
  coordsTable: true,
  kpis: true,
  distTraveledKpi: true,
  tempCurve: true,
  legend: true,
  scaleBar: true,
  northArrow: true,
  footer: true,
};

export const DEFAULT_SECTION_ORDER: SectionId[] = [
  'header',
  'regionInfo',
  'birdTable',
  'frequency',
  'coordsTable',
  'kpis',
  'distTraveledKpi',
  'tempCurve',
  'legend',
  'scaleBar',
  'northArrow',
  'footer',
];
