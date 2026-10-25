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
import { QATAR_POLYGON_COORDS } from '../../src/constants/countryGeometries';

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
  const deg = ((Math.round(bearing) % 360) + 360) % 360;
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

/** Formats bearing into English compass direction and degrees, e.g. "East" & "69°" */
export const formatEnglishBearing = (bearing: number): { text: string; degrees: number; full: string } => {
  const deg = ((Math.round(bearing) % 360) + 360) % 360;
  let dir = 'North';
  if (deg >= 337.5 || deg < 22.5) dir = 'North';
  else if (deg >= 22.5 && deg < 67.5) dir = 'Northeast';
  else if (deg >= 67.5 && deg < 112.5) dir = 'East';
  else if (deg >= 112.5 && deg < 157.5) dir = 'Southeast';
  else if (deg >= 157.5 && deg < 202.5) dir = 'South';
  else if (deg >= 202.5 && deg < 247.5) dir = 'Southwest';
  else if (deg >= 247.5 && deg < 292.5) dir = 'West';
  else dir = 'Northwest';

  return {
    text: dir,
    degrees: deg,
    full: `${dir} (${deg}°)`
  };
};

/** Bilingual bearing formatter */
export const formatBearingByLanguage = (bearing: number, lang: 'ar' | 'en'): { text: string; degrees: number; full: string } => {
  return lang === 'ar' ? formatArabicBearing(bearing) : formatEnglishBearing(bearing);
};

