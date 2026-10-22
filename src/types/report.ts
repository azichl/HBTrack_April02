export type SectionId =
  | 'header'
  | 'regionInfo'
  | 'birdTable'
  | 'coordsTable'
  | 'kpis'
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
  hidden?: boolean;
}

export interface ReportDocument {
  texts: Record<string, string>; // fieldId -> text (title, subtitle, notes, ...)
  styles: Record<string, { bold?: boolean; italic?: boolean; size?: 's' | 'm' | 'l'; align?: 'start' | 'center' | 'end'; color?: string }>;
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
  mapImage?: { url: string; fit: 'fill' | 'cover' | 'contain' };
  labels: MapLabel[];
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
  coordsTable: true,
  kpis: true,
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
  'coordsTable',
  'kpis',
  'tempCurve',
  'legend',
  'scaleBar',
  'northArrow',
  'footer',
];
