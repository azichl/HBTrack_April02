import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Download, RefreshCw, Compass, MapPin, 
  Calendar, ChevronDown, Check, Search, SlidersHorizontal, 
  Layers, Info, ArrowRight, Share2, FileDown, CheckCircle2,
  AlertCircle, Plus, Minus, Crosshair, Maximize2, Minimize2
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, GeoJSON, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useAppStore } from '../../store/appStore';
import { getHistoricalPositions } from '../../services/firestoreService';
import { FIXED_FIELD_CAMPS, FieldCampPoint } from '../../constants';
import { 
  safeParseTimestamp, 
  classifyLocationType, 
  findBirdForTransmitter, 
  formatCoordinateSystems 
} from '../../utils/formatting';
import * as countryCoder from '@rapideditor/country-coder';
import * as countries from 'i18n-iso-countries';
import englishCountries from 'i18n-iso-countries/langs/en.json';
import arabicCountries from 'i18n-iso-countries/langs/ar.json';

try {
  countries.registerLocale(englishCountries);
  countries.registerLocale(arabicCountries);
} catch (_) {}

// ─── GEODETIC & MATH UTILITIES ───────────────────────────────────────────────

const deg2rad = (deg: number) => deg * (Math.PI / 180);
const rad2deg = (rad: number) => rad * (180 / Math.PI);

/** Great-circle distance between two points in km */
export const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Earth radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/** Initial bearing from point 1 to point 2 in degrees (0-360) */
export const calculateBearingDegrees = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const φ1 = deg2rad(lat1);
  const φ2 = deg2rad(lat2);
  const Δλ = deg2rad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (rad2deg(θ) + 360) % 360;
};

/** Formats bearing into Arabic compass direction and degrees, e.g. "شرق" & "69°" */
export const formatArabicBearing = (bearing: number): { text: string; degrees: number; full: string } => {
  const deg = Math.round(bearing);
  let dir = 'شمال';
  if (deg >= 337.5 || deg < 22.5) dir = 'شمال';
  else if (deg >= 22.5 && deg < 67.5) dir = 'شمال شرق';
  else if (deg >= 67.5 && deg < 112.5) dir = 'شرق';
  else if (deg >= 112.5 && deg < 157.5) dir = 'جنوب شرق';
  else if (deg >= 157.5 && deg < 202.5) dir = 'جنوب';
  else if (deg >= 202.5 && deg < 247.5) dir = 'جنوب غرب';
  else if (deg >= 247.5 && deg < 292.5) dir = 'غرب';
  else dir = 'شمال غرب';

  return {
    text: dir,
    degrees: deg,
    full: `${dir} (${deg}°)`
  };
};

/** Formats decimal coordinate to Hddmm format with 4 decimals for minutes: "XXX° XX.XXXX′ N" / "XXX° XX.XXXX′ E" */
export const formatDMM = (val: number, isLat: boolean): string => {
  const num = Number(val);
  if (isNaN(num) || num === 0) {
    return `000° 00.0000′ ${isLat ? 'N' : 'E'}`;
  }
  const abs = Math.abs(num);
  let deg = Math.floor(abs);
  let min = (abs - deg) * 60;
  if (min >= 59.99995) {
    deg += 1;
    min = 0;
  }
  const [minWhole, minFraction] = min.toFixed(4).split('.');
  const minStr = `${minWhole.padStart(2, '0')}.${minFraction}`;
  const degStr = String(deg).padStart(3, '0');
  const dir = isLat ? (num >= 0 ? 'N' : 'S') : (num >= 0 ? 'E' : 'W');
  return `${degStr}° ${minStr}′ ${dir}`;
};

/** Formats timestamp into DD-MM-YYYY */
export const formatDateDDMMYYYY = (ts: any): string => {
  const timeMs = safeParseTimestamp(ts);
  if (isNaN(timeMs) || timeMs <= 0) return 'NA';
  const d = new Date(timeMs);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
};