/** Bidirectional translation between Arabic and English compass directions */
export const translateDirection = (dirStr: string, targetLang: 'ar' | 'en'): string => {
  if (!dirStr) return '';
  const trimmed = dirStr.trim();
  const arToEn: Record<string, string> = {
    'شمال': 'North',
    'شمال شرق': 'Northeast',
    'شمالي شرقي': 'Northeast',
    'شرق': 'East',
    'جنوب شرق': 'Southeast',
    'جنوبي شرقي': 'Southeast',
    'جنوب': 'South',
    'جنوب غرب': 'Southwest',
    'جنوبي غربي': 'Southwest',
    'غرب': 'West',
    'شمال غرب': 'Northwest',
    'شمالي غربي': 'Northwest'
  };
  const enToAr: Record<string, string> = {
    'north': 'شمال',
    'n': 'شمال',
    'northeast': 'شمال شرق',
    'ne': 'شمال شرق',
    'east': 'شرق',
    'e': 'شرق',
    'southeast': 'جنوب شرق',
    'se': 'جنوب شرق',
    'south': 'جنوب',
    's': 'جنوب',
    'southwest': 'جنوب غرب',
    'sw': 'جنوب غرب',
    'west': 'غرب',
    'w': 'غرب',
    'northwest': 'شمال غرب',
    'nw': 'شمال غرب'
  };

  if (targetLang === 'en') {
    return arToEn[trimmed] || trimmed;
  } else {
    const lower = trimmed.toLowerCase();
    return enToAr[lower] || trimmed;
  }
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

export interface AutoResolvedLocation {
  iso2?: string;
  countryAr: string;
  countryEn: string;
  regionAr: string;
  regionEn: string;
}

/** Always ensures Kazakhstan is written as "كازاخستان" in Arabic */
export const normalizeCountryAr = (countryStr: string, iso2?: string): string => {
  if (!countryStr) return 'كازاخستان';
  const c = countryStr.trim();
  if (
    iso2?.toUpperCase() === 'KZ' ||
    c === 'قزاقستان' ||
    c === 'كازاخستان' ||
    c.toLowerCase().includes('kazakhstan') ||
    c.includes('قازاق')
  ) {
    return 'كازاخستان';
  }
  if (iso2?.toUpperCase() === 'QA' || c === 'قطر' || c.toLowerCase().includes('qatar')) {
    return 'قطر';
  }
  return c;
};

/** Bilingual region resolver that ensures proper Arabic and English regional names */
export const resolveRegionBilingual = (
  rawAr: string,
  rawEn: string,
  fallbackAr: string = '',
  fallbackEn: string = ''
): { regionAr: string; regionEn: string } => {
  let cleanAr = (rawAr || '')
    .replace(/^(ولاية|محافظة|منطقة|أوبلاست|أوبليس|إقليم)\s+/i, '')
    .replace(/\s+(أوبلاست|أوبليس)$/i, '')
    .trim();

  let cleanEn = (rawEn || '')
    .replace(/^(Region|Province|District|Oblast)\s+/i, '')
    .replace(/\s+(Region|Province|District|Oblast|Awdanı|Aýdany|Aydany)$/i, '')
    .trim();

  // Known dictionary mappings for bilingual resolution
  const map: Record<string, { ar: string; en: string }> = {
    'ألماتي': { ar: 'ألماتي', en: 'Almaty' },
    'almaty': { ar: 'ألماتي', en: 'Almaty' },
    'جيزقازغان': { ar: 'جيزقازغان', en: 'Zhezqazgan' },
    'zhezkazgan': { ar: 'جيزقازغان', en: 'Zhezqazgan' },
    'zhezqazgan': { ar: 'جيزقازغان', en: 'Zhezqazgan' },
    'أوليتاو': { ar: 'أوليتاو', en: 'Ulytau' },
    'ulytau': { ar: 'أوليتاو', en: 'Ulytau' },
    'قراغندي': { ar: 'قراغندي', en: 'Karaganda' },
    'karaganda': { ar: 'قراغندي', en: 'Karaganda' },
    'qaraghandy': { ar: 'قراغندي', en: 'Karaganda' },
    'أستانا': { ar: 'أستانا', en: 'Astana' },
    'astana': { ar: 'أستانا', en: 'Astana' },
    'بخارى': { ar: 'بخارى', en: 'Bukhara' },
    'bukhara': { ar: 'بخارى', en: 'Bukhara' },
    'نواوي': { ar: 'نواوي', en: 'Navoiy' },
    'navoiy': { ar: 'نواوي', en: 'Navoiy' },
    'navoi': { ar: 'نواوي', en: 'Navoiy' },
    'سمرقند': { ar: 'سمرقند', en: 'Samarkand' },
    'samarkand': { ar: 'سمرقند', en: 'Samarkand' },
    'طشقند': { ar: 'طشقند', en: 'Tashkent' },
    'tashkent': { ar: 'طشقند', en: 'Tashkent' },
    'البيض': { ar: 'البيض', en: 'El Bayadh' },
    'el bayadh': { ar: 'البيض', en: 'El Bayadh' },
    'أبوظبي': { ar: 'أبوظبي', en: 'Abu Dhabi' },
    'abu dhabi': { ar: 'أبوظبي', en: 'Abu Dhabi' },
    'الدوحة': { ar: 'الدوحة', en: 'Doha' },
    'doha': { ar: 'الدوحة', en: 'Doha' }
  };

  if (cleanAr && map[cleanAr]) {
    return { regionAr: map[cleanAr].ar, regionEn: map[cleanAr].en };
  }
  if (cleanEn && map[cleanEn.toLowerCase()]) {
    return { regionAr: map[cleanEn.toLowerCase()].ar, regionEn: map[cleanEn.toLowerCase()].en };
  }

  const arIsArabic = /[\u0600-\u06FF]/.test(cleanAr);
  const enIsLatin = /^[A-Za-z\s-]+$/.test(cleanEn);

  return {
    regionAr: arIsArabic ? cleanAr : (fallbackAr || cleanAr),
    regionEn: enIsLatin ? cleanEn : (fallbackEn || cleanEn)
  };
};

export const resolveLocationFromCoords = (lat: number, lon: number): AutoResolvedLocation => {
  if (!lat || !lon || isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) {
    return {
      iso2: 'KZ',
      countryAr: 'كازاخستان',
      countryEn: 'Kazakhstan',
      regionAr: 'جيزقازغان',
      regionEn: 'Zhezqazgan'
    };
  }

  // Explicit check for Qatar peninsula coordinates
  if (lon >= 50.7 && lon <= 51.75 && lat >= 24.5 && lat <= 26.35) {
    return {
      iso2: 'QA',
      countryAr: 'قطر',
      countryEn: 'Qatar',
      regionAr: 'الدوحة',
      regionEn: 'Doha'
    };
  }

  let feat: any = null;
  try {
    feat = (countryCoder as any).feature([lon, lat]);
  } catch (e) {
    console.warn('countryCoder.feature([lon, lat]) failed:', e);
  }

  const countryNameEn = feat?.properties?.nameEn || 'Kazakhstan';
  let countryNameAr = 'كازاخستان';
  const iso2 = feat?.properties?.iso1A2;
  if (iso2) {
    try {
      const ar = (countries as any).getName(iso2, 'ar');
      if (ar) countryNameAr = ar;
    } catch (_) {}
  }
  countryNameAr = normalizeCountryAr(countryNameAr, iso2);

  let regionAr = 'جيزقازغان';
  let regionEn = 'Zhezqazgan';

  if (iso2 === 'KZ') {
    const dAlmaty = calculateDistanceKm(lat, lon, 43.8, 76.5);
    const dZhezkazgan = calculateDistanceKm(lat, lon, 47.7, 67.7);
    if (dAlmaty < dZhezkazgan) {
      regionAr = 'ألماتي';
      regionEn = 'Almaty';
    } else {
      regionAr = 'جيزقازغان';
      regionEn = 'Zhezqazgan';
    }
  } else if (iso2 === 'UZ') {
    if (lon < 65.0) {
      regionAr = 'بخارى';
      regionEn = 'Bukhara';
    } else if (lon < 66.0) {
      regionAr = 'نواوي';
      regionEn = 'Navoiy';
    } else {
      regionAr = 'سمرقند';
      regionEn = 'Samarkand';
    }
  } else if (iso2 === 'DZ') {
    regionAr = 'البيض';
    regionEn = 'El Bayadh';
  } else if (iso2 === 'AE') {
    regionAr = 'أبوظبي';
    regionEn = 'Abu Dhabi';
  } else if (iso2 === 'QA') {
    regionAr = 'الدوحة';
    regionEn = 'Doha';
  } else if (iso2 === 'MA') {
    regionAr = 'كلميم';
    regionEn = 'Guelmim';
  } else {
    regionAr = countryNameAr;
    regionEn = countryNameEn;
  }

  return {
    iso2,
    countryAr: countryNameAr,
    countryEn: countryNameEn,
    regionAr,
    regionEn
  };
};

export function buildCountrySvgData(
  lon: number,
  lat: number,
  width: number = 140,
  height: number = 78,
  padding: number = 5
): CountrySvgResult {
  let feat: any = null;
  const isQatarCoords = (lon >= 50.7 && lon <= 51.75 && lat >= 24.5 && lat <= 26.35);

  if (isQatarCoords) {
    feat = {
      type: 'Feature',
      properties: {
        nameEn: 'Qatar',
        iso1A2: 'QA'
      },
      geometry: {
        type: 'Polygon',
        coordinates: [QATAR_POLYGON_COORDS]
      }
    };
  } else {
    try {
      feat = (countryCoder as any).feature([lon, lat]);
    } catch (e) {
      console.warn('countryCoder.feature([lon, lat]) failed:', e);
    }
    if (feat?.properties?.iso1A2 === 'QA') {
      feat = {
        ...feat,
        properties: {
          ...feat.properties,
          nameEn: 'Qatar',
          iso1A2: 'QA'
        },
        geometry: {
          type: 'Polygon',
          coordinates: [QATAR_POLYGON_COORDS]
        }
      };
    }
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
  countryNameAr = normalizeCountryAr(countryNameAr, iso2);

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
// The legacy Map Production component has been replaced by the duplicate of Custom Map Report.

export { MapProductionReport as QGISMapProductionReport } from "./MapProductionReport";
export type { MapProductionReportProps as QGISMapProductionReportProps } from "./MapProductionReport";
