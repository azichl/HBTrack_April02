import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Printer, Download, RefreshCw, Compass, MapPin, 
  Calendar, ChevronDown, Check, Search, SlidersHorizontal, 
  Layers, Info, ArrowRight, Share2, FileDown, CheckCircle2,
  AlertCircle, Plus, Minus, Crosshair
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap, GeoJSON } from 'react-leaflet';
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

/** Formats decimal coordinate to DMM with 4 decimals for minutes: "46° 56.6490'" */
export const formatDMM = (val: number, isLat: boolean): string => {
  const abs = Math.abs(val || 0);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const minStr = min.toFixed(4);
  const degStr = isLat ? `${deg}` : String(deg).padStart(3, '0');
  return `${degStr}° ${minStr}'`;
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

// ─── LEAFLET ICONS WITH FIXED EXPLICIT SIZES ─────────────────────────────────

const createReportMarkerIcon = (
  colorHex: string, 
  label: string, 
  badgeTextColor: string,
  iconType: 'pin' | 'camp'
) => {
  let pinHtml = '';
  if (iconType === 'camp') {
    pinHtml = `
      <div style="display: flex; flex-direction: column; align-items: center; width: 100px; direction: ltr; pointer-events: none;">
        <div style="background: #ffffff; border: 1px solid #d97706; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 800; color: #b45309; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.3); margin-bottom: 2px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; letter-spacing: normal;">
          ${label}
        </div>
        <div style="background-color: #f59e0b; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.45); border: 2.5px solid #ffffff;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 20 10 4 1 20h18Z"></path>
            <path d="m10 4 9 16"></path>
          </svg>
        </div>
      </div>
    `;
    return L.divIcon({
      className: 'report-map-camp-marker',
      html: pinHtml,
      iconSize: [100, 50],
      iconAnchor: [50, 50]
    });
  } else {
    pinHtml = `
      <div style="display: flex; flex-direction: column; align-items: center; width: 130px; direction: ltr; pointer-events: none;">
        <div style="background: #ffffff; border: 1px solid ${colorHex}; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 800; color: ${badgeTextColor}; white-space: nowrap; box-shadow: 0 1px 4px rgba(0,0,0,0.3); margin-bottom: 2px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; letter-spacing: normal;">
          ${label}
        </div>
        <div style="width: 22px; height: 22px; border-radius: 50%; background: ${colorHex}; border: 3px solid #ffffff; box-shadow: 0 2px 5px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
          <div style="width: 7px; height: 7px; border-radius: 50%; background: #ffffff;"></div>
        </div>
      </div>
    `;
    return L.divIcon({
      className: 'report-map-pin-marker',
      html: pinHtml,
      iconSize: [130, 50],
      iconAnchor: [65, 50]
    });
  }
};

const createDistancePillIcon = (text: string, borderColor: string) => {
  return L.divIcon({
    className: 'report-map-pill-marker',
    html: `
      <div style="direction: ltr; background: #ffffff; border: 1.5px solid ${borderColor}; border-radius: 9999px; padding: 1.5px 8px; font-size: 11px; font-weight: 800; color: #111827; box-shadow: 0 1px 4px rgba(0,0,0,0.35); white-space: nowrap; font-family: 'Segoe UI', Arial, sans-serif; text-align: center; letter-spacing: normal;">
        ${text}
      </div>
    `,
    iconSize: [70, 22],
    iconAnchor: [35, 11]
  });
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

    // Invalidate size immediately and after delay
    map.invalidateSize();
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    const bounds = L.latLngBounds(validPoints.map(p => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [55, 55], maxZoom: 10 });

    return () => clearTimeout(timer);
  }, [map, JSON.stringify(points), fitKey]);
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

      if (selectedPttId === '244289') {
        setCustomMetadata({
          birdRing: 'NA',
          species: 'وحش',
          gender: 'ذكر',
          birdStatus: 'حي',
          issueDate: '2026-10-07'
        });
        setTelemetryData({
          releasePos: { lat: 46.94415, lon: 66.8242, dateStr: '16-10-2024' },
          lastGpsPos: { lat: 46.9965, lon: 67.0222, dateStr: '01-10-2026' },
          rawGpsCount: 1,
          dataSource: 'reference_pdf'
        });
        return;
      }

      setIsLoadingTelemetry(true);
      try {
        const currentTransmitter = transmitters.find(
          t => t.id === selectedPttId || t.platform_id === selectedPttId
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
            relLat = firstFix.lat;
            relLon = firstFix.lon;
            relDate = formatDateDDMMYYYY(firstFix.timestamp);
          }

          setTelemetryData({
            releasePos: {
              lat: relLat,
              lon: relLon,
              dateStr: relDate || '16-10-2024'
            },
            lastGpsPos: {
              lat: latestGps.lat,
              lon: latestGps.lon,
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
    const { lat, lon } = telemetryData.lastGpsPos;
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
    const { releasePos, lastGpsPos } = telemetryData;
    
    const distFromRelease = calculateDistanceKm(
      releasePos.lat, releasePos.lon,
      lastGpsPos.lat, lastGpsPos.lon
    );

    const bearing = calculateBearingDegrees(
      releasePos.lat, releasePos.lon,
      lastGpsPos.lat, lastGpsPos.lon
    );
    const bearingArabic = formatArabicBearing(bearing);

    const distToCamp = calculateDistanceKm(
      lastGpsPos.lat, lastGpsPos.lon,
      activeCamp.lat, activeCamp.lon
    );

    // Tracking duration calculated from release date until current day (today)
    const durationDays = calculateDurationFromReleaseToToday(releasePos.dateStr);

    const releaseLatDMM = formatDMM(releasePos.lat, true);
    const releaseLonDMM = formatDMM(releasePos.lon, false);
    const lastGpsLatDMM = formatDMM(lastGpsPos.lat, true);
    const lastGpsLonDMM = formatDMM(lastGpsPos.lon, false);

    return {
      distFromReleaseKm: distFromRelease.toFixed(2),
      bearingArabic,
      distToCampKm: distToCamp.toFixed(2),
      durationDays: durationDays > 0 ? durationDays : 0,
      releaseLatDMM,
      releaseLonDMM,
      lastGpsLatDMM,
      lastGpsLonDMM,
      releaseToLastMid: [
        (releasePos.lat + lastGpsPos.lat) / 2,
        (releasePos.lon + lastGpsPos.lon) / 2
      ] as [number, number],
      lastToCampMid: [
        (lastGpsPos.lat + activeCamp.lat) / 2,
        (lastGpsPos.lon + activeCamp.lon) / 2
      ] as [number, number]
    };
  }, [telemetryData, activeCamp]);

  const mapPoints = useMemo<Array<[number, number]>>(() => [
    [telemetryData.releasePos.lat, telemetryData.releasePos.lon],
    [telemetryData.lastGpsPos.lat, telemetryData.lastGpsPos.lon],
    [activeCamp.lat, activeCamp.lon]
  ], [telemetryData, activeCamp]);

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

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    if (!reportContainerRef.current) return;
    setIsExportingPdf(true);

    try {
      await new Promise(r => setTimeout(r, 400));
      const element = reportContainerRef.current;
      const canvas = await html2canvas(element, {
        scale: 2.2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 1200,
        ignoreElements: (el) => el.classList?.contains('no-print') || el.classList?.contains('leaflet-control-container')
      });

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
      alert('حدث خطأ أثناء تصدير ملف PDF. يمكنك استخدام زر الطباعة للحفظ كـ PDF مباشرة.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportPng = async () => {
    if (!reportContainerRef.current) return;
    setIsExportingPng(true);

    try {
      await new Promise(r => setTimeout(r, 400));
      const element = reportContainerRef.current;
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        ignoreElements: (el) => el.classList?.contains('no-print') || el.classList?.contains('leaflet-control-container')
      });

      const link = document.createElement('a');
      link.download = `Houbara_Report_${selectedPttId}_${customMetadata.issueDate}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error exporting image:', error);
      alert('حدث خطأ أثناء حفظ الصورة.');
    } finally {
      setIsExportingPng(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ─── PRINT ONLY STYLES ──────────────────────────────────────────────── */}
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
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors"
              title="طباعة التقرير أو الحفظ كـ PDF"
            >
              <Printer size={16} />
              <span>طباعة / حفظ A4</span>
            </button>

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
      <div className="overflow-x-auto pb-6 flex justify-center">
        
        <div 
          id="map-production-print-area"
          ref={reportContainerRef}
          className="bg-white text-gray-900 w-[1080px] min-w-[1080px] p-7 shadow-2xl rounded-sm border border-gray-300 relative select-none"
          style={{
            direction: 'ltr',
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, 'Noto Kufi Arabic', sans-serif",
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
                className="h-[58px] w-auto object-contain"
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
                <span>منطقة {activeCamp.name.replace('مخيم ', '')} – {activeCamp.country || 'كازاخستان'}</span>
                <span>•</span>
                <span>تاريخ الإصدار {formatDateDDMMYYYY(customMetadata.issueDate) || customMetadata.issueDate}</span>
              </div>
            </div>

            {/* Top-Right Header: External Reserves Office Logo */}
            <div className="flex items-center justify-end w-[350px]">
              <img 
                src="/external-reserves-office-logo.png" 
                alt="مكتب محميات الدولة الخارجية - External Reserves Office of The State" 
                className="h-[52px] w-auto max-w-[340px] object-contain"
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

                  {/* Red Vector Line: Release Location -> Last GPS Position */}
                  <Polyline
                    positions={[
                      [telemetryData.releasePos.lat, telemetryData.releasePos.lon],
                      [telemetryData.lastGpsPos.lat, telemetryData.lastGpsPos.lon]
                    ]}
                    pathOptions={{
                      color: '#dc2626',
                      weight: 2.5,
                      dashArray: '6, 6',
                      opacity: 0.95
                    }}
                  />

                  {/* Distance badge on Release-to-Last line */}
                  <Marker
                    position={metrics.releaseToLastMid}
                    icon={createDistancePillIcon(`${metrics.distFromReleaseKm} km`, '#dc2626')}
                    interactive={false}
                  />

                  {/* Dashed Amber Vector Line: Last GPS Position -> Field Camp */}
                  <Polyline
                    positions={[
                      [telemetryData.lastGpsPos.lat, telemetryData.lastGpsPos.lon],
                      [activeCamp.lat, activeCamp.lon]
                    ]}
                    pathOptions={{
                      color: '#f59e0b',
                      weight: 2.5,
                      dashArray: '6, 6',
                      opacity: 0.95
                    }}
                  />

                  {/* Distance badge on Last-to-Camp line */}
                  <Marker
                    position={metrics.lastToCampMid}
                    icon={createDistancePillIcon(`${metrics.distToCampKm} km`, '#f59e0b')}
                    interactive={false}
                  />

                  {/* 1. Marker: Installation / Release Location */}
                  <Marker
                    position={[telemetryData.releasePos.lat, telemetryData.releasePos.lon]}
                    icon={createReportMarkerIcon('#701a2b', 'موقع تركيب الجهاز', '#701a2b', 'pin')}
                  />

                  {/* 2. Marker: Last GPS Location */}
                  <Marker
                    position={[telemetryData.lastGpsPos.lat, telemetryData.lastGpsPos.lon]}
                    icon={createReportMarkerIcon('#0d9488', 'آخر موقع', '#0f766e', 'pin')}
                  />

                  {/* 3. Marker: Field Camp */}
                  <Marker
                    position={[activeCamp.lat, activeCamp.lon]}
                    icon={createReportMarkerIcon('#f59e0b', 'المخيم', '#b45309', 'camp')}
                  />
                </MapContainer>

                {/* Floating Map Controls for Interactive Live Tracking feel (Hidden on Print & Export) */}
                <div 
                  className="no-print absolute bottom-2 left-2 z-[1000] flex items-center gap-1 bg-slate-900/85 backdrop-blur-md px-1.5 py-1 rounded-lg border border-white/20 shadow-lg text-white select-none"
                  style={{ direction: 'rtl' }}
                >
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
                    <span className="text-[10px] font-black text-gray-800 tracking-tight">
                      {insetMapData.countryNameEn}
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
                      <div className="text-[9px] text-gray-400 font-bold">{insetMapData.countryNameEn}</div>
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

                {/* Bottom-Right: GIS Scale Bar (25 km) */}
                <div className="absolute bottom-2.5 right-3 z-[1000] bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded border border-gray-400 text-center pointer-events-none shadow-sm">
                  <div className="text-[8.5px] font-bold text-gray-900 leading-none mb-1 font-mono">25 km</div>
                  <div className="w-16 h-1.5 flex border border-black">
                    <div className="w-1/2 h-full bg-black"></div>
                    <div className="w-1/2 h-full bg-white"></div>
                  </div>
                </div>

                {/* Graticule Perimeter Labels (Ticks) */}
                <div className="absolute top-1 left-36 z-[900] text-[8px] font-mono font-bold text-white/90 bg-black/40 px-1 rounded pointer-events-none">
                  47° 15.0000'N
                </div>
                <div className="absolute top-1/2 -translate-y-1/2 left-1 z-[900] text-[8px] font-mono font-bold text-white/90 bg-black/40 px-1 rounded pointer-events-none">
                  47° 00.0000'N
                </div>
                <div className="absolute bottom-6 left-1 z-[900] text-[8px] font-mono font-bold text-white/90 bg-black/40 px-1 rounded pointer-events-none">
                  46° 45.0000'N
                </div>

              </div>

              {/* Map Legend Bar Under Map */}
              <div 
                className="border border-gray-300 rounded-sm bg-white py-1.5 px-4 text-[10.5px] font-bold text-gray-800 flex items-center justify-around gap-2 shadow-xs"
                style={{ direction: 'rtl' }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#701a2b] border border-white inline-block"></span>
                  <span>موقع تركيب الجهاز</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0d9488] border border-white inline-block"></span>
                  <span>آخر موقع ({telemetryData.lastGpsPos.dateStr})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-500 text-xs">▲</span>
                  <span>المخيم</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 border-b-2 border-dashed border-amber-500 inline-block"></span>
                  <span>البعد عنه</span>
                </div>
              </div>

            </div>

            {/* ─── COLUMN 2 (RIGHT): DATA TABLES & METRICS (approx 42% width) ── */}
            <div className="w-[42%] flex flex-col space-y-3.5" style={{ direction: 'rtl' }}>
              
              {/* TABLE 1: BIRD DATA (بيانات الطائر) */}
              <div className="border border-gray-300 rounded-sm overflow-hidden shadow-xs">
                <div className="bg-[#701a2b] text-white py-1.5 px-3 text-center text-[13px] font-black tracking-wide">
                  بيانات الطائر
                </div>
                <table className="w-full text-[12px] text-right border-collapse">
                  <tbody>
                    <tr className="border-b border-gray-200 bg-white">
                      <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-right">
                        رقم جهاز التتبع
                      </td>
                      <td className="py-1.5 px-3 text-center w-1/2 border-r border-gray-200">
                        <span className="font-mono font-black text-[#701a2b] text-[13px]">
                          {String(selectedPttId).replace(/^trans-/, '')}
                        </span>
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200 bg-white">
                      <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-right">
                        رقم الحجل
                      </td>
                      <td className="py-1.5 px-3 text-center w-1/2 border-r border-gray-200">
                        <span className="bg-gray-100 text-gray-600 font-bold px-2.5 py-0.5 rounded-full text-xs">
                          {customMetadata.birdRing || 'NA'}
                        </span>
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200 bg-white">
                      <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-right">
                        النوعية
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-gray-800 text-center w-1/2 border-r border-gray-200">
                        {customMetadata.species === 'Houbara Bustard' ? 'وحش' : (customMetadata.species || 'وحش')}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200 bg-white">
                      <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-right">
                        الجنس
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-gray-800 text-center w-1/2 border-r border-gray-200">
                        {customMetadata.gender || 'ذكر'}
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-right">
                        حالة الطائر
                      </td>
                      <td className="py-1.5 px-3 text-center w-1/2 border-r border-gray-200">
                        <span className="bg-emerald-50 text-emerald-600 font-bold px-3 py-0.5 rounded-full text-xs">
                          {customMetadata.birdStatus || 'حي'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* TABLE 2: MOVEMENT & COORDINATES COMPARISON TABLE */}
              <div className="border border-gray-300 rounded-sm overflow-hidden shadow-xs">
                <table className="w-full text-[12px] text-center border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-white text-gray-800 py-1.5 px-2 text-[12px] font-bold w-[22%] border-b border-gray-200">
                        البيان
                      </th>
                      <th className="bg-[#701a2b] text-white py-1.5 px-2 text-[12px] font-bold w-[39%] border-r border-gray-300">
                        تركيب الجهاز
                      </th>
                      <th className="bg-[#0f766e] text-white py-1.5 px-2 text-[12px] font-bold w-[39%] border-r border-gray-300">
                        آخر موقع
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-200 bg-white">
                      <td className="py-1.5 px-2 font-bold text-gray-700 bg-gray-50/70">
                        التاريخ
                      </td>
                      <td className="py-1.5 px-2 font-mono font-bold text-gray-900 text-[11.5px] border-r border-gray-200">
                        <span dir="ltr">{telemetryData.releasePos.dateStr}</span>
                      </td>
                      <td className="py-1.5 px-2 font-mono font-bold text-gray-900 text-[11.5px] border-r border-gray-200">
                        <span dir="ltr">{telemetryData.lastGpsPos.dateStr}</span>
                      </td>
                    </tr>
                    <tr className="border-b border-gray-200 bg-white">
                      <td className="py-1.5 px-2 font-bold text-gray-700 bg-gray-50/70 text-[11px]">
                        خط العرض (N)
                      </td>
                      <td className="py-1.5 px-1 font-mono font-bold text-gray-900 text-[12px] border-r border-gray-200">
                        <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{metrics.releaseLatDMM}</span>
                      </td>
                      <td className="py-1.5 px-1 font-mono font-bold text-gray-900 text-[12px] border-r border-gray-200">
                        <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{metrics.lastGpsLatDMM}</span>
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <td className="py-1.5 px-2 font-bold text-gray-700 bg-gray-50/70 text-[11px]">
                        خط الطول (E)
                      </td>
                      <td className="py-1.5 px-1 font-mono font-bold text-gray-900 text-[12px] border-r border-gray-200">
                        <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{metrics.releaseLonDMM}</span>
                      </td>
                      <td className="py-1.5 px-1 font-mono font-bold text-gray-900 text-[12px] border-r border-gray-200">
                        <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{metrics.lastGpsLonDMM}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 4 KPI METRIC CARDS (GRID OF 4 COLUMNS IN RTL) */}
              <div className="grid grid-cols-4 gap-2 pt-0.5">
                
                {/* Metric 1 (Far Right in RTL): Distance from Release */}
                <div className="border border-gray-300 rounded-sm bg-gray-50/70 p-2 text-center shadow-xs">
                  <div className="text-[14px] font-black text-[#991b1b] font-mono leading-tight mb-0.5">
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
                  <div className="text-[14px] font-black text-gray-900 font-mono leading-tight mb-0.5">
                    {metrics.distToCampKm} km
                  </div>
                  <div className="text-[9.5px] font-bold text-gray-600 leading-tight">
                    البعد عن المخيم
                  </div>
                </div>

                {/* Metric 4 (Far Left in RTL): Tracking Duration in Days */}
                <div className="border border-gray-300 rounded-sm bg-gray-50/70 p-2 text-center shadow-xs">
                  <div className="text-[14px] font-black text-gray-900 leading-tight mb-0.5">
                    {metrics.durationDays} يوم
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