/** Formats timestamp into YYYY-MM-DD */
export const formatDateYYYYMMDD = (ts: any): string => {
  const timeMs = safeParseTimestamp(ts);
  if (isNaN(timeMs) || timeMs <= 0) return '';
  const d = new Date(timeMs);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${year}-${month}-${day}`;
};

/** Robustly parses DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, or timestamps to UTC ms */
export const parseAnyDateToMs = (val: any): number => {
  if (!val) return NaN;
  const str = String(val).trim();
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [_, d, m, y] = dmyMatch;
    return Date.UTC(Number(y), Number(m) - 1, Number(d));
  }
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const [_, y, m, d] = ymdMatch;
    return Date.UTC(Number(y), Number(m) - 1, Number(d));
  }
  return safeParseTimestamp(val);
};

/** Calculates tracking duration in days from release date until current day (today) */
export const calculateDurationFromReleaseToToday = (releaseDateVal: any): number => {
  const relMs = parseAnyDateToMs(releaseDateVal);
  if (isNaN(relMs) || relMs <= 0) return 0;
  const nowMs = Date.now();
  return Math.max(0, Math.round((nowMs - relMs) / (1000 * 60 * 60 * 24)));
};

/** Calculates tracking duration in days between two dates */
export const calculateDurationDays = (startTs: any, endTs: any): number => {
  const t1 = parseAnyDateToMs(startTs);
  const t2 = parseAnyDateToMs(endTs);
  if (isNaN(t1) || isNaN(t2)) return 0;
  return Math.max(0, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)));
};

// ─── LEAFLET ICONS WITH EXACT LIVE TRACKING SIZES & STYLING ─────────────────

/**
 * Creates transmitter marker matching Live Tracking exactly:
 * - 21x35px SVG Teardrop Pin
 * - Rounded number pill with 2px border and transmitter ID
 * - Crisp title above with text-shadow (zero overlap, strictly separated zones)
 */
const createLiveTrackingMarkerIcon = ({
  number,
  pinColorHex,
  borderColorHex,
  labelTitle
}: {
  number: string;
  pinColorHex: string;
  borderColorHex: string;
  labelTitle?: string;
}) => {
  const cleanId = String(number).replace(/^trans-/, '');
  const hasTitle = Boolean(labelTitle);
  const totalW = 160;
  const totalH = hasTitle ? 78 : 60;
  const pillW = Math.max(54, cleanId.length * 7.5 + 16);
  const pinW = 21;

  return L.divIcon({
    className: 'bg-transparent',
    html: `
      <svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; pointer-events: none; display: block;">
        ${hasTitle ? `
          <!-- Zone 1 (Top): Label Title with crisp black outline -->
          <text 
            x="${totalW / 2}" 
            y="12" 
            text-anchor="middle" 
            dominant-baseline="middle"
            font-family="'Sakkal Majalla', 'Traditional Arabic', 'Segoe UI', Arial, sans-serif" 
            font-size="12" 
            font-weight="800" 
            fill="#ffffff" 
            stroke="#000000" 
            stroke-width="2.6" 
            stroke-linejoin="round" 
            paint-order="stroke fill"
          >
            ${labelTitle}
          </text>
        ` : ''}

        <!-- Zone 2 (Middle): Transmitter ID Pill Badge (e.g. 244289) -->
        <rect 
          x="${(totalW - pillW) / 2}" 
          y="${hasTitle ? 20 : 2}" 
          width="${pillW}" 
          height="20" 
          rx="10" 
          fill="#ffffff" 
          stroke="${borderColorHex}" 
          stroke-width="2"
        />
        <text 
          x="${totalW / 2}" 
          y="${hasTitle ? 30.5 : 12.5}" 
          text-anchor="middle" 
          dominant-baseline="middle"
          font-family="monospace, 'Sakkal Majalla', Arial" 
          font-size="11.5" 
          font-weight="800" 
          fill="#0f172a"
        >
          ${cleanId}
        </text>

        <!-- Zone 3 (Bottom): Live Tracking 21x35 Teardrop Pin -->
        <g transform="translate(${(totalW - pinW) / 2}, ${hasTitle ? 43 : 25}) scale(0.84)">
          <path d="M12.5 0C5.596 0 0 5.596 0 12.5C0 21.875 12.5 41 12.5 41C12.5 41 25 21.875 25 12.5C25 5.596 19.404 0 12.5 0Z" fill="${pinColorHex}" stroke="#000000" stroke-width="1.2" stroke-opacity="0.3" />
          <circle cx="12.5" cy="12.5" r="5" fill="#ffffff" opacity="0.95" />
        </g>
      </svg>
    `,
    iconSize: [totalW, totalH],
    iconAnchor: [totalW / 2, totalH],
    popupAnchor: [0, -totalH + 12]
  });
};

/**
 * Creates Field Camp Marker matching Live Tracking styling using pure vector SVG
 */
const createLiveTrackingCampIcon = (campName: string) => {
  const totalW = 140;
  const totalH = 54;
  const badgeSize = 30;

  return L.divIcon({
    className: 'bg-transparent',
    html: `
      <svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; pointer-events: none; display: block;">
        <!-- Zone 1 (Top): Camp Title with solid dark outline -->
        <text 
          x="${totalW / 2}" 
          y="12" 
          text-anchor="middle" 
          dominant-baseline="middle"
          font-family="'Sakkal Majalla', 'Traditional Arabic', 'Segoe UI', Arial, sans-serif" 
          font-size="12" 
          font-weight="800" 
          fill="#ffffff" 
          stroke="#000000" 
          stroke-width="2.6" 
          stroke-linejoin="round" 
          paint-order="stroke fill"
        >
          ${campName}
        </text>

        <!-- Zone 2 (Bottom): Circular Amber Tent Badge -->
        <g transform="translate(${(totalW - badgeSize) / 2}, 20)">
          <circle cx="${badgeSize / 2}" cy="${badgeSize / 2}" r="${badgeSize / 2 - 1}" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/>
          <g transform="translate(6, 6) scale(0.75)">
            <path d="M19 20 10 4 1 20h18Z" fill="#ffffff" fill-opacity="0.35"/>
            <path d="M10 4 23 20" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round"/>
            <path d="m10 4 4.5 16" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round"/>
          </g>
        </g>
      </svg>
    `,
    iconSize: [totalW, totalH],
    iconAnchor: [totalW / 2, 20 + badgeSize / 2 + 5]
  });
};

/** Custom directional arrowhead icon pointing along the trajectory */
const createArrowHeadIcon = (deg: number) => {
  return L.divIcon({
    className: 'bg-transparent pointer-events-none',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `
      <svg width="20" height="20" viewBox="0 0 20 20" style="transform: rotate(${deg}deg); overflow: visible; display: block;">
        <polygon points="10,2 17,17 10,12 3,17" fill="#dc2626" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round" />
      </svg>
    `
  });
};

/** Distance badge along connecting lines - pure vector SVG that never distorts or separates */
const createDistancePillIcon = (
  text: string, 
  borderColor: string, 
  anchorOffset: [number, number] = [37, 12]
) => {
  const pillW = 74;
  const pillH = 24;

  return L.divIcon({
    className: 'bg-transparent',
    html: `
      <svg width="${pillW}" height="${pillH}" viewBox="0 0 ${pillW} ${pillH}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; pointer-events: none; display: block;">
        <rect 
          x="1" 
          y="1" 
          width="${pillW - 2}" 
          height="${pillH - 2}" 
          rx="10" 
          fill="#ffffff" 
          stroke="${borderColor}" 
          stroke-width="1.8"
        />
        <text 
          x="${pillW / 2}" 
          y="${pillH / 2 + 0.5}" 
          text-anchor="middle" 
          dominant-baseline="middle"
          font-family="monospace, Arial, sans-serif" 
          font-size="11" 
          font-weight="800" 
          fill="${borderColor}"
        >
          ${text}
        </text>
      </svg>
    `,
    iconSize: [pillW, pillH],
    iconAnchor: anchorOffset
  });
};

/**
 * Injects arrowhead marker definitions into Leaflet's SVG overlay pane,
 * and sets marker-end on the red polyline path so the arrowhead is rendered
 * natively within Leaflet's SVG overlay (z-index: 400), perfectly positioned
 * above map tiles (z-index: 200) and below all markers and labels (z-index: 600).
 */
const ReportPolylineArrowDefs = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const updateDefs = () => {
      try {
        const overlayPane = map.getPanes()?.overlayPane;
        if (!overlayPane) return;
        const svg = overlayPane.querySelector('svg');
        if (!svg) return;

        if (!svg.querySelector('#report-arrow-red')) {
          let defs = svg.querySelector('defs');
          if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.prepend(defs);
          }
          defs.innerHTML = `
            <marker 
              id="report-arrow-red" 
              viewBox="0 0 10 10" 
              refX="7" 
              refY="5" 
              markerWidth="7" 
              markerHeight="7" 
              orient="auto"
            >
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#dc2626" />
            </marker>
          `;
        }

        const redPath = overlayPane.querySelector('path.report-release-polyline');
        if (redPath && redPath.getAttribute('marker-end') !== 'url(#report-arrow-red)') {
          redPath.setAttribute('marker-end', 'url(#report-arrow-red)');
        }
      } catch (e) {
        console.warn('Polyline arrow def injection error:', e);
      }
    };

    updateDefs();
    const t1 = setTimeout(updateDefs, 100);
    const t2 = setTimeout(updateDefs, 300);
    const t3 = setTimeout(updateDefs, 700);

    map.on('moveend zoomend viewreset resize', updateDefs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      map.off('moveend zoomend viewreset resize', updateDefs);
    };
  }, [map]);

  return null;
};

/** Helper to return dynamic tile layer matching Live Tracking options with Google Hybrid as default */
export const getProductionTileLayer = (layerId: string) => {
  switch (layerId) {
    case 'google_hybrid':
      return (
        <TileLayer
          key="google_hybrid"
          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          attribution="&copy; Google"
          maxZoom={20}
          crossOrigin="anonymous"
        />
      );
    case 'google_roadmap':
      return (
        <TileLayer
          key="google_roadmap"
          url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
          attribution="&copy; Google"
          maxZoom={20}
          crossOrigin="anonymous"
        />
      );
    case 'google_satellite':
      return (
        <TileLayer
          key="google_satellite"
          url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
          attribution="&copy; Google"
          maxZoom={20}
          crossOrigin="anonymous"
        />
      );
    case 'scienceterrain':
      return (
        <TileLayer
          key="scienceterrain"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="&copy; Esri"
          maxZoom={18}
          crossOrigin="anonymous"
        />
      );
    case 'roadmap':
      return (
        <TileLayer
          key="roadmap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
          maxZoom={19}
          crossOrigin="anonymous"
        />
      );
    default:
      return (
        <TileLayer
          key="default_google_hybrid"
          url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          attribution="&copy; Google"
          maxZoom={20}
          crossOrigin="anonymous"
        />
      );
  }
};

/** Controller component to fit bounds and ensure Leaflet renders all tiles and layers */
const ReportMapFitter = ({ 
  points,
  fitKey = 0
}: { 
  points: Array<[number, number]>;
  fitKey?: number;
}) => {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const validPoints = points.filter(p => !isNaN(p[0]) && !isNaN(p[1]) && p[0] !== 0 && p[1] !== 0);
    if (validPoints.length === 0) return;

    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const bounds = L.latLngBounds(validPoints.map(p => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [45, 45] });

    return () => clearTimeout(timer);
  }, [map, fitKey]);
  return null;
};

/** Binds Leaflet map instance to parent state for zoom and pan buttons */
const MapInstanceBinder = ({ onMapInstance }: { onMapInstance: (map: L.Map) => void }) => {
  const map = useMap();
  useEffect(() => {
    if (map) onMapInstance(map);
  }, [map, onMapInstance]);
  return null;
};

// ─── DYNAMIC COUNTRY SVG GENERATOR & PROJECTOR ──────────────────────────────

export interface CountrySvgResult {
  countryNameEn: string;
  countryNameAr: string;
  svgPath: string;
  birdPoint: { x: number; y: number };
  viewBox: string;
}

export function buildCountrySvgData(
  lon: number,
  lat: number,
  width: number = 140,
  height: number = 78,
  padding: number = 5
): CountrySvgResult {
  let feat: any = null;
  try {
    feat = (countryCoder as any).feature([lon, lat]);
  } catch (e) {
    console.warn('countryCoder.feature([lon, lat]) failed:', e);
  }
  if (!feat || !feat.geometry) {
    try {
      feat = (countryCoder as any).feature('KZ');
    } catch (_) {}
  }

  const countryNameEn = feat?.properties?.nameEn || 'Kazakhstan';
  let countryNameAr = 'كازاخستان';
  const iso2 = feat?.properties?.iso1A2;
  if (iso2) {
    try {
      const ar = countries.getName(iso2, 'ar');
      if (ar) countryNameAr = ar;
    } catch (_) {}
  }

  if (!feat || !feat.geometry) {
    return {
      countryNameEn,
      countryNameAr,
      svgPath: '',
      birdPoint: { x: width / 2, y: height / 2 },
      viewBox: `0 0 ${width} ${height}`
    };
  }

  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const scanCoords = (coords: any) => {
    if (typeof coords[0] === 'number') {
      const [cLon, cLat] = coords;
      if (cLon < minLon) minLon = cLon;
      if (cLon > maxLon) maxLon = cLon;
      if (cLat < minLat) minLat = cLat;
      if (cLat > maxLat) maxLat = cLat;
    } else {
      for (const sub of coords) scanCoords(sub);
    }
  };
  scanCoords(feat.geometry.coordinates);

  const spanLon = maxLon - minLon || 1;
  const spanLat = maxLat - minLat || 1;
  const availW = width - padding * 2;
  const availH = height - padding * 2;

  // Ground dimensions in pseudo-degrees scaled by cos(midLat)
  const midLat = (minLat + maxLat) / 2;
  const cosMid = Math.max(0.1, Math.cos((midLat * Math.PI) / 180));
  const geoW = spanLon * cosMid;
  const geoH = spanLat;
  const geoAspect = geoW / geoH;
  const boxAspect = availW / availH;

  let scale: number;
  if (boxAspect > geoAspect) {
    // Box is wider than geography, height is the constraining dimension
    scale = availH / geoH;
  } else {
    // Box is taller than geography, width is the constraining dimension
    scale = availW / geoW;
  }

  const projW = geoW * scale;
  const projH = geoH * scale;
  const offsetX = padding + (availW - projW) / 2;
  const offsetY = padding + (availH - projH) / 2;

  const project = (pLon: number, pLat: number) => ({
    x: offsetX + (pLon - minLon) * cosMid * scale,
    y: offsetY + (maxLat - pLat) * scale
  });

  const ringsToD = (rings: any[]) => {
    return rings.map(ring => {
      return ring.map((pt: [number, number], i: number) => {
        const { x, y } = project(pt[0], pt[1]);
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
      }).join('') + 'Z';
    }).join(' ');
  };

  let svgPath = '';
  if (feat.geometry.type === 'Polygon') {
    svgPath = ringsToD(feat.geometry.coordinates);
  } else if (feat.geometry.type === 'MultiPolygon') {
    svgPath = feat.geometry.coordinates.map((poly: any) => ringsToD(poly)).join(' ');
  }

  let birdPoint = project(lon, lat);
  birdPoint = {
    x: Math.max(padding, Math.min(width - padding, birdPoint.x)),
    y: Math.max(padding, Math.min(height - padding, birdPoint.y))
  };

  return {
    countryNameEn,
    countryNameAr,
    svgPath,
    birdPoint,
    viewBox: `0 0 ${width} ${height}`
  };
}

// ─── COMPONENT DEFINITION ───────────────────────────────────────────────────

export interface QGISMapProductionReportProps {
  initialTransmitterId?: string;
  onBack?: () => void;
}

export const QGISMapProductionReport: React.FC<QGISMapProductionReportProps> = ({
  initialTransmitterId = '244289',
  onBack
}) => {
  const { 
    transmitters = [], 
    birds = [], 
    positions = [],
    qgisLayers = [],
    qgisGeoJSONCache = {}
  } = useAppStore();

  // Selected Transmitter State
  const [selectedPttId, setSelectedPttId] = useState<string>(initialTransmitterId);
  const [pttSearchTerm, setPttSearchTerm] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Selected Camp State
  const [selectedCampId, setSelectedCampId] = useState<string>('auto');

  // Dynamic Base Map Layer State (Default: Google Maps Hybrid View)
  const [activeBaseLayer, setActiveBaseLayer] = useState<
    'google_hybrid' | 'google_roadmap' | 'google_satellite' | 'scienceterrain' | 'roadmap'
  >('google_hybrid');
  const [fitKey, setFitKey] = useState<number>(0);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [showLayerMenu, setShowLayerMenu] = useState<boolean>(false);

  // Loading & Customization State
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingPng, setIsExportingPng] = useState<boolean>(false);
  const [isMapFullscreen, setIsMapFullscreen] = useState<boolean>(false);
  const [isReportFullscreen, setIsReportFullscreen] = useState<boolean>(false);

  // Handle ESC key to exit fullscreen report or map mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isReportFullscreen) setIsReportFullscreen(false);
        if (isMapFullscreen) setIsMapFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isReportFullscreen, isMapFullscreen]);

  // Handle map resize on fullscreen toggle
  useEffect(() => {
    if (mapInstance) {
      setTimeout(() => {
        mapInstance.invalidateSize();
        setFitKey(k => k + 1);
      }, 200);
    }
  }, [isMapFullscreen, isReportFullscreen, mapInstance]);

  const [showCustomizer, setShowCustomizer] = useState<boolean>(false);

  // Report Editable Metadata
  const [customMetadata, setCustomMetadata] = useState<{
    birdRing: string;
    species: string;
    gender: string;
    birdStatus: string;
    issueDate: string;
  }>({
    birdRing: 'NA',
    species: 'وحش',
    gender: 'ذكر',
    birdStatus: 'حي',
    issueDate: '2026-10-07'
  });

  // Telemetry Coordinates State (Defaults to exact values for 244289)
  const [telemetryData, setTelemetryData] = useState<{
    releasePos: { lat: number; lon: number; dateStr: string };
    lastGpsPos: { lat: number; lon: number; dateStr: string };
    rawGpsCount: number;
    dataSource: 'telemetry' | 'reference_pdf';
  }>({
    releasePos: { lat: 46.94415, lon: 66.8242, dateStr: '16-10-2024' },
    lastGpsPos: { lat: 46.9965, lon: 67.0222, dateStr: '01-10-2026' },
    rawGpsCount: 1,
    dataSource: 'reference_pdf'
  });

  const reportContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load telemetry when selectedPttId changes
  useEffect(() => {
    let isMounted = true;

    async function loadTelemetryForPtt() {
      if (!selectedPttId) return;

      setIsLoadingTelemetry(true);
      try {
        const cleanId = String(selectedPttId).replace(/^trans-/, '');
        const currentTransmitter = transmitters.find(
          t => t.id === selectedPttId || t.platform_id === selectedPttId ||
               String(t.platform_id).replace(/^trans-/, '') === cleanId
        );
        const currentBird = currentTransmitter ? findBirdForTransmitter(birds, currentTransmitter) : null;

        const pttIdsToQuery = [selectedPttId];
        if (currentTransmitter && currentTransmitter.platform_id) {
          pttIdsToQuery.push(currentTransmitter.platform_id);
        }

        const now = new Date();
        const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
        
        let fetchedPositions: any[] = [];
        try {
          fetchedPositions = await getHistoricalPositions(pttIdsToQuery, tenYearsAgo, now);
        } catch (e) {
          console.warn('Historical query error, checking store positions:', e);
        }

        const storePositions = positions.filter(p => {
          const pid = String(p.transmitter_id || (p as any).platformId || (p as any).platform_id || '');
          return pttIdsToQuery.includes(pid);
        });

        const allPositions = [...fetchedPositions, ...storePositions];

        // STRICT REQUIREMENT: Filter ONLY coordinates where location type is GPS!
        const gpsPositions = allPositions.filter(p => {
          const locType = classifyLocationType(p.lc, p.locationType, (p as any).satellite);
          return locType === 'GPS';
        });

        gpsPositions.sort((a, b) => safeParseTimestamp(a.timestamp) - safeParseTimestamp(b.timestamp));

        if (!isMounted) return;

        if (gpsPositions.length > 0) {
          const latestGps = gpsPositions[gpsPositions.length - 1];
          const latestGpsDate = formatDateDDMMYYYY(latestGps.timestamp);

          let relLat = currentBird?.release_lat ? parseFloat(String(currentBird.release_lat)) : NaN;
          let relLon = currentBird?.release_lon ? parseFloat(String(currentBird.release_lon)) : NaN;
          let relDate = currentBird?.release_date ? formatDateDDMMYYYY(currentBird.release_date) : '';

          if (isNaN(relLat) || isNaN(relLon)) {
            const firstFix = gpsPositions[0];
            relLat = parseFloat(String(firstFix.lat));
            relLon = parseFloat(String(firstFix.lon));
            relDate = formatDateDDMMYYYY(firstFix.timestamp);
          }

          const lastLat = parseFloat(String(latestGps.lat));
          const lastLon = parseFloat(String(latestGps.lon));

          setTelemetryData({
            releasePos: {
              lat: isNaN(relLat) ? 46.94415 : relLat,
              lon: isNaN(relLon) ? 66.8242 : relLon,
              dateStr: relDate || '16-10-2024'
            },
            lastGpsPos: {
              lat: isNaN(lastLat) ? 46.9965 : lastLat,
              lon: isNaN(lastLon) ? 67.0222 : lastLon,
              dateStr: latestGpsDate || '01-10-2026'
            },
            rawGpsCount: gpsPositions.length,
            dataSource: 'telemetry'
          });

          setCustomMetadata(prev => ({
            ...prev,
            birdRing: currentBird?.ring_id || 'NA',
            species: currentBird?.species === 'Asian Houbara' ? 'وحش' : (currentBird?.species || 'وحش'),
            gender: currentBird?.sex === 'M' ? 'ذكر' : currentBird?.sex === 'F' ? 'أنثى' : prev.gender,
            birdStatus: currentTransmitter?.status === 'active' ? 'حي' : (currentTransmitter?.status || 'حي'),
            issueDate: formatDateYYYYMMDD(new Date()) || '2026-10-07'
          }));
        } else {
          setTelemetryData(prev => ({
            ...prev,
            rawGpsCount: 0,
            dataSource: 'reference_pdf'
          }));
          setCustomMetadata(prev => ({
            ...prev,
            birdRing: currentBird?.ring_id || currentTransmitter?.assigned_bird_ring || prev.birdRing,
            species: currentBird?.species === 'Asian Houbara' ? 'وحش' : (currentBird?.species || prev.species),
            gender: currentBird?.sex === 'M' ? 'ذكر' : currentBird?.sex === 'F' ? 'أنثى' : prev.gender,
            birdStatus: currentTransmitter?.status === 'active' ? 'حي' : (currentTransmitter?.status || prev.birdStatus),
            issueDate: formatDateYYYYMMDD(new Date()) || '2026-10-07'
          }));
        }
      } catch (err) {
        console.error('Error loading telemetry for PTT:', err);
      } finally {
        if (isMounted) setIsLoadingTelemetry(false);
      }
    }

    loadTelemetryForPtt();

    return () => {
      isMounted = false;
    };
  }, [selectedPttId, transmitters, birds, positions]);

  // Determine active field camp
  const activeCamp: FieldCampPoint = useMemo(() => {
    if (selectedCampId === 'zhezkazgan_camp') {
      return FIXED_FIELD_CAMPS[0];
    }
    if (selectedCampId === 'almaty_camp') {
      return FIXED_FIELD_CAMPS[1];
    }
    const lat = parseFloat(String(telemetryData.lastGpsPos.lat)) || 46.9965;
    const lon = parseFloat(String(telemetryData.lastGpsPos.lon)) || 67.0222;
    let nearest = FIXED_FIELD_CAMPS[0];
    let minDist = Infinity;
    for (const c of FIXED_FIELD_CAMPS) {
      const d = calculateDistanceKm(lat, lon, c.lat, c.lon);
      if (d < minDist) {
        minDist = d;
        nearest = c;
      }
    }
    return nearest;
  }, [selectedCampId, telemetryData.lastGpsPos]);

  // Distance & Bearing calculations
  const metrics = useMemo(() => {
    const rLat = parseFloat(String(telemetryData.releasePos.lat)) || 0;
    const rLon = parseFloat(String(telemetryData.releasePos.lon)) || 0;
    const lLat = parseFloat(String(telemetryData.lastGpsPos.lat)) || 0;
    const lLon = parseFloat(String(telemetryData.lastGpsPos.lon)) || 0;
    const cLat = parseFloat(String(activeCamp.lat)) || 0;
    const cLon = parseFloat(String(activeCamp.lon)) || 0;

    const distFromRelease = calculateDistanceKm(rLat, rLon, lLat, lLon);
    const bearing = calculateBearingDegrees(rLat, rLon, lLat, lLon);
    const bearingArabic = formatArabicBearing(bearing);
    const distToCamp = calculateDistanceKm(lLat, lLon, cLat, cLon);
    const durationDays = calculateDurationFromReleaseToToday(telemetryData.releasePos.dateStr);

    const releaseLatDMM = formatDMM(rLat, true);
    const releaseLonDMM = formatDMM(rLon, false);
    const lastGpsLatDMM = formatDMM(lLat, true);
    const lastGpsLonDMM = formatDMM(lLon, false);

    return {
      rLat,
      rLon,
      lLat,
      lLon,
      cLat,
      cLon,
      bearingDegrees: bearing,
      distFromReleaseKm: distFromRelease.toFixed(2),
      bearingArabic,
      distToCampKm: distToCamp.toFixed(2),
      durationDays: durationDays > 0 ? durationDays : 0,
      releaseLatDMM,
      releaseLonDMM,
      lastGpsLatDMM,
      lastGpsLonDMM,
      releaseToLastMid: [
        (rLat + lLat) / 2,
        (rLon + lLon) / 2
      ] as [number, number],
      lastToCampMid: [
        (lLat + cLat) / 2,
        (lLon + cLon) / 2
      ] as [number, number]
    };
  }, [telemetryData, activeCamp]);

  const mapPoints = useMemo<Array<[number, number]>>(() => [
    [metrics.rLat, metrics.rLon],
    [metrics.lLat, metrics.lLon],
    [metrics.cLat, metrics.cLon]
  ], [metrics.rLat, metrics.rLon, metrics.lLat, metrics.lLon, metrics.cLat, metrics.cLon]);

  // Dynamic country silhouette & bird location for the top-left locator map
  const insetMapData = useMemo(() => {
    const { lat, lon } = telemetryData.lastGpsPos;
    return buildCountrySvgData(lon, lat, 150, 82, 6);
  }, [telemetryData.lastGpsPos.lat, telemetryData.lastGpsPos.lon]);

  const filteredPtts = useMemo(() => {
    const list: string[] = ['244289'];
    transmitters.forEach(t => {
      if (t.platform_id && !list.includes(t.platform_id)) list.push(t.platform_id);
      if (t.id && !list.includes(t.id)) list.push(t.id);
    });
    if (!pttSearchTerm.trim()) return list;
    return list.filter(id => id.toLowerCase().includes(pttSearchTerm.toLowerCase()));
  }, [transmitters, pttSearchTerm]);

  // ─── EXPORT HANDLERS ────────────────────────────────────────────────────────

  const hideLiveDistanceLinesForExport = () => {
    const liveOverlayPaths = document.querySelectorAll<SVGPathElement>(
      '#map-production-print-area .leaflet-overlay-pane path, #map-production-print-area svg path'
    );
    const hiddenPaths: SVGPathElement[] = [];
    liveOverlayPaths.forEach(p => {
      const stroke = (p.getAttribute('stroke') || p.style.stroke || '').toLowerCase();
      const dash = p.getAttribute('stroke-dasharray') || p.style.strokeDasharray || '';
      const cls = (p.getAttribute('class') || '').toLowerCase();
      if (
        cls.includes('report-') ||
        stroke.includes('dc2626') || stroke.includes('220, 38, 38') ||
        stroke.includes('f59e0b') || stroke.includes('245, 158, 11') ||
        dash.includes('8') || dash.includes('6')
      ) {
        p.style.display = 'none';
        hiddenPaths.push(p);
      }
    });
    return () => {
      hiddenPaths.forEach(p => {
        p.style.display = '';
      });
    };
  };

  const createExportHtml2CanvasOptions = () => ({
    scale: 2.5,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDoc: Document) => {
      // 1. Ensure country inset title Arabic ligatures stay connected
      const countryTitle = clonedDoc.getElementById('country-inset-title');
      if (countryTitle) {
        countryTitle.style.letterSpacing = '0px';
        countryTitle.style.direction = 'rtl';
      }

      // 2. Ensure Table 1 header stays 100% centered horizontally
      const birdHeader = clonedDoc.getElementById('bird-data-header');
      if (birdHeader) {
        birdHeader.style.display = 'block';
        birdHeader.style.textAlign = 'center';
        birdHeader.style.width = '100%';
      }

      // 3. Center all table cells and headers in both tables
      const allTableElements = clonedDoc.querySelectorAll('#bird-data-table td, #bird-data-table th, #bird-data-table div, #table2-coordinates td, #table2-coordinates th, #table2-coordinates div');
      allTableElements.forEach(cell => {
        const el = cell as HTMLElement;
        el.setAttribute('align', 'center');
        el.style.setProperty('text-align', 'center', 'important');
        el.style.setProperty('vertical-align', 'middle', 'important');
        el.style.setProperty('margin-left', 'auto', 'important');
        el.style.setProperty('margin-right', 'auto', 'important');
        if (el.tagName === 'DIV') {
          el.style.setProperty('display', 'block', 'important');
          el.style.setProperty('width', '100%', 'important');
        }
      });

      // 4. Align map legend icons and writing on the exact same vertical center line
      const legendElements = clonedDoc.querySelectorAll('#map-legend-bar td, #map-legend-bar div, #map-legend-bar span, #map-legend-bar svg');
      legendElements.forEach(el => {
        const h = el as HTMLElement;
        h.style.setProperty('vertical-align', 'middle', 'important');
      });

      // 5. Style Map Scale Control on solid dark-slate / black background
      const clonedScaleControls = clonedDoc.querySelectorAll('#map-production-print-area .leaflet-control-scale');
      clonedScaleControls.forEach(sc => {
        const el = sc as HTMLElement;
        el.style.setProperty('background', '#1e293b', 'important');
        el.style.setProperty('background-color', '#1e293b', 'important');
        el.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.4)', 'important');
        el.style.setProperty('border-radius', '4px', 'important');
        el.style.setProperty('padding', '2px 5px 3px 5px', 'important');
        el.style.setProperty('box-shadow', '0 1px 4px rgba(0, 0, 0, 0.6)', 'important');
        el.style.setProperty('display', 'inline-block', 'important');
      });
      const clonedScaleLines = clonedDoc.querySelectorAll('#map-production-print-area .leaflet-control-scale-line');
      clonedScaleLines.forEach(sl => {
        const el = sl as HTMLElement;
        el.style.setProperty('background', '#1e293b', 'important');
        el.style.setProperty('background-color', '#1e293b', 'important');
        el.style.setProperty('border', '2px solid #ffffff', 'important');
        el.style.setProperty('border-top', 'none', 'important');
        el.style.setProperty('color', '#ffffff', 'important');
        el.style.setProperty('font-weight', '800', 'important');
        el.style.setProperty('font-family', "monospace, 'Segoe UI', Arial, sans-serif", 'important');
        el.style.setProperty('font-size', '10px', 'important');
        el.style.setProperty('line-height', '1.1', 'important');
        el.style.setProperty('padding', '2px 6px 1px 6px', 'important');
        el.style.setProperty('border-radius', '2px', 'important');
        el.style.setProperty('text-shadow', '0 1px 2px rgba(0, 0, 0, 0.9)', 'important');
        el.style.setProperty('display', 'block', 'important');
      });

      // 6. Copy live canvas contents to cloned canvas for any base tile or GIS layers
      const origCanvases = Array.from(document.querySelectorAll('#map-production-print-area canvas'));
      const clonedCanvases = Array.from(clonedDoc.querySelectorAll('#map-production-print-area canvas'));
      clonedCanvases.forEach((clonedC, i) => {
        const origC = origCanvases[i] as HTMLCanvasElement;
        if (origC && origC.width && origC.height) {
          clonedC.width = origC.width;
          clonedC.height = origC.height;
          const ctx = clonedC.getContext('2d');
          if (ctx) {
            ctx.drawImage(origC, 0, 0);
          }
        }
      });

      // 7. REMOVE SHIFTED LEAFLET SVG DISTANCE POLYLINES FROM CLONED OVERLAY PANE:
      // Leaflet renders SVG paths inside .leaflet-overlay-pane with CSS transforms that
      // html2canvas incorrectly double-translates, shifting the polylines to the top-left edge.
      // We wipe out these shifted SVG paths completely so ONLY the pixel-perfect canvas lines remain.
      const printArea = clonedDoc.getElementById('map-production-print-area');
      const hasNoQgisLayers = !qgisLayers || qgisLayers.filter(l => l.visible && l.type === 'file' && qgisGeoJSONCache?.[l.id]).length === 0;

      if (printArea) {
        const allOverlayPaths = printArea.querySelectorAll('path');
        allOverlayPaths.forEach(path => {
          const p = path as SVGPathElement;
          const stroke = (p.getAttribute('stroke') || p.style.stroke || '').toLowerCase();
          const cls = (p.getAttribute('class') || '').toLowerCase();
          const dash = p.getAttribute('stroke-dasharray') || p.style.strokeDasharray || '';
          const parentOverlay = p.closest('.leaflet-overlay-pane');

          const isDistanceLine = 
            cls.includes('report-') ||
            stroke.includes('dc2626') || stroke.includes('220, 38, 38') ||
            stroke.includes('f59e0b') || stroke.includes('245, 158, 11') ||
            dash.includes('8') || dash.includes('6') ||
            (Boolean(parentOverlay) && hasNoQgisLayers);

          if (isDistanceLine) {
            p.setAttribute('d', '');
            p.setAttribute('stroke', 'none');
            p.setAttribute('fill', 'none');
            p.setAttribute('display', 'none');
            p.setAttribute('visibility', 'hidden');
            p.style.display = 'none';
            p.style.visibility = 'hidden';
            p.remove();
          }
        });

        // Also if no QGIS vector file layers are active, clear any SVG element in the overlay pane
        if (hasNoQgisLayers) {
          const overlaySvgs = printArea.querySelectorAll('.leaflet-overlay-pane svg');
          overlaySvgs.forEach(svg => {
            svg.innerHTML = '';
            (svg as HTMLElement).style.display = 'none';
          });
        }
      }

      // Draw custom pixel-perfect canvas lines positioned at the exact layer coordinates
      const clonedOverlayPane = clonedDoc.querySelector('#map-production-print-area .leaflet-overlay-pane, .leaflet-overlay-pane') as HTMLElement;
      if (clonedOverlayPane && mapInstance) {
        clonedOverlayPane.style.zIndex = '350';

        try {
          const rPt = mapInstance.latLngToLayerPoint([metrics.rLat, metrics.rLon]);
          const lPt = mapInstance.latLngToLayerPoint([metrics.lLat, metrics.lLon]);
          const cPt = mapInstance.latLngToLayerPoint([metrics.cLat, metrics.cLon]);
          const mapSize = mapInstance.getSize();

          // Calculate bounding box that comfortably encloses all layer points
          const minX = Math.floor(Math.min(0, rPt.x, lPt.x, cPt.x) - 150);
          const minY = Math.floor(Math.min(0, rPt.y, lPt.y, cPt.y) - 150);
          const maxX = Math.ceil(Math.max(mapSize.x, rPt.x, lPt.x, cPt.x) + 150);
          const maxY = Math.ceil(Math.max(mapSize.y, rPt.y, lPt.y, cPt.y) + 150);
          const canvasW = maxX - minX;
          const canvasH = maxY - minY;

          const exportLinesCanvas = clonedDoc.createElement('canvas');
          exportLinesCanvas.width = canvasW;
          exportLinesCanvas.height = canvasH;
          exportLinesCanvas.style.position = 'absolute';
          exportLinesCanvas.style.left = `${minX}px`;
          exportLinesCanvas.style.top = `${minY}px`;
          exportLinesCanvas.style.width = `${canvasW}px`;
          exportLinesCanvas.style.height = `${canvasH}px`;
          exportLinesCanvas.style.zIndex = '350';
          exportLinesCanvas.style.pointerEvents = 'none';

          const ctx = exportLinesCanvas.getContext('2d');
          if (ctx) {
            ctx.translate(-minX, -minY);

            // Red dashed line: Release Location -> Last GPS Position
            if (metrics.rLat !== 0 && metrics.lLat !== 0) {
              ctx.beginPath();
              ctx.strokeStyle = '#dc2626';
              ctx.lineWidth = 3;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.setLineDash([8, 6]);
              ctx.moveTo(rPt.x, rPt.y);
              ctx.lineTo(lPt.x, lPt.y);
              ctx.stroke();
            }

            // Amber dashed line: Last GPS Position -> Field Camp
            if (metrics.lLat !== 0 && metrics.cLat !== 0) {
              ctx.beginPath();
              ctx.strokeStyle = '#f59e0b';
              ctx.lineWidth = 3;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.setLineDash([8, 6]);
              ctx.moveTo(lPt.x, lPt.y);
              ctx.lineTo(cPt.x, cPt.y);
              ctx.stroke();
            }
          }

          clonedOverlayPane.appendChild(exportLinesCanvas);
        } catch (e) {
          console.warn('Could not draw custom export lines canvas:', e);
        }
      }

      const clonedMarkerPane = clonedDoc.querySelector('.leaflet-marker-pane') as HTMLElement;
      if (clonedMarkerPane) {
        clonedMarkerPane.style.zIndex = '800';
      }
    },
    ignoreElements: (el: Element) => 
      el.classList?.contains('no-print') || 
      el.classList?.contains('leaflet-control-zoom') || 
      el.classList?.contains('leaflet-control-attribution')
  });

  const handleExportPdf = async () => {
    if (!reportContainerRef.current) return;
    setIsExportingPdf(true);
    let restoreLiveLines = () => {};

    try {
      await new Promise(r => setTimeout(r, 400));
      const element = reportContainerRef.current;
      if (!element) return;

      restoreLiveLines = hideLiveDistanceLinesForExport();

      const canvas = await html2canvas(element, createExportHtml2CanvasOptions());

      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, '', 'FAST');
      pdf.save(`Houbara_Report_${selectedPttId}_${customMetadata.issueDate}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('حدث خطأ أثناء تصدير ملف PDF. يرجى المحاولة مرة أخرى.');
    } finally {
      restoreLiveLines();
      setIsExportingPdf(false);
    }
  };

  const handleExportPng = async () => {
    if (!reportContainerRef.current) return;
    setIsExportingPng(true);
    let restoreLiveLines = () => {};

    try {
      await new Promise(r => setTimeout(r, 400));
      const element = reportContainerRef.current;

      restoreLiveLines = hideLiveDistanceLinesForExport();

      const canvas = await html2canvas(element, createExportHtml2CanvasOptions());

      const link = document.createElement('a');
      link.download = `Houbara_Report_${selectedPttId}_${customMetadata.issueDate}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error exporting image:', error);
      alert('حدث خطأ أثناء حفظ الصورة.');
    } finally {
      restoreLiveLines();
      setIsExportingPng(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ─── PRINT & VECTOR STYLES ─────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }
          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          nav, header, aside, .no-print, .report-toolbar {
            display: none !important;
          }
          #map-production-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 297mm !important;
            height: 210mm !important;
            margin: 0 !important;
            padding: 8mm 10mm !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            direction: ltr !important;
          }
        }
      `}</style>

      {/* ─── INTERACTIVE CONTROL TOOLBAR (RTL FOR USER, HIDDEN ON PRINT) ───────── */}
      <div className="no-print bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4" dir="rtl">
        
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-brand-500/10 text-brand-600 dark:text-brand-400 rounded-xl">
              <Compass size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                إنتاج الخرائط وتقارير المتابعة الرسمية
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  تحديث GPS حصراً
                </span>
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                توليد تقرير متابعة طائر حبارى قياسي A4 Landscape متطابق مع النموذج الرسمي ومحدّث بآخر إحداثيات GPS.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
            >
              <FileDown size={16} />
              <span>{isExportingPdf ? 'جارِ التحميل...' : 'تصدير PDF'}</span>
            </button>

            <button
              onClick={handleExportPng}
              disabled={isExportingPng}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
            >
              <Download size={16} />
              <span>{isExportingPng ? 'جارِ التحميل...' : 'تصدير صورة PNG'}</span>
            </button>

            {/* Fullscreen Report Button */}
            <button
              onClick={() => setIsReportFullscreen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
              title="عرض التقرير بالكامل بملء الشاشة"
            >
              <Maximize2 size={16} />
              <span>ملء الشاشة</span>
            </button>

            <button
              onClick={() => setShowCustomizer(!showCustomizer)}
              className={`p-2 rounded-xl border text-sm font-medium transition-colors ${
                showCustomizer 
                  ? 'bg-brand-50 text-brand-600 border-brand-200 dark:bg-brand-900/30 dark:border-brand-800' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-slate-700 dark:border-slate-600 dark:text-gray-300'
              }`}
              title="تخصيص البيانات والبيانات الإضافية"
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </div>

        {/* Filters and Inputs Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-1">
          
          {/* 1. Transmitter Selector / Combobox */}
          <div className="relative">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              رقم جهاز التتبع (Transmitter ID):
            </label>
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={pttSearchTerm || selectedPttId}
                onChange={(e) => {
                  setPttSearchTerm(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                placeholder="أدخل أو اختر رقم الجهاز (مثال: 244289)..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white font-mono"
              />
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {/* Suggestions Dropdown */}
            {isSearchOpen && (
              <>
                <div 
                  className="fixed inset-0 z-20" 
                  onClick={() => setIsSearchOpen(false)} 
                />
                <div className="absolute top-full mt-1.5 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto">
                  <div className="p-1.5">
                    {filteredPtts.map(pid => (
                      <button
                        key={pid}
                        type="button"
                        onClick={() => {
                          setSelectedPttId(pid);
                          setPttSearchTerm('');
                          setIsSearchOpen(false);
                        }}
                        className={`w-full text-right px-3 py-2 text-xs rounded-lg flex items-center justify-between font-mono transition-colors ${
                          selectedPttId === pid 
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 font-bold' 
                            : 'hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        <span>{pid}</span>
                        {pid === '244289' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-sans">
                            نموذج التقرير القياسي
                          </span>
                        )}
                      </button>
                    ))}
                    {filteredPtts.length === 0 && (
                      <div className="p-3 text-center text-xs text-gray-400">
                        لا توجد أجهزة مطابقة، سيتم استخدام الرقم المدخل مباشرة
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 2. Camp Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              المخيم المرجعي (Reference Camp):
            </label>
            <div className="relative">
              <select
                value={selectedCampId}
                onChange={(e) => setSelectedCampId(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white appearance-none cursor-pointer"
              >
                <option value="auto">تلقائي (الأقرب لإحداثية الطائر)</option>
                <option value="zhezkazgan_camp">مخيم جيزقازغان (Zhezkazgan Camp) – 47.143761, 67.810600</option>
                <option value="almaty_camp">مخيم ألماتي (Almaty Camp) – 44.398198, 75.290787</option>
              </select>
              <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 3. Base Map Layer Selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
              <span>نوع الخريطة (Base Map):</span>
              <span className="text-[10px] text-brand-600 dark:text-brand-400 font-normal">افتراضي: جوجل</span>
            </label>
            <div className="relative">
              <select
                value={activeBaseLayer}
                onChange={(e) => setActiveBaseLayer(e.target.value as any)}
                className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white appearance-none cursor-pointer font-medium"
              >
                <option value="google_hybrid">خرائط جوجل هجين – أقمار وشوارع (Google Hybrid)</option>
                <option value="google_roadmap">خرائط جوجل عادية – شوارع وتضاريس (Google Roadmap)</option>
                <option value="google_satellite">خرائط جوجل – أقمار صناعية نقية (Google Satellite)</option>
                <option value="scienceterrain">أقمار صناعية Esri (Esri Satellite)</option>
                <option value="roadmap">خريطة الشوارع (OpenStreetMap)</option>
              </select>
              <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 4. Info / Status Badge */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-100 dark:border-slate-700/60">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 block">
                حالة تحديث البيانات:
              </span>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                {isLoadingTelemetry ? (
                  <>
                    <RefreshCw size={13} className="animate-spin text-brand-500" />
                    <span>جارِ جلب إحداثيات GPS...</span>
                  </>
                ) : telemetryData.dataSource === 'telemetry' ? (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span>تم التحديث وفق {telemetryData.rawGpsCount} نقطة GPS</span>
                  </>
                ) : (
                  <>
                    <Info size={14} className="text-brand-500" />
                    <span>بيانات التقرير المرجعي المتطابقة</span>
                  </>
                )}
              </span>
            </div>

            {selectedPttId !== '244289' && (
              <button
                onClick={() => setSelectedPttId('244289')}
                className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline font-medium"
              >
                العودة لـ 244289
              </button>
            )}
          </div>

        </div>

        {/* ─── COLLAPSIBLE CUSTOMIZER PANEL ─────────────────────────────────── */}
        {showCustomizer && (
          <div className="pt-3 border-t border-gray-100 dark:border-slate-700/60">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">
              تخصيص بيانات التقرير والطيور يدوياً (اختياري):
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">المخيم لحساب المسافة:</label>
                <select
                  value={selectedCampId}
                  onChange={(e) => setSelectedCampId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none cursor-pointer"
                >
                  <option value="auto">تلقائي (الأقرب لموقع الطائر)</option>
                  <option value="zhezkazgan_camp">مخيم جيزقازغان (Zhezkazgan Camp)</option>
                  <option value="almaty_camp">مخيم ألماتي (Almaty Camp)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-gray-500 mb-1">رقم الحجل (Ring):</label>
                <input
                  type="text"
                  value={customMetadata.birdRing}
                  onChange={(e) => setCustomMetadata({ ...customMetadata, birdRing: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-gray-500 mb-1">النوعية (Species):</label>
                <input
                  type="text"
                  value={customMetadata.species}
                  onChange={(e) => setCustomMetadata({ ...customMetadata, species: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-gray-500 mb-1">الجنس (Gender):</label>
                <select
                  value={customMetadata.gender}
                  onChange={(e) => setCustomMetadata({ ...customMetadata, gender: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                >
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                  <option value="غير محدد">غير محدد</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-gray-500 mb-1">حالة الطائر (Status):</label>
                <input
                  type="text"
                  value={customMetadata.birdStatus}
                  onChange={(e) => setCustomMetadata({ ...customMetadata, birdStatus: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] text-gray-500 mb-1">تاريخ إصدار التقرير:</label>
                <input
                  type="date"
                  value={customMetadata.issueDate}
                  onChange={(e) => setCustomMetadata({ ...customMetadata, issueDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                />
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ─── OFFICIAL REPORT SHEET CONTAINER (A4 LANDSCAPE: LTR FRAME, RTL CONTENT) ─── */}
      <div className={
        isReportFullscreen
          ? "fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-md overflow-y-auto overflow-x-auto p-6 flex flex-col items-center"
          : "overflow-x-auto pb-6 flex justify-center"
      }>
        {isReportFullscreen && (
          <div className="no-print w-[1080px] max-w-full flex items-center justify-between mb-4 bg-slate-900/95 border border-slate-700 px-4 py-2.5 rounded-xl text-white select-none shadow-2xl sticky top-0 z-50" style={{ direction: 'rtl' }}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsReportFullscreen(false)}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                <Minimize2 size={14} />
                <span>إغلاق ملء الشاشة (Esc)</span>
              </button>
              <span className="text-xs font-bold text-gray-300">
                معاينة التقرير بملء الشاشة الكامل (نفس مظهر الملف المصدر)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                <FileDown size={14} />
                <span>{isExportingPdf ? 'جارِ التحميل...' : 'تصدير PDF'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportPng}
                disabled={isExportingPng}
                className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                <Download size={14} />
                <span>{isExportingPng ? 'جارِ التحميل...' : 'تصدير PNG'}</span>
              </button>
            </div>
          </div>
        )}
        
        <div 
          id="map-production-print-area"
          ref={reportContainerRef}
          className="bg-white text-gray-900 w-[1080px] min-w-[1080px] p-7 shadow-2xl rounded-sm border border-gray-300 relative select-none"
          style={{
            direction: 'ltr',
            fontFamily: "'Sakkal Majalla', 'Traditional Arabic', 'Segoe UI', Arial, sans-serif",
            letterSpacing: 'normal'
          }}
        >

          {/* 1. REPORT HEADER (LTR: LEFT LOGO, CENTER TITLE, RIGHT LOGO) */}
          <div className="flex items-center justify-between pb-3.5 border-b border-gray-200 mb-4" style={{ direction: 'ltr' }}>
            
            {/* Top-Left Header: Qatar Houbara & Falcon Breeding Center Logo */}
            <div className="flex items-center justify-start w-[240px]">
              <img 
                src="/qatar-houbara-center-logo.png" 
                alt="المركز القطري لتكاثر الحبارى والصقور" 
                className="h-[100px] w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

            {/* Center Header: Title & Subtitle (Centered, Clean Arabic) */}
            <div className="text-center flex-1 px-2" style={{ direction: 'rtl' }}>
              <h1 
                className="text-[21px] font-black text-gray-900 leading-tight mb-1"
                style={{ letterSpacing: 'normal', fontFeatureSettings: '"liga" 1' }}
              >
                تقرير متابعة طائر حبارى مزود بجهاز تتبع
              </h1>
              <div className="text-[12.5px] font-bold text-gray-700 flex items-center justify-center gap-2">
                <span>جهاز التتبع <span className="font-mono text-[#701a2b] font-black">{selectedPttId}</span></span>
                <span>•</span>
                <span>منطقة {activeCamp.name.replace('مخيم ', '')} – كازاخستان</span>
                <span>•</span>
                <span>تاريخ الإصدار {formatDateDDMMYYYY(customMetadata.issueDate) || customMetadata.issueDate}</span>
              </div>
            </div>

            {/* Top-Right Header: External Reserves Office Logo */}
            <div className="flex items-center justify-end w-[350px]">
              <img 
                src="/external-reserves-office-logo.png" 
                alt="مكتب محميات الدولة الخارجية - External Reserves Office of The State" 
                className="h-[48px] w-auto max-w-[270px] object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

          </div>

          {/* 2. MAIN REPORT BODY (LTR: COLUMN 1 LEFT = MAP, COLUMN 2 RIGHT = TABLES) */}
          <div className="flex gap-4 items-start" style={{ direction: 'ltr' }}>
            
            {/* ─── COLUMN 1 (LEFT): GIS SATELLITE MAP (approx 58% width) ───── */}
            <div className="w-[58%] flex flex-col space-y-2" style={{ direction: 'ltr' }}>
              
              {/* Map Viewport with GIS Border Frame */}
              <div 
                className="relative border-2 border-gray-800 rounded-sm overflow-hidden bg-stone-900 h-[435px] shadow-sm"
                style={{ direction: 'ltr', textAlign: 'left' }}
              >
                
                <style>{`
                  #map-production-print-area .leaflet-control-scale {
                    background: rgba(30, 41, 59, 0.88) !important;
                    background-color: rgba(30, 41, 59, 0.88) !important;
                    backdrop-filter: blur(4px) !important;
                    padding: 2px 5px 3px 5px !important;
                    border-radius: 4px !important;
                    border: 1px solid rgba(255, 255, 255, 0.4) !important;
                    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5) !important;
                    margin-right: 8px !important;
                    margin-bottom: 8px !important;
                    display: inline-block !important;
                  }
                  #map-production-print-area .leaflet-control-scale-line {
                    background: rgba(30, 41, 59, 0.88) !important;
                    background-color: rgba(30, 41, 59, 0.88) !important;
                    border: 2px solid #ffffff !important;
                    border-top: none !important;
                    color: #ffffff !important;
                    font-weight: 800 !important;
                    font-family: monospace, 'Segoe UI', Arial, sans-serif !important;
                    font-size: 10px !important;
                    line-height: 1.1 !important;
                    padding: 2px 6px 1px 6px !important;
                    border-radius: 2px !important;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9) !important;
                    box-sizing: border-box !important;
                    display: block !important;
                  }
                `}</style>

                {/* Leaflet Dynamic Interactive Map */}
                <MapContainer
                  center={[47.05, 67.32]}
                  zoom={9}
                  scrollWheelZoom={true}
                  dragging={true}
                  doubleClickZoom={true}
                  touchZoom={true}
                  zoomControl={false}
                  attributionControl={false}
                  className="w-full h-full cursor-grab active:cursor-grabbing"
                  style={{ direction: 'ltr', width: '100%', height: '100%' }}
                >
                  <MapInstanceBinder onMapInstance={setMapInstance} />

                  {/* Dynamic Base Tile Layer (Default: Google Maps Hybrid View) */}
                  {getProductionTileLayer(activeBaseLayer)}

                  {/* Auto-fit map to points & recenter */}
                  <ReportMapFitter points={mapPoints} fitKey={fitKey} />

                  {/* Dynamic GIS Scale Bar on gray background */}
                  <ScaleControl position="bottomright" metric={true} imperial={false} />

                  {/* Red dashed vector line: Release Location -> Last GPS Position */}
                  {metrics.rLat !== 0 && metrics.lLat !== 0 && (
                    <Polyline
                      positions={[
                        [metrics.rLat, metrics.rLon],
                        [metrics.lLat, metrics.lLon]
                      ]}
                      pathOptions={{
                        color: '#dc2626',
                        weight: 3,
                        dashArray: '8, 6',
                        opacity: 0.95,
                        className: 'report-release-polyline'
                      }}
                    />
                  )}

                  {/* Amber dashed vector line: Last GPS Position -> Field Camp */}
                  {metrics.lLat !== 0 && metrics.cLat !== 0 && (
                    <Polyline
                      positions={[
                        [metrics.lLat, metrics.lLon],
                        [metrics.cLat, metrics.cLon]
                      ]}
                      pathOptions={{
                        color: '#f59e0b',
                        weight: 3,
                        dashArray: '8, 6',
                        opacity: 0.95,
                        className: 'report-camp-polyline'
                      }}
                    />
                  )}

                  {/* QGIS Imported Vector Layers from Store */}
                  {qgisLayers && qgisLayers.filter(l => l.visible && l.type === 'file' && qgisGeoJSONCache?.[l.id]).map(layer => (
                    <GeoJSON 
                      key={`qgis-${layer.id}-${JSON.stringify(layer.style)}`}
                      data={qgisGeoJSONCache[layer.id]}
                      style={(feature) => ({
                        color: feature?.properties?._color || layer.style.color,
                        fillColor: feature?.properties?._color || layer.style.fillColor,
                        fillOpacity: layer.style.fillOpacity,
                        weight: layer.style.weight,
                        radius: layer.style.radius || 6
                      })}
                      pointToLayer={(feature, latlng) => {
                        const featColor = feature?.properties?._color || layer.style.fillColor;
                        const strokeColor = feature?.properties?._color || layer.style.color;
                        return L.circleMarker(latlng, {
                          radius: layer.style.radius || 6,
                          fillColor: featColor,
                          color: strokeColor,
                          weight: layer.style.weight,
                          opacity: 1,
                          fillOpacity: layer.style.fillOpacity
                        });
                      }}
                      onEachFeature={(feature, leafletLayer) => {
                        if (feature.properties) {
                          const props = Object.entries(feature.properties)
                            .filter(([k, v]) => v !== null && v !== undefined && k !== '_color')
                            .map(([k, v]) => `<b>${k === '_qgisLayer' ? 'QGIS Layer' : k}:</b> ${v}`)
                            .join('<br/>');
                          if (props) {
                            leafletLayer.bindPopup(`<div style="max-height:200px;overflow-y:auto;font-size:12px"><b style="color:#059669">${feature.properties._qgisLayer || layer.name}</b><br/><hr style="margin:4px 0;border-color:#e5e7eb"/>${props}</div>`);
                          }
                        }
                      }}
                    />
                  ))}

                  {/* QGIS WMS Layers from Store */}
                  {qgisLayers && qgisLayers.filter(l => l.visible && l.type === 'wms' && l.sourceUrl).map(layer => (
                    <TileLayer
                      key={`wms-${layer.id}`}
                      url={`${layer.sourceUrl}${layer.sourceUrl!.includes('?') ? '&' : '?'}service=WMS&request=GetMap&layers=${layer.wmsLayers || ''}&styles=&format=image/png&transparent=true&version=1.1.1&srs=EPSG:4326&bbox={bbox-epsg-3857}&width=256&height=256`}
                      zIndex={layer.zIndex || 700}
                    />
                  ))}

                  {/* Distance badge on Release-to-Last line - offset 10px to the right of the line so it never overlaps the line */}
                  <Marker
                    position={metrics.releaseToLastMid}
                    icon={createDistancePillIcon(`${metrics.distFromReleaseKm} km`, '#dc2626', [-10, 11])}
                    zIndexOffset={2000}
                    interactive={false}
                  />

                  {/* Distance badge on Last-to-Camp line - offset 10px above the line so it never overlaps the line */}
                  <Marker
                    position={metrics.lastToCampMid}
                    icon={createDistancePillIcon(`${metrics.distToCampKm} km`, '#d97706', [36, 32])}
                    zIndexOffset={2000}
                    interactive={false}
                  />

                  {/* 1. Marker: Installation / Release Location (Live Tracking Pin & Number Label) */}
                  <Marker
                    position={[metrics.rLat, metrics.rLon]}
                    icon={createLiveTrackingMarkerIcon({
                      number: String(selectedPttId).replace(/^trans-/, ''),
                      pinColorHex: '#701a2b',
                      borderColorHex: '#701a2b',
                      labelTitle: 'موقع تركيب الجهاز'
                    })}
                    zIndexOffset={2000}
                  />

                  {/* 2. Marker: Last GPS Location (Live Tracking Pin & Number Label) */}
                  <Marker
                    position={[metrics.lLat, metrics.lLon]}
                    icon={createLiveTrackingMarkerIcon({
                      number: String(selectedPttId).replace(/^trans-/, ''),
                      pinColorHex: '#22c55e',
                      borderColorHex: '#22c55e',
                      labelTitle: 'آخر موقع'
                    })}
                    zIndexOffset={2000}
                  />

                  {/* 3. Marker: Field Camp (Live Tracking Camp Badge & Label) */}
                  <Marker
                    position={[metrics.cLat, metrics.cLon]}
                    icon={createLiveTrackingCampIcon(activeCamp.name || 'المخيم')}
                    zIndexOffset={2000}
                  />
                </MapContainer>

                {/* Floating exit button when in Fullscreen mode */}
                {isMapFullscreen && (
                  <button
                    type="button"
                    onClick={() => setIsMapFullscreen(false)}
                    className="no-print absolute top-4 right-4 z-[1000] flex items-center gap-1.5 bg-slate-900/90 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg border border-white/20 shadow-xl text-xs font-bold transition-colors"
                  >
                    <Minimize2 size={14} />
                    <span>إغلاق ملء الشاشة (Esc)</span>
                  </button>
                )}


                {/* Floating Map Controls for Interactive Live Tracking feel (Hidden on Print & Export) */}
                <div 
                  className="no-print absolute bottom-2 left-2 z-[1000] flex items-center gap-1 bg-slate-900/85 backdrop-blur-md px-1.5 py-1 rounded-lg border border-white/20 shadow-lg text-white select-none"
                  style={{ direction: 'rtl' }}
                >
                  {/* Fullscreen Toggle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsReportFullscreen(true);
                    }}
                    className="p-1 rounded transition-colors text-white hover:bg-white/20"
                    title="عرض التقرير بالكامل بملء الشاشة"
                  >
                    <Maximize2 size={14} />
                  </button>
                  <div className="w-px h-3.5 bg-white/25 mx-0.5" />

                  {/* Zoom In */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      mapInstance?.zoomIn();
                    }}
                    className="p-1 hover:bg-white/20 rounded transition-colors text-white"
                    title="تكبير الخريطة (Zoom In)"
                  >
                    <Plus size={14} />
                  </button>
                  {/* Zoom Out */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      mapInstance?.zoomOut();
                    }}
                    className="p-1 hover:bg-white/20 rounded transition-colors text-white"
                    title="تصغير الخريطة (Zoom Out)"
                  >
                    <Minus size={14} />
                  </button>
                  <div className="w-px h-3.5 bg-white/25 mx-0.5" />
                  {/* Recenter */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFitKey(k => k + 1);
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/20 rounded text-[11px] font-medium transition-colors text-white"
                    title="إعادة ضبط الموقع ليتناسب مع النقاط"
                  >
                    <Crosshair size={13} />
                    <span>توسيط</span>
                  </button>
                  <div className="w-px h-3.5 bg-white/25 mx-0.5" />
                  {/* Layer Quick Switcher */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowLayerMenu(prev => !prev);
                      }}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition-colors text-white ${
                        showLayerMenu ? 'bg-brand-600' : 'hover:bg-white/20'
                      }`}
                      title="تغيير نوع الخريطة"
                    >
                      <Layers size={13} />
                      <span>الطبقات</span>
                    </button>
                    {showLayerMenu && (
                      <div 
                        className="absolute bottom-full left-0 mb-1.5 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-lg p-1.5 shadow-2xl min-w-[175px] space-y-1 text-right z-[1100]"
                        dir="rtl"
                      >
                        <div className="text-[10px] font-bold text-gray-400 px-2 py-0.5 border-b border-slate-800">
                          نوع الخريطة (Base Map):
                        </div>
                        {[
                          { id: 'google_hybrid', name: 'جوجل هجين (Google Hybrid)' },
                          { id: 'google_roadmap', name: 'جوجل شوارع (Google Roadmap)' },
                          { id: 'google_satellite', name: 'جوجل أقمار (Google Satellite)' },
                          { id: 'scienceterrain', name: 'أقمار Esri (Esri Satellite)' },
                          { id: 'roadmap', name: 'OpenStreetMap' }
                        ].map(l => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              setActiveBaseLayer(l.id as any);
                              setShowLayerMenu(false);
                            }}
                            className={`w-full text-right px-2 py-1 text-[11px] rounded flex items-center justify-between transition-colors ${
                              activeBaseLayer === l.id 
                                ? 'bg-brand-600 text-white font-bold' 
                                : 'text-gray-200 hover:bg-slate-800'
                            }`}
                          >
                            <span>{l.name}</span>
                            {activeBaseLayer === l.id && <Check size={12} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── MAP OVERLAYS ────────────────────────────────────────── */}

                {/* Top-Left Inset: Country Locator Map & Exact Bird Position with Transmitter ID */}
                <div className="absolute top-2 left-2 z-[1000] bg-white/95 backdrop-blur-sm border border-gray-500 rounded-sm p-1 shadow-md w-[150px] pointer-events-none">
                  <div className="flex items-center justify-between pb-0.5 border-b border-gray-200 mb-0.5 px-1">
                    <span 
                      id="country-inset-title"
                      dir="rtl"
                      className="text-[10.5px] font-black text-gray-800"
                      style={{ letterSpacing: '0px', fontFamily: "'Sakkal Majalla', 'Traditional Arabic', 'Segoe UI', Arial, sans-serif" }}
                    >
                      {insetMapData.countryNameAr || 'كازاخستان'}
                    </span>
                    <span className="text-[8px] font-black text-gray-700">▲ N</span>
                  </div>
                  <div className="relative w-full h-[82px] flex items-center justify-center bg-stone-50 border border-gray-200 overflow-hidden">
                    {insetMapData.svgPath ? (
                      <svg viewBox={insetMapData.viewBox} className="w-full h-full">
                        {/* Complete Country Silhouette Border */}
                        <path
                          d={insetMapData.svgPath}
                          fill="#fdfbf7"
                          stroke="#475569"
                          strokeWidth="1.1"
                          strokeLinejoin="round"
                        />

                        {/* Red Location Point & Transmitter ID Callout Badge */}
                        {(() => {
                          const pttLabel = String(selectedPttId).replace(/^trans-/, '');
                          const labelW = Math.max(28, pttLabel.length * 5.2 + 6);
                          const labelH = 10;
                          const badgeX = Math.max(labelW / 2 + 2, Math.min(150 - labelW / 2 - 2, insetMapData.birdPoint.x));
                          const isNearTop = insetMapData.birdPoint.y < 16;
                          const badgeY = isNearTop ? insetMapData.birdPoint.y + 4.5 : insetMapData.birdPoint.y - 12.5;

                          return (
                            <g>
                              {/* Pointer triangle connecting badge to exact point */}
                              <polygon 
                                points={
                                  isNearTop
                                    ? `${insetMapData.birdPoint.x - 2},${badgeY} ${insetMapData.birdPoint.x + 2},${badgeY} ${insetMapData.birdPoint.x},${insetMapData.birdPoint.y + 1}`
                                    : `${insetMapData.birdPoint.x - 2},${badgeY + labelH} ${insetMapData.birdPoint.x + 2},${badgeY + labelH} ${insetMapData.birdPoint.x},${insetMapData.birdPoint.y - 1}`
                                } 
                                fill="#b91c1c" 
                              />

                              {/* Transmitter ID Badge */}
                              <rect 
                                x={badgeX - labelW / 2} 
                                y={badgeY} 
                                width={labelW} 
                                height={labelH} 
                                rx="2" 
                                fill="#ffffff" 
                                stroke="#b91c1c" 
                                strokeWidth="0.8" 
                              />
                              <text 
                                x={badgeX} 
                                y={badgeY + labelH / 2 + 0.6} 
                                textAnchor="middle" 
                                dominantBaseline="middle" 
                                fontSize="6.8" 
                                fontWeight="bold" 
                                fontFamily="'Segoe UI', Roboto, monospace, sans-serif" 
                                fill="#701a2b"
                              >
                                {pttLabel}
                              </text>

                              {/* Red GPS Point with subtle halo */}
                              <circle 
                                cx={insetMapData.birdPoint.x} 
                                cy={insetMapData.birdPoint.y} 
                                r="4.2" 
                                fill="#dc2626" 
                                opacity="0.35" 
                              />
                              <circle 
                                cx={insetMapData.birdPoint.x} 
                                cy={insetMapData.birdPoint.y} 
                                r="2.5" 
                                fill="#dc2626" 
                                stroke="#ffffff" 
                                strokeWidth="0.8" 
                              />
                            </g>
                          );
                        })()}
                      </svg>
                    ) : (
                      <div className="text-[9px] text-gray-400 font-bold">{insetMapData.countryNameAr || 'كازاخستان'}</div>
                    )}
                  </div>
                </div>

                {/* Top-Right: GIS North Arrow Symbol */}
                <div className="absolute top-2.5 right-3 z-[1000] flex flex-col items-center pointer-events-none drop-shadow">
                  <svg width="18" height="26" viewBox="0 0 20 30" fill="none">
                    <polygon points="10,0 0,26 10,20" fill="#ffffff" stroke="#000000" strokeWidth="1" />
                    <polygon points="10,0 20,26 10,20" fill="#111827" stroke="#000000" strokeWidth="1" />
                  </svg>
                  <span className="text-[11px] font-black text-white font-mono leading-none mt-0.5">N</span>
                </div>

                {/* Graticule Perimeter Labels (Ticks) - Vector SVGs ensure coordinate text is permanently centered inside the gray pill on both web and html2canvas exports */}
                <div className="absolute top-1 left-36 z-[900] pointer-events-none select-none">
                  <svg width="72" height="16" viewBox="0 0 72 16" style={{ display: 'block' }}>
                    <rect x="0" y="0" width="72" height="16" rx="4" fill="rgba(0, 0, 0, 0.55)" />
                    <text x="36" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                      47° 15.0000'N
                    </text>
                  </svg>
                </div>
                <div className="absolute top-1/2 -translate-y-1/2 left-1 z-[900] pointer-events-none select-none">
                  <svg width="72" height="16" viewBox="0 0 72 16" style={{ display: 'block' }}>
                    <rect x="0" y="0" width="72" height="16" rx="4" fill="rgba(0, 0, 0, 0.55)" />
                    <text x="36" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                      47° 00.0000'N
                    </text>
                  </svg>
                </div>
                <div className="absolute bottom-6 left-1 z-[900] pointer-events-none select-none">
                  <svg width="72" height="16" viewBox="0 0 72 16" style={{ display: 'block' }}>
                    <rect x="0" y="0" width="72" height="16" rx="4" fill="rgba(0, 0, 0, 0.55)" />
                    <text x="36" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                      46° 45.0000'N
                    </text>
                  </svg>
                </div>

              </div>

              {/* Map Legend Bar Under Map - 5 unified cells ensure icons and writing are permanently locked on the exact same horizontal baseline on both web and export */}
              <div 
                className="border border-gray-300 rounded-sm bg-white py-1.5 px-2 shadow-xs select-none"
                style={{ direction: 'rtl' }}
              >
                <table id="map-legend-bar" style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl', margin: 0, padding: 0 }}>
                  <tbody>
                    <tr>
                      {/* 1. موقع تركيب الجهاز */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 4px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                            <circle cx="5" cy="5" r="4.2" fill="#701a2b" stroke="#ffffff" strokeWidth="1" />
                          </svg>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap', lineHeight: '14px' }}>موقع تركيب الجهاز</span>
                        </div>
                      </td>

                      {/* 2. آخر موقع */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 4px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                            <circle cx="5" cy="5" r="4.2" fill="#22c55e" stroke="#ffffff" strokeWidth="1" />
                          </svg>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap', lineHeight: '14px' }}>آخر موقع ({telemetryData.lastGpsPos.dateStr})</span>
                        </div>
                      </td>

                      {/* 3. المسار المباشر */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 4px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <svg width="18" height="10" viewBox="0 0 18 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                            <line x1="0" y1="5" x2="18" y2="5" stroke="#dc2626" strokeWidth="2.5" strokeDasharray="5 3"/>
                          </svg>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap', lineHeight: '14px' }}>المسار المباشر</span>
                        </div>
                      </td>

                      {/* 4. المخيم */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 4px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                            <path d="M19 20 10 4 1 20h18Z" fill="#f59e0b" fillOpacity="0.35"/>
                            <path d="M10 4 23 20"/>
                            <path d="m10 4 4.5 16"/>
                          </svg>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap', lineHeight: '14px' }}>{activeCamp.name || 'المخيم'}</span>
                        </div>
                      </td>

                      {/* 5. البعد عن المخيم */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 4px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <svg width="18" height="10" viewBox="0 0 18 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                            <line x1="0" y1="5" x2="18" y2="5" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="5 3"/>
                          </svg>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap', lineHeight: '14px' }}>البعد عن المخيم</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>

            {/* ─── COLUMN 2 (RIGHT): DATA TABLES & METRICS (approx 42% width) ── */}
            <div className="w-[42%] flex flex-col space-y-3.5" style={{ direction: 'rtl' }}>
              
              {/* TABLE 1: BIRD DATA (بيانات الطائر) */}
              <div className="border border-gray-300 rounded-sm overflow-hidden shadow-xs">
                <div 
                  id="bird-data-header"
                  className="w-full bg-[#701a2b] text-white py-1.5 px-3 text-center text-[13.5px] font-bold"
                  style={{ letterSpacing: 'normal', display: 'block', textAlign: 'center', width: '100%', lineHeight: '22px' }}
                >
                  بيانات الطائر
                </div>
                <table id="bird-data-table" className="w-full text-[12px] text-center border-collapse" style={{ textAlign: 'center' }}>
                  <tbody>
                    <tr className="border-b border-gray-200 bg-white">
                      <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-center" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>رقم جهاز التتبع</div>
                      </td>
                      <td className="py-1.5 px-3 text-center w-1/2 border-r border-gray-200" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>
                          <span className="font-mono font-black text-[#701a2b] text-[13px]">
                            {String(selectedPttId).replace(/^trans-/, '')}
                          </span>
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200 bg-white">
                      <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-center" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>رقم الحجل</div>
                      </td>
                      <td className="py-1.5 px-3 text-center w-1/2 border-r border-gray-200" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>
                          <svg width="76" height="22" viewBox="0 0 76 22" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                          <rect x="1" y="1" width="74" height="20" rx="10" fill="#f3f4f6"/>
                          <text x="38" y="11.5" textAnchor="middle" dominantBaseline="middle" fontSize="11.5" fontWeight="bold" fill="#374151" fontFamily="monospace, 'Segoe UI', Arial">
                            {customMetadata.birdRing || 'NA'}
                          </text>
                        </svg>
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200 bg-white">
                      <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-center" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>النوعية</div>
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-gray-800 text-center w-1/2 border-r border-gray-200" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>
                          {customMetadata.species === 'Houbara Bustard' ? 'وحش' : (customMetadata.species || 'وحش')}
                        </div>
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200 bg-white">
                      <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-center" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>الجنس</div>
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-gray-800 text-center w-1/2 border-r border-gray-200" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>
                          {customMetadata.gender || 'ذكر'}
                        </div>
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-center" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>حالة الطائر</div>
                      </td>
                      <td className="py-1.5 px-3 text-center w-1/2 border-r border-gray-200" style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>
                          <svg width="56" height="22" viewBox="0 0 56 22" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                          <rect x="1" y="1" width="54" height="20" rx="10" fill="#ecfdf5"/>
                          <text x="28" y="11.5" textAnchor="middle" dominantBaseline="middle" fontSize="11.5" fontWeight="bold" fill="#059669" fontFamily="'Segoe UI', Tahoma, sans-serif">
                            {customMetadata.birdStatus || 'حي'}
                          </text>
                        </svg>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* TABLE 2: MOVEMENT & COORDINATES COMPARISON TABLE */}
              <div className="border border-gray-300 rounded-sm overflow-hidden shadow-xs">
                <table 
                  id="table2-coordinates"
                  className="w-full text-[12px] text-center"
                  style={{ 
                    borderCollapse: 'separate', 
                    borderSpacing: 0,
                    direction: 'rtl',
                    fontFamily: "'Sakkal Majalla', 'Traditional Arabic', 'Segoe UI', Arial, sans-serif"
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ width: '22%', backgroundColor: '#f9fafb', borderBottom: '1px solid #d1d5db', padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                      </th>
                      <th style={{ width: '39%', backgroundColor: '#701a2b', color: '#ffffff', borderRight: '1px solid #ffffff', borderBottom: '1px solid #d1d5db', padding: '6px 8px', fontSize: '12px', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>تركيب الجهاز</div>
                      </th>
                      <th style={{ width: '39%', backgroundColor: '#0f766e', color: '#ffffff', borderRight: '1px solid #ffffff', borderBottom: '1px solid #d1d5db', padding: '6px 8px', fontSize: '12px', fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>آخر موقع</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td style={{ backgroundColor: '#f9fafb', color: '#374151', fontWeight: 700, padding: '6px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>التاريخ</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '11.5px', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}><span dir="ltr">{telemetryData.releasePos.dateStr}</span></div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '11.5px', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}><span dir="ltr">{telemetryData.lastGpsPos.dateStr}</span></div>
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <td style={{ backgroundColor: '#f9fafb', color: '#374151', fontWeight: 700, fontSize: '11px', padding: '6px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>خط العرض (N)</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '12px', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{metrics.releaseLatDMM}</span></div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '12px', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{metrics.lastGpsLatDMM}</span></div>
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <td style={{ backgroundColor: '#f9fafb', color: '#374151', fontWeight: 700, fontSize: '11px', padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}>خط الطول (E)</div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '12px', borderRight: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{metrics.releaseLonDMM}</span></div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '12px', borderRight: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ textAlign: 'center', width: '100%', display: 'block', margin: '0 auto' }}><span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{metrics.lastGpsLonDMM}</span></div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 4 KPI METRIC CARDS (GRID OF 4 COLUMNS IN RTL) */}
              <div className="grid grid-cols-4 gap-2 pt-0.5">
                
                {/* Metric 1 (Far Right in RTL): Distance from Release */}
                <div className="border border-gray-300 rounded-sm bg-gray-50/70 p-2 text-center shadow-xs">
                  <div className="text-[14px] font-black text-[#991b1b] font-mono leading-tight mb-0.5" dir="ltr">
                    {metrics.distFromReleaseKm} km
                  </div>
                  <div className="text-[9.5px] font-bold text-gray-600 leading-tight">
                    المسافة من موقع التركيب
                  </div>
                </div>

                {/* Metric 2: Bearing & Direction */}
                <div className="border border-gray-300 rounded-sm bg-gray-50/70 p-2 text-center shadow-xs">
                  <div className="text-[13.5px] font-black text-gray-900 leading-tight mb-0.5">
                    {metrics.bearingArabic.text}
                  </div>
                  <div className="text-[9.5px] font-bold text-gray-600 leading-tight">
                    الاتجاه ({metrics.bearingArabic.degrees}°)
                  </div>
                </div>

                {/* Metric 3: Distance from Camp */}
                <div className="border border-gray-300 rounded-sm bg-gray-50/70 p-2 text-center shadow-xs">
                  <div className="text-[14px] font-black text-gray-900 font-mono leading-tight mb-0.5" dir="ltr">
                    {metrics.distToCampKm} km
                  </div>
                  <div className="text-[9.5px] font-bold text-gray-600 leading-tight">
                    البعد عن المخيم
                  </div>
                </div>

                {/* Metric 4 (Far Left in RTL): Tracking Duration in Days */}
                <div className="border border-gray-300 rounded-sm bg-gray-50/70 p-2 text-center shadow-xs">
                  <div className="text-[14px] font-black text-gray-900 leading-tight mb-0.5" dir="rtl">
                    <span className="font-mono">{metrics.durationDays}</span> يوم
                  </div>
                  <div className="text-[9.5px] font-bold text-gray-600 leading-tight">
                    مدة المتابعة
                  </div>
                </div>

              </div>

            </div>

          </div>

          {/* 3. REPORT FOOTER */}
          <div className="mt-5 pt-2.5 border-t border-gray-200 text-center text-[11.5px] font-semibold text-gray-500" style={{ direction: 'rtl' }}>
            المركز القطري لتكاثر الحبارى والصقور – كازاخستان
          </div>

        </div>

      </div>

    </div>
  );
};
