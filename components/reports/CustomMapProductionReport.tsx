import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Download, RefreshCw, Compass, MapPin, 
  Calendar, ChevronDown, Check, Search, SlidersHorizontal, 
  Layers, Info, FileDown, CheckCircle2,
  Plus, Minus, Crosshair, Maximize2, Minimize2,
  Edit3, Trash2, History, Camera, Image as ImageIcon, Sparkles,
  Move, RotateCcw, GripHorizontal, Eye, EyeOff, Ruler, Building2, Upload,
  ChevronLeft, ChevronRight, Palette, ZoomIn, ZoomOut, X
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, useMap, useMapEvents, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import Draggable from 'react-draggable';
const DraggableComponent = Draggable as any;

import { useAppStore } from '../../store/appStore';
import { getHistoricalPositions } from '../../services/firestoreService';
import { FIXED_FIELD_CAMPS, FieldCampPoint } from '../../constants';
import { 
  safeParseTimestamp, 
  classifyLocationType, 
  findBirdForTransmitter 
} from '../../utils/formatting';
import {
  calculateDistanceKm,
  calculateBearingDegrees,
  formatArabicBearing,
  formatDMM,
  formatDateDDMMYYYY,
  formatDateYYYYMMDD,
  calculateDurationFromReleaseToToday,
  getProductionTileLayer,
  buildCountrySvgData
} from './QGISMapProductionReport';

/** Formats coordinate to degree and minute format without dir suffix for coordinates comparison table (e.g. 46° 56.6490′ and 066° 49.4520′) */
export const formatTableDMM = (val: number, isLat: boolean): string => {
  const num = Number(val);
  if (isNaN(num) || num === 0) {
    return isLat ? `00° 00.0000′` : `000° 00.0000′`;
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
  const degStr = isLat ? String(deg) : String(deg).padStart(3, '0');
  return `${degStr}° ${minStr}′`;
};

// ─── LEAFLET ICONS ────────────────────────────────────────────────────────────

const createLiveTrackingPinIcon = (pinColorHex: string) => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `
      <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; display: block;">
        <path d="M12.5 0C5.596 0 0 5.596 0 12.5C0 21.875 12.5 41 12.5 41C12.5 41 25 21.875 25 12.5C25 5.596 19.404 0 12.5 0Z" fill="${pinColorHex}" stroke="#000000" stroke-width="1.2" stroke-opacity="0.3" />
        <circle cx="12.5" cy="12.5" r="5" fill="#ffffff" opacity="0.95" />
      </svg>
    `,
    iconSize: [25, 41],
    iconAnchor: [12.5, 41],
  });
};

const createLiveTrackingLabelIcon = ({
  number,
  ringId,
  borderColorHex,
  labelTitle
}: {
  number: string;
  ringId?: string;
  borderColorHex: string;
  labelTitle?: string;
}) => {
  const rawId = String(number || '').trim().replace(/^trans-/, '');
  const isNA = !rawId || rawId.toUpperCase() === 'NA' || rawId.toUpperCase() === 'N/A' || rawId.toUpperCase() === 'NONE';
  const cleanId = isNA ? (String(ringId || 'NA').trim() || 'NA') : rawId;
  const hasTitle = Boolean(labelTitle);
  const totalW = 160;
  const totalH = hasTitle ? 45 : 25;
  const pillW = Math.max(54, cleanId.length * 7.5 + 16);

  return L.divIcon({
    className: 'bg-transparent cursor-grab active:cursor-grabbing',
    html: `
      <svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; display: block;">
        ${hasTitle ? `
          <text 
            x="${totalW / 2}" 
            y="12" 
            text-anchor="middle" 
            dominant-baseline="middle"
            font-family="'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif" 
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
          font-family="'Cairo', monospace, Arial" 
          font-size="11.5" 
          font-weight="800" 
          fill="#0f172a"
        >
          ${cleanId}
        </text>
      </svg>
    `,
    iconSize: [totalW, totalH],
    iconAnchor: [totalW / 2, totalH + 35],
  });
};

const createLiveTrackingCampPinIcon = () => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `
      <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; display: block;">
        <circle cx="15" cy="15" r="14" fill="#f59e0b" stroke="#ffffff" stroke-width="2"/>
        <g transform="translate(6, 6) scale(0.75)">
          <path d="M19 20 10 4 1 20h18Z" fill="#ffffff" fill-opacity="0.35"/>
          <path d="M10 4 23 20" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round"/>
          <path d="m10 4 4.5 16" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round"/>
        </g>
      </svg>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
};

const createLiveTrackingCampLabelIcon = (campName: string) => {
  const totalW = 140;
  const totalH = 20;

  return L.divIcon({
    className: 'bg-transparent cursor-grab active:cursor-grabbing',
    html: `
      <svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; display: block;">
        <text 
          x="${totalW / 2}" 
          y="12" 
          text-anchor="middle" 
          dominant-baseline="middle"
          font-family="'Cairo', 'Tajawal', 'Segoe UI', Arial, sans-serif" 
          font-size="12" 
          font-weight="800" 
          fill="#ffffff" 
          stroke="#000000" 
          stroke-width="2.6" 
          stroke-linejoin="round" 
          paint-order="stroke fill"
          style="pointer-events: auto;"
        >
          ${campName}
        </text>
      </svg>
    `,
    iconSize: [totalW, totalH],
    iconAnchor: [totalW / 2, totalH + 20]
  });
};

const createDistancePillIcon = (
  text: string, 
  borderColor: string, 
  anchorOffset: [number, number] = [37, 12]
) => {
  const pillW = Math.max(74, text.length * 8 + 14);
  const pillH = 24;

  return L.divIcon({
    className: 'bg-transparent cursor-grab active:cursor-grabbing',
    html: `
      <svg width="${pillW}" height="${pillH}" viewBox="0 0 ${pillW} ${pillH}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; display: block;">
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

/** Controller that sets map center and zoom level */
const CustomReportMapViewController = ({
  center,
  zoom,
  fitKey
}: {
  center: [number, number];
  zoom: number;
  fitKey: number;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.invalidateSize();
    if (center && !isNaN(center[0]) && !isNaN(center[1])) {
      map.setView(center, zoom, { animate: false });
    }
  }, [map, center, zoom, fitKey]);

  return null;
};

const MapInstanceBinder = ({ onMapInstance }: { onMapInstance: (map: L.Map) => void }) => {
  const map = useMap();
  useEffect(() => {
    if (map) onMapInstance(map);
  }, [map, onMapInstance]);
  return null;
};

// Map click listener for distance measurement
const MeasureMapEvents = ({
  isMeasuring,
  onMapClick
}: {
  isMeasuring: boolean;
  onMapClick: (lat: number, lon: number) => void;
}) => {
  useMapEvents({
    click: (e) => {
      if (isMeasuring) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
};

// Distance Measurement Tool Icons
const measureDotIcon = L.divIcon({
  className: 'bg-transparent cursor-grab active:cursor-grabbing',
  html: `<div style="width: 12px; height: 12px; background-color: #ffffff; border-radius: 9999px; border: 2.5px solid #f59e0b; box-shadow: 0 1px 4px rgba(0,0,0,0.5);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const measureEndIcon = L.divIcon({
  className: 'bg-transparent cursor-grab active:cursor-grabbing',
  html: `<div style="width: 18px; height: 18px; background-color: #f59e0b; border-radius: 9999px; border: 2.5px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center;">
    <div style="width: 5px; height: 5px; background-color: #ffffff; border-radius: 9999px;"></div>
  </div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

// ─── INTERFACES ─────────────────────────────────────────────────────────────

export interface HistoryTableRow {
  id: string;
  index: number;
  dateStr: string;
  timeStr: string;
  lat: number;
  lon: number;
  type: string;
  speed: string;
  altitude: string;
  notes: string;
}

export interface CustomLegendItem {
  id: string;
  label: string;
  color: string;
  symbol: 'circle' | 'line' | 'dashed-line' | 'tent' | 'square' | 'star';
  visible: boolean;
}

export const renderLegendSymbol = (symbol: string, color: string) => {
  switch (symbol) {
    case 'circle':
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
          <circle cx="5" cy="5" r="4.2" fill={color} stroke="#ffffff" strokeWidth="1" />
        </svg>
      );
    case 'line':
      return (
        <svg width="18" height="10" viewBox="0 0 18 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
          <line x1="0" y1="5" x2="18" y2="5" stroke={color} strokeWidth="2.5" />
        </svg>
      );
    case 'dashed-line':
      return (
        <svg width="18" height="10" viewBox="0 0 18 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
          <line x1="0" y1="5" x2="18" y2="5" stroke={color} strokeWidth="2.5" strokeDasharray="3,2" />
        </svg>
      );
    case 'tent':
      return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
          <path d="M19 20 10 4 1 20h18Z" fill={color} fillOpacity="0.35"/>
          <path d="M10 4 23 20"/>
          <path d="m10 4 4.5 16"/>
        </svg>
      );
    case 'square':
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
          <rect x="1" y="1" width="8" height="8" rx="1.5" fill={color} stroke="#ffffff" strokeWidth="1" />
        </svg>
      );
    case 'star':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill={color} stroke="#ffffff" strokeWidth="1" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
          <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
        </svg>
      );
    default:
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
          <circle cx="5" cy="5" r="4.2" fill={color} stroke="#ffffff" strokeWidth="1" />
        </svg>
      );
  }
};

export const getCampLegendLabel = (campIds: string[]): string => {
  if (campIds.length === 1) {
    const singleCamp = FIXED_FIELD_CAMPS.find(c => c.id === campIds[0]);
    return singleCamp?.name || 'مخيم';
  }
  return 'مخيم';
};

export interface CustomMapProductionReportProps {
  onBack?: () => void;
}

export const CustomMapProductionReport: React.FC<CustomMapProductionReportProps> = ({ onBack }) => {
  const { 
    transmitters = [], 
    birds = [], 
    positions = [],
    exportedMapView,
    sharedMapCenter,
    sharedMapZoom
  } = useAppStore();

  // Selected Transmitter
  const initialPtt = useMemo(() => {
    if (exportedMapView?.transmitterId) return exportedMapView.transmitterId;
    if (transmitters.length > 0) {
      const activeT = transmitters.find(t => t.status === 'active');
      return activeT?.platform_id || transmitters[0]?.platform_id || '244289';
    }
    return '244289';
  }, [exportedMapView, transmitters]);

  const [selectedPttId, setSelectedPttId] = useState<string>(initialPtt);
  const [pttSearchTerm, setPttSearchTerm] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [selectedCampId, setSelectedCampId] = useState<string>('auto');

  // Base Map Layer
  const initialBaseLayer = useMemo(() => {
    const imported = exportedMapView?.baseLayer;
    if (imported && ['google_hybrid', 'google_roadmap', 'google_satellite', 'scienceterrain', 'roadmap'].includes(imported)) {
      return imported as any;
    }
    return 'google_roadmap';
  }, [exportedMapView]);

  const [activeBaseLayer, setActiveBaseLayer] = useState<'google_hybrid' | 'google_roadmap' | 'google_satellite' | 'scienceterrain' | 'roadmap'>(initialBaseLayer);
  const [showGoogleLabels, setShowGoogleLabels] = useState<boolean>(true);
  const [fitKey, setFitKey] = useState<number>(0);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  // Map Display Mode:
  // 'snapshot': exact photo screened from live track (as requested by user)
  // 'interactive': dynamic Leaflet map without the old rules (clean, matching live track)
  const [mapDisplayMode, setMapDisplayMode] = useState<'snapshot' | 'interactive'>(
    exportedMapView?.mapSnapshotImage ? 'snapshot' : 'interactive'
  );
  const [mapSnapshotUrl, setMapSnapshotUrl] = useState<string | null>(
    exportedMapView?.mapSnapshotImage || null
  );

  const [mapCenter, setMapCenter] = useState<[number, number]>(exportedMapView?.center || sharedMapCenter || [36.0, 42.0]);
  const [mapZoom, setMapZoom] = useState<number>(exportedMapView?.zoom || sharedMapZoom || 4);

  // ─── FIELD CAMPS FILTER & DISTANCES (AS REQUESTED) ──────────────────────────
  // Choose camps one by one (check case for every camp)
  const [visibleCampIds, setVisibleCampIds] = useState<string[]>(['zhezkazgan_camp', 'almaty_camp']);
  // Distance between each chosen camp and last position
  const [campDistToLastEnabled, setCampDistToLastEnabled] = useState<{ [campId: string]: boolean }>({});
  // Distance between camps
  const [showCampDistance, setShowCampDistance] = useState<boolean>(false);

  // ─── DISTANCE MEASUREMENT TOOL ON MAP (AS REQUESTED) ──────────────────────
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);

  // ─── RELEASE & TRACK TOGGLES ──────────────────────────────────────────────
  const [showReleaseMarker, setShowReleaseMarker] = useState<boolean>(true);
  const [showDistanceToRelease, setShowDistanceToRelease] = useState<boolean>(false);
  const [showFlightTrack, setShowFlightTrack] = useState<boolean>(true);

  // ─── DRAG & DROP PERSONALIZATION MODE ──────────────────────────────────────
  const [isDragEnabled, setIsDragEnabled] = useState<boolean>(false);
  const [dragResetKey, setDragResetKey] = useState<number>(0);

  // Sync with exportedMapView
  useEffect(() => {
    if (exportedMapView) {
      if (exportedMapView.transmitterId) setSelectedPttId(exportedMapView.transmitterId);
      if (exportedMapView.center) setMapCenter(exportedMapView.center);
      if (exportedMapView.zoom) setMapZoom(exportedMapView.zoom);
      if (exportedMapView.baseLayer) setActiveBaseLayer(exportedMapView.baseLayer as any);
      if (exportedMapView.mapSnapshotImage) {
        setMapSnapshotUrl(exportedMapView.mapSnapshotImage);
        setMapDisplayMode('snapshot');
      }
      setFitKey(k => k + 1);
    }
  }, [exportedMapView]);

  // Loading & Customization State
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingPng, setIsExportingPng] = useState<boolean>(false);
  const [isReportFullscreen, setIsReportFullscreen] = useState<boolean>(false);
  const [showCustomizer, setShowCustomizer] = useState<boolean>(false);

  // ─── CHANGEABLE TABLE STATE ────────────────────────────────────────────────
  const [tableMode, setTableMode] = useState<'standard' | 'history_list' | 'both'>('standard');
  const [isTableEditing, setIsTableEditing] = useState<boolean>(false);
  const [historyRowCount, setHistoryRowCount] = useState<number>(8);

  // Editable Bird & Header & Footer Metadata
  const [customMetadata, setCustomMetadata] = useState<{
    birdRing: string;
    species: string;
    gender: string;
    birdStatus: string;
    issueDate: string;
    reportTitle: string;
    regionName: string;
    agencyNameAr: string;
    agencyNameEn: string;
    footerRight: string;
    footerLeft: string;
  }>({
    birdRing: 'NA',
    species: 'وحش',
    gender: 'ذكر',
    birdStatus: 'حي',
    issueDate: formatDateYYYYMMDD(new Date()) || '2026-10-09',
    reportTitle: 'تقرير متابعة طائر حبارى مزود بجهاز تتبع',
    regionName: 'كازاخستان',
    agencyNameAr: 'مكتب محميات الدولة الخارجية',
    agencyNameEn: 'External Reserves Office of The State',
    footerRight: 'المركز القطري لتكاثر الحبارى والصقور – كازاخستان',
    footerLeft: ''
  });

  // Editable Telemetry Values
  const [telemetryData, setTelemetryData] = useState<{
    releasePos: { lat: number; lon: number; dateStr: string };
    lastGpsPos: { lat: number; lon: number; dateStr: string };
    rawGpsCount: number;
    dataSource: 'telemetry' | 'manual' | 'reference_pdf';
  }>({
    releasePos: { lat: 46.94415, lon: 66.8242, dateStr: '16-10-2024' },
    lastGpsPos: { lat: 46.9965, lon: 67.0222, dateStr: '01-10-2026' },
    rawGpsCount: 0,
    dataSource: 'reference_pdf'
  });

  // History Trajectory Records Table (changeable & uploaded from transmitter history)
  const [historyRows, setHistoryRows] = useState<HistoryTableRow[]>([]);
  const [allHistoryPoints, setAllHistoryPoints] = useState<Array<[number, number]>>([]);
  const [historyUploadNotice, setHistoryUploadNotice] = useState<string | null>(null);

  const reportContainerRef = useRef<HTMLDivElement>(null);
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ─── CUSTOM LOGOS & QGIS MAP UPLOAD (USER REQUESTED) ────────────────────────
  const [logoLeftUrl, setLogoLeftUrl] = useState<string>('/qatar-houbara-center-logo.png');
  const [logoRightUrl, setLogoRightUrl] = useState<string>('/qatar-emblem.png');
  const [mapImageFit, setMapImageFit] = useState<'cover' | 'contain' | 'fill'>('contain');

  // Logo Dimensions Management (User requested: click and adjust dimensions)
  const [logoLeftHeight, setLogoLeftHeight] = useState<number>(78);
  const [logoLeftWidth, setLogoLeftWidth] = useState<number>(260);
  const [logoRightHeight, setLogoRightHeight] = useState<number>(64);
  const [logoRightWidth, setLogoRightWidth] = useState<number>(240);
  const [activeResizingLogo, setActiveResizingLogo] = useState<'left' | 'right' | null>(null);

  const mapImageInputRef = useRef<HTMLInputElement>(null);
  const logoLeftInputRef = useRef<HTMLInputElement>(null);
  const logoRightInputRef = useRef<HTMLInputElement>(null);

  const handleMapImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setMapSnapshotUrl(result);
        setMapDisplayMode('snapshot');
        setHistoryUploadNotice(`تم بنجاح تحميل خريطة QGIS (${file.name}) وتثبيتها في نافذة الخريطة.`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'left' | 'right') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        if (side === 'left') {
          setLogoLeftUrl(result);
          setHistoryUploadNotice(`تم بنجاح تحديث الشعار الأيسر (${file.name}).`);
        } else {
          setLogoRightUrl(result);
          setHistoryUploadNotice(`تم بنجاح تحديث الشعار الأيمن (${file.name}).`);
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Close logo resizing popover when clicking outside
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.logo-control-popover') && 
          !(e.target as HTMLElement).closest('.logo-clickable-container')) {
        setActiveResizingLogo(null);
      }
    };
    if (activeResizingLogo) {
      document.addEventListener('mousedown', handleGlobalClick);
      return () => document.removeEventListener('mousedown', handleGlobalClick);
    }
  }, [activeResizingLogo]);

  // Check if transmitter ID is NA -> Fallback to Ring ID
  const isPttNA = useMemo(() => {
    const raw = String(selectedPttId || '').trim().toUpperCase();
    return !raw || raw === 'NA' || raw === 'N/A' || raw === 'NONE';
  }, [selectedPttId]);

  const displayTransmitterLabel = useMemo(() => {
    if (isPttNA) {
      return customMetadata.birdRing || 'NA';
    }
    return String(selectedPttId).replace(/^trans-/, '');
  }, [isPttNA, selectedPttId, customMetadata.birdRing]);

  // Distance between camps (Zhezkazgan & Almaty)
  const campDistanceKm = useMemo(() => {
    if (FIXED_FIELD_CAMPS.length >= 2) {
      const c1 = FIXED_FIELD_CAMPS[0];
      const c2 = FIXED_FIELD_CAMPS[1];
      return calculateDistanceKm(c1.lat, c1.lon, c2.lat, c2.lon).toFixed(1);
    }
    return '0.0';
  }, []);

  const campsMidpoint = useMemo<[number, number]>(() => {
    if (FIXED_FIELD_CAMPS.length >= 2) {
      return [
        (FIXED_FIELD_CAMPS[0].lat + FIXED_FIELD_CAMPS[1].lat) / 2,
        (FIXED_FIELD_CAMPS[0].lon + FIXED_FIELD_CAMPS[1].lon) / 2
      ];
    }
    return [45.2, 72.1];
  }, []);

  // Distance Measurement Tool Calculations (Live Tracking Ruler Feature)
  const totalMeasureDistanceKm = useMemo(() => {
    if (measurePoints.length < 2) return '0.00';
    let total = 0;
    for (let i = 0; i < measurePoints.length - 1; i++) {
      total += calculateDistanceKm(
        measurePoints[i][0], measurePoints[i][1],
        measurePoints[i+1][0], measurePoints[i+1][1]
      );
    }
    return total.toFixed(2);
  }, [measurePoints]);

  const segmentDistances = useMemo(() => {
    if (measurePoints.length < 2) return [];
    const list: { midpoint: [number, number]; distKm: string }[] = [];
    for (let i = 0; i < measurePoints.length - 1; i++) {
      const p1 = measurePoints[i];
      const p2 = measurePoints[i+1];
      const d = calculateDistanceKm(p1[0], p1[1], p2[0], p2[1]);
      list.push({
        midpoint: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2],
        distKm: d.toFixed(2)
      });
    }
    return list;
  }, [measurePoints]);

  // ─── CUSTOMIZABLE MAP LEGEND ITEMS (ITEM BY ITEM) ───────────────────────────
  const [legendItems, setLegendItems] = useState<CustomLegendItem[]>([
    {
      id: 'release_pos',
      label: 'موقع تركيب الجهاز',
      color: '#701a2b',
      symbol: 'circle',
      visible: true
    },
    {
      id: 'last_pos',
      label: 'آخر موقع (01-10-2026)',
      color: '#22c55e',
      symbol: 'circle',
      visible: true
    },
    {
      id: 'camps',
      label: 'المخيم',
      color: '#f59e0b',
      symbol: 'tent',
      visible: true
    },
    {
      id: 'camp_dist',
      label: 'البعد عنه',
      color: '#d97706',
      symbol: 'dashed-line',
      visible: true
    },
    {
      id: 'main_road',
      label: 'طريق رئيسي',
      color: '#dc2626',
      symbol: 'line',
      visible: true
    },
    {
      id: 'cities',
      label: 'مدن وقرى',
      color: '#1e293b',
      symbol: 'square',
      visible: true
    }
  ]);
  const [isLegendCustomizedByUser, setIsLegendCustomizedByUser] = useState<boolean>(false);

  const handleUpdateLegendItem = useCallback((id: string, updates: Partial<CustomLegendItem>) => {
    setIsLegendCustomizedByUser(true);
    setLegendItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const handleAddLegendItem = useCallback(() => {
    setIsLegendCustomizedByUser(true);
    const id = 'custom_' + Date.now();
    setLegendItems(prev => [
      ...prev,
      {
        id,
        label: 'عنصر جديد',
        color: '#0284c7',
        symbol: 'circle',
        visible: true
      }
    ]);
  }, []);

  const handleDeleteLegendItem = useCallback((id: string) => {
    setIsLegendCustomizedByUser(true);
    setLegendItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const handleMoveLegendItem = useCallback((index: number, direction: 'left' | 'right') => {
    setIsLegendCustomizedByUser(true);
    setLegendItems(prev => {
      const targetIndex = direction === 'left' ? index + 1 : index - 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  }, []);

  const handleResetLegendItems = useCallback(() => {
    setIsLegendCustomizedByUser(false);
    const dateStr = telemetryData.lastGpsPos?.dateStr || '01-10-2026';
    const campLabel = getCampLegendLabel(visibleCampIds);
    const items: CustomLegendItem[] = [
      {
        id: 'release_pos',
        label: 'موقع تركيب الجهاز',
        color: '#701a2b',
        symbol: 'circle',
        visible: showReleaseMarker
      },
      {
        id: 'last_pos',
        label: `آخر موقع (${dateStr})`,
        color: '#22c55e',
        symbol: 'circle',
        visible: true
      },
      {
        id: 'camps',
        label: campLabel,
        color: '#f59e0b',
        symbol: 'tent',
        visible: visibleCampIds.length > 0
      },
      {
        id: 'camp_dist',
        label: 'البعد عنه',
        color: '#d97706',
        symbol: 'dashed-line',
        visible: true
      },
      {
        id: 'main_road',
        label: 'طريق رئيسي',
        color: '#dc2626',
        symbol: 'line',
        visible: true
      },
      {
        id: 'cities',
        label: 'مدن وقرى',
        color: '#1e293b',
        symbol: 'square',
        visible: true
      }
    ];
    if (showCampDistance && visibleCampIds.length >= 2) {
      items.push({
        id: 'camp_distance',
        label: `بين المخيمات: ${campDistanceKm} km`,
        color: '#059669',
        symbol: 'dashed-line',
        visible: true
      });
    }
    if (measurePoints.length > 1) {
      items.push({
        id: 'measure_distance',
        label: `مسافة مقاسة: ${totalMeasureDistanceKm} km`,
        color: '#eab308',
        symbol: 'dashed-line',
        visible: true
      });
    }
    setLegendItems(items);
  }, [telemetryData.lastGpsPos?.dateStr, showReleaseMarker, visibleCampIds, showCampDistance, campDistanceKm, measurePoints.length, totalMeasureDistanceKm]);

  // Keep legend items smoothly in sync with telemetry date & filters if not manually customized
  useEffect(() => {
    if (!isLegendCustomizedByUser && telemetryData.lastGpsPos?.dateStr) {
      setLegendItems(prev => prev.map(item => {
        if (item.id === 'last_pos') {
          return { ...item, label: `آخر موقع (${telemetryData.lastGpsPos.dateStr})` };
        }
        return item;
      }));
    }
  }, [telemetryData.lastGpsPos?.dateStr, isLegendCustomizedByUser]);

  useEffect(() => {
    if (!isLegendCustomizedByUser) {
      setLegendItems(prev => prev.map(item => {
        if (item.id === 'camps') {
          return {
            ...item,
            label: getCampLegendLabel(visibleCampIds),
            visible: visibleCampIds.length > 0
          };
        }
        return item;
      }));
    }
  }, [visibleCampIds, isLegendCustomizedByUser]);

  useEffect(() => {
    if (!isLegendCustomizedByUser) {
      setLegendItems(prev => prev.map(item => {
        if (item.id === 'release_pos') {
          return { ...item, visible: showReleaseMarker };
        }
        return item;
      }));
    }
  }, [showReleaseMarker, isLegendCustomizedByUser]);

  // ─── UPLOAD FROM HISTORY FUNCTION ──────────────────────────────────────────
  const handleUploadFromHistory = useCallback(async (targetPttId?: string) => {
    const pttId = targetPttId || selectedPttId;
    if (!pttId) return;

    setIsLoadingTelemetry(true);
    setHistoryUploadNotice(null);

    try {
      const cleanId = String(pttId).replace(/^trans-/, '');
      const currentTransmitter = transmitters.find(
        t => t.id === pttId || t.platform_id === pttId ||
             String(t.platform_id).replace(/^trans-/, '') === cleanId
      );
      const currentBird = currentTransmitter ? findBirdForTransmitter(birds, currentTransmitter) : null;

      const pttIdsToQuery = [pttId];
      if (currentTransmitter?.platform_id && !pttIdsToQuery.includes(currentTransmitter.platform_id)) {
        pttIdsToQuery.push(currentTransmitter.platform_id);
      }

      // Check if we already received history positions from Live Tracking export
      let rawPositions: any[] = [];
      if (exportedMapView?.historyPositions && exportedMapView.historyPositions.length > 0 && exportedMapView.transmitterId === pttId) {
        rawPositions = exportedMapView.historyPositions;
      } else {
        const now = new Date();
        const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
        try {
          rawPositions = await getHistoricalPositions(pttIdsToQuery, tenYearsAgo, now);
        } catch (e) {
          console.warn('Historical query error, checking store positions:', e);
        }
      }

      const storePositions = positions.filter(p => {
        const pid = String(p.transmitter_id || (p as any).platformId || (p as any).platform_id || '');
        return pttIdsToQuery.includes(pid);
      });

      const allPositions = [...rawPositions, ...storePositions];

      // Sort positions chronologically
      allPositions.sort((a, b) => safeParseTimestamp(a.timestamp) - safeParseTimestamp(b.timestamp));

      // Filter valid coordinates for trajectory
      const validPoints: Array<[number, number]> = [];
      allPositions.forEach(p => {
        const lat = parseFloat(String(p.lat));
        const lon = parseFloat(String(p.lon));
        if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
          validPoints.push([lat, lon]);
        }
      });
      setAllHistoryPoints(validPoints);

      const gpsPositions = allPositions.filter(p => {
        const locType = classifyLocationType(p.lc, p.locationType, (p as any).satellite);
        return locType === 'GPS';
      });

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
            dateStr: latestGpsDate || formatDateDDMMYYYY(new Date())
          },
          rawGpsCount: gpsPositions.length,
          dataSource: 'telemetry'
        });

        setCustomMetadata(prev => ({
          ...prev,
          birdRing: currentBird?.ring_id || prev.birdRing || 'NA',
          species: currentBird?.species === 'Asian Houbara' ? 'وحش' : (currentBird?.species || 'وحش'),
          gender: currentBird?.sex === 'M' ? 'ذكر' : currentBird?.sex === 'F' ? 'أنثى' : prev.gender,
          birdStatus: currentTransmitter?.status === 'active' ? 'حي' : (currentTransmitter?.status || 'حي'),
          issueDate: formatDateYYYYMMDD(new Date()) || prev.issueDate
        }));

        // Build History Table Rows from latest fixes (reverse chronological)
        const reversedGps = [...gpsPositions].reverse();
        const generatedRows: HistoryTableRow[] = reversedGps.slice(0, 30).map((pos, idx) => {
          const ts = safeParseTimestamp(pos.timestamp);
          const d = new Date(ts);
          const dateStr = formatDateDDMMYYYY(pos.timestamp);
          const timeStr = !isNaN(ts) ? `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC` : '--:--';
          return {
            id: `hist-${pos.id || idx}-${ts}`,
            index: idx + 1,
            dateStr,
            timeStr,
            lat: parseFloat(Number(pos.lat).toFixed(5)),
            lon: parseFloat(Number(pos.lon).toFixed(5)),
            type: classifyLocationType(pos.lc, pos.locationType, (pos as any).satellite) || 'GPS',
            speed: typeof pos.speed_kmh === 'number' ? `${pos.speed_kmh.toFixed(1)} km/h` : '0.0 km/h',
            altitude: (pos as any).altitude ? `${(pos as any).altitude} m` : '-',
            notes: idx === 0 ? 'آخر موقع تم رصده' : idx === gpsPositions.length - 1 ? 'موقع تركيب الجهاز' : 'نقطة مسار'
          };
        });

        setHistoryRows(generatedRows);
        setHistoryUploadNotice(`تم تحميل ${gpsPositions.length} نقطة من سجل جهاز ${pttId} بنجاح!`);
      } else {
        setHistoryUploadNotice(`تم تفعيل النموذج لجهاز ${pttId}.`);
      }
    } catch (err) {
      console.error('Error uploading from history:', err);
      setHistoryUploadNotice('حدث خطأ أثناء تحميل السجل.');
    } finally {
      setIsLoadingTelemetry(false);
    }
  }, [selectedPttId, transmitters, birds, positions, exportedMapView]);

  // Initial load
  useEffect(() => {
    handleUploadFromHistory(selectedPttId);
  }, [selectedPttId, handleUploadFromHistory]);

  // Active Field Camp
  const activeCamp: FieldCampPoint = useMemo(() => {
    const visibleCamps = FIXED_FIELD_CAMPS.filter(c => visibleCampIds.includes(c.id));
    if (visibleCamps.length === 1) return visibleCamps[0];
    if (selectedCampId === 'zhezkazgan_camp') return FIXED_FIELD_CAMPS[0];
    if (selectedCampId === 'almaty_camp') return FIXED_FIELD_CAMPS[1];
    
    const candidates = visibleCamps.length > 0 ? visibleCamps : FIXED_FIELD_CAMPS;
    const lat = parseFloat(String(telemetryData.lastGpsPos.lat)) || 46.9965;
    const lon = parseFloat(String(telemetryData.lastGpsPos.lon)) || 67.0222;
    let nearest = candidates[0];
    let minDist = Infinity;
    for (const c of candidates) {
      const d = calculateDistanceKm(lat, lon, c.lat, c.lon);
      if (d < minDist) {
        minDist = d;
        nearest = c;
      }
    }
    return nearest;
  }, [selectedCampId, visibleCampIds, telemetryData.lastGpsPos]);

  // Metrics
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
      releaseLatDMM: formatDMM(rLat, true),
      releaseLonDMM: formatDMM(rLon, false),
      lastGpsLatDMM: formatDMM(lLat, true),
      lastGpsLonDMM: formatDMM(lLon, false),
      releaseLatTableDMM: formatTableDMM(rLat, true),
      releaseLonTableDMM: formatTableDMM(rLon, false),
      lastGpsLatTableDMM: formatTableDMM(lLat, true),
      lastGpsLonTableDMM: formatTableDMM(lLon, false),
      releaseToLastMid: [
        (rLat + lLat) / 2,
        (rLon + lLon) / 2
      ] as [number, number]
    };
  }, [telemetryData, activeCamp]);

  // Dynamic Kazakhstan country silhouette & bird location for the top-left locator map
  const insetMapData = useMemo(() => {
    const lat = metrics.lLat || 46.9965;
    const lon = metrics.lLon || 67.0222;
    return buildCountrySvgData(lon, lat, 140, 78, 5);
  }, [metrics.lLat, metrics.lLon]);

  const filteredPtts = useMemo(() => {
    const list: string[] = ['244289', '244276'];
    transmitters.forEach(t => {
      if (t.platform_id && !list.includes(t.platform_id)) list.push(t.platform_id);
      if (t.id && !list.includes(t.id)) list.push(t.id);
    });
    if (!pttSearchTerm.trim()) return list;
    return list.filter(id => id.toLowerCase().includes(pttSearchTerm.toLowerCase()));
  }, [transmitters, pttSearchTerm]);

  // ─── HISTORY ROW EDITING HANDLERS ──────────────────────────────────────────
  const handleUpdateHistoryRow = (id: string, field: keyof HistoryTableRow, value: any) => {
    setHistoryRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleDeleteHistoryRow = (id: string) => {
    setHistoryRows(prev => prev.filter(row => row.id !== id));
  };

  const handleAddCustomHistoryRow = () => {
    const newRow: HistoryTableRow = {
      id: `custom-${Date.now()}`,
      index: historyRows.length + 1,
      dateStr: formatDateDDMMYYYY(new Date()),
      timeStr: '12:00 UTC',
      lat: metrics.lLat,
      lon: metrics.lLon,
      type: 'GPS',
      speed: '0.0 km/h',
      altitude: '-',
      notes: 'نقطة مسار مخصصة'
    };
    setHistoryRows([newRow, ...historyRows]);
  };

  // Helper to ensure pixel-perfect, completely stable canvas rendering during html2canvas export / snapshot
  const buildHtml2CanvasMapExportOptions = useCallback((targetElement: HTMLElement, isSnapshotOnly: boolean) => {
    return {
      scale: isSnapshotOnly ? 2 : 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      ignoreElements: (el: Element) => 
        el.id === 'custom-map-quick-snap-btn' ||
        el.classList?.contains('no-export-snapshot') ||
        el.classList?.contains('no-print') || 
        el.classList?.contains('drag-handle') ||
        el.classList?.contains('leaflet-control-zoom') || 
        el.classList?.contains('leaflet-control-attribution'),
      onclone: (clonedDoc: Document) => {
        // 1. Copy all live canvas layers (Google Maps tiles, satellite, base layers)
        const origCanvases = Array.from(targetElement.querySelectorAll('canvas'));
        const clonedCanvases = Array.from(clonedDoc.querySelectorAll('canvas'));
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

        // 2. Format Scale Control on white card background with crisp border (matching reference design)
        const clonedScaleControls = clonedDoc.querySelectorAll('.leaflet-control-scale');
        clonedScaleControls.forEach(sc => {
          const el = sc as HTMLElement;
          el.style.setProperty('background', '#ffffff', 'important');
          el.style.setProperty('background-color', '#ffffff', 'important');
          el.style.setProperty('border', '1px solid rgba(0, 0, 0, 0.35)', 'important');
          el.style.setProperty('border-radius', '4px', 'important');
          el.style.setProperty('padding', '2px 6px 3px 6px', 'important');
          el.style.setProperty('box-shadow', '0 1px 4px rgba(0, 0, 0, 0.25)', 'important');
          el.style.setProperty('display', 'inline-block', 'important');
        });
        const clonedScaleLines = clonedDoc.querySelectorAll('.leaflet-control-scale-line');
        clonedScaleLines.forEach(sl => {
          const el = sl as HTMLElement;
          el.style.setProperty('background', '#ffffff', 'important');
          el.style.setProperty('background-color', '#ffffff', 'important');
          el.style.setProperty('border', '2px solid #000000', 'important');
          el.style.setProperty('border-top', 'none', 'important');
          el.style.setProperty('color', '#000000', 'important');
          el.style.setProperty('font-weight', '800', 'important');
          el.style.setProperty('font-family', "'IBM Plex Sans Arabic', monospace, Arial, sans-serif", 'important');
          el.style.setProperty('font-size', '10px', 'important');
          el.style.setProperty('line-height', '1.1', 'important');
          el.style.setProperty('padding', '1px 5px', 'important');
          el.style.setProperty('border-radius', '2px', 'important');
          el.style.setProperty('text-shadow', 'none', 'important');
          el.style.setProperty('display', 'block', 'important');
        });

        // Set IBM Plex Sans Arabic font on the cloned print container
        const clonedPrintArea = clonedDoc.getElementById('custom-map-production-print-area');
        if (clonedPrintArea) {
          clonedPrintArea.style.setProperty('font-family', "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif", 'important');
        }

        // 3. Fix Leaflet Vector Shift Bug:
        // Leaflet renders SVG paths inside .leaflet-overlay-pane with CSS transforms that
        // html2canvas incorrectly double-translates, shifting polylines and tracks off-center.
        // We eliminate the shifted SVGs from the clone and render pixel-perfect canvas lines
        // positioned at the exact layer coordinates.
        const activeMap = mapInstance || (targetElement.querySelector('.leaflet-container') as any)?._leaflet_map;
        const clonedOverlayPane = clonedDoc.querySelector('.leaflet-overlay-pane') as HTMLElement;

        if (clonedOverlayPane && activeMap) {
          // Wipe out shifted SVGs from the cloned overlay pane
          const overlaySvgs = clonedOverlayPane.querySelectorAll('svg');
          overlaySvgs.forEach(svg => {
            svg.innerHTML = '';
            (svg as unknown as HTMLElement).style.display = 'none';
          });

          try {
            // Collect all points to determine bounding box
            const allPts: L.Point[] = [];

            if (showFlightTrack && allHistoryPoints.length > 0) {
              allHistoryPoints.forEach(pos => {
                try { allPts.push(activeMap.latLngToLayerPoint(pos)); } catch (e) {}
              });
            }

            if (metrics.rLat !== 0 && metrics.rLon !== 0) {
              try { allPts.push(activeMap.latLngToLayerPoint([metrics.rLat, metrics.rLon])); } catch (e) {}
            }

            if (metrics.lLat !== 0 && metrics.lLon !== 0) {
              try { allPts.push(activeMap.latLngToLayerPoint([metrics.lLat, metrics.lLon])); } catch (e) {}
            }

            FIXED_FIELD_CAMPS.forEach(c => {
              try { allPts.push(activeMap.latLngToLayerPoint([c.lat, c.lon])); } catch (e) {}
            });

            if (measurePoints.length > 0) {
              measurePoints.forEach(pos => {
                try { allPts.push(activeMap.latLngToLayerPoint(pos)); } catch (e) {}
              });
            }

            const mapSize = activeMap.getSize();
            let minX = 0;
            let minY = 0;
            let maxX = mapSize.x || 800;
            let maxY = mapSize.y || 450;

            allPts.forEach(pt => {
              if (pt.x < minX) minX = pt.x;
              if (pt.y < minY) minY = pt.y;
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y > maxY) maxY = pt.y;
            });

            minX = Math.floor(minX - 300);
            minY = Math.floor(minY - 300);
            maxX = Math.ceil(maxX + 300);
            maxY = Math.ceil(maxY + 300);

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

              // ─── A. Real Flight Trajectory Line & Fix Dots ───
              if (showFlightTrack && allHistoryPoints.length > 1) {
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = '#6366f1';
                ctx.lineWidth = 2.8;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.globalAlpha = 0.85;

                allHistoryPoints.forEach((pos, idx) => {
                  const pt = activeMap.latLngToLayerPoint(pos);
                  if (idx === 0) ctx.moveTo(pt.x, pt.y);
                  else ctx.lineTo(pt.x, pt.y);
                });
                ctx.stroke();
                ctx.restore();

                // Telemetry fix dots
                allHistoryPoints.forEach((pos) => {
                  const pt = activeMap.latLngToLayerPoint(pos);
                  ctx.save();
                  ctx.beginPath();
                  ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
                  ctx.fillStyle = '#ffffff';
                  ctx.globalAlpha = 0.95;
                  ctx.fill();
                  ctx.lineWidth = 1.5;
                  ctx.strokeStyle = '#4f46e5';
                  ctx.stroke();
                  ctx.restore();
                });
              }

              // ─── B. Distance line between Chosen Camp(s) and Last Position ───
              visibleCampIds.forEach(campId => {
                if (!campDistToLastEnabled[campId]) return;
                const camp = FIXED_FIELD_CAMPS.find(c => c.id === campId);
                if (!camp || metrics.lLat === 0 || metrics.lLon === 0) return;

                const campPt = activeMap.latLngToLayerPoint([camp.lat, camp.lon]);
                const lastPt = activeMap.latLngToLayerPoint([metrics.lLat, metrics.lLon]);

                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = '#d97706';
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.setLineDash([6, 6]);
                ctx.moveTo(campPt.x, campPt.y);
                ctx.lineTo(lastPt.x, lastPt.y);
                ctx.stroke();
                ctx.restore();
              });

              // ─── C. Distance line between Camps ───
              if (showCampDistance && visibleCampIds.length >= 2) {
                const c1 = FIXED_FIELD_CAMPS.find(c => c.id === visibleCampIds[0]) || FIXED_FIELD_CAMPS[0];
                const c2 = FIXED_FIELD_CAMPS.find(c => c.id === visibleCampIds[1]) || FIXED_FIELD_CAMPS[1];
                const pt1 = activeMap.latLngToLayerPoint([c1.lat, c1.lon]);
                const pt2 = activeMap.latLngToLayerPoint([c2.lat, c2.lon]);

                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = '#059669';
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.setLineDash([6, 6]);
                ctx.moveTo(pt1.x, pt1.y);
                ctx.lineTo(pt2.x, pt2.y);
                ctx.stroke();
                ctx.restore();
              }

              // ─── D. Distance line: Release Position to Last Position ───
              if (showDistanceToRelease && metrics.rLat !== 0 && metrics.lLat !== 0) {
                const relPt = activeMap.latLngToLayerPoint([metrics.rLat, metrics.rLon]);
                const lastPt = activeMap.latLngToLayerPoint([metrics.lLat, metrics.lLon]);

                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = '#dc2626';
                ctx.lineWidth = 2.5;
                ctx.lineCap = 'round';
                ctx.setLineDash([6, 6]);
                ctx.moveTo(relPt.x, relPt.y);
                ctx.lineTo(lastPt.x, lastPt.y);
                ctx.stroke();
                ctx.restore();
              }

              // ─── E. Distance Measurement Tool Drawing (Ruler) ───
              if (measurePoints.length > 1) {
                ctx.save();
                ctx.beginPath();
                ctx.strokeStyle = '#eab308';
                ctx.lineWidth = 3.5;
                ctx.lineCap = 'round';
                ctx.setLineDash([7, 7]);

                measurePoints.forEach((pos, idx) => {
                  const pt = activeMap.latLngToLayerPoint(pos);
                  if (idx === 0) ctx.moveTo(pt.x, pt.y);
                  else ctx.lineTo(pt.x, pt.y);
                });
                ctx.stroke();
                ctx.restore();

                // Measure dots
                measurePoints.forEach((pos, idx) => {
                  const pt = activeMap.latLngToLayerPoint(pos);
                  const isEnd = idx === measurePoints.length - 1;
                  ctx.save();
                  ctx.beginPath();
                  ctx.arc(pt.x, pt.y, isEnd ? 7 : 5, 0, Math.PI * 2);
                  ctx.fillStyle = isEnd ? '#f59e0b' : '#ffffff';
                  ctx.fill();
                  ctx.lineWidth = 2.5;
                  ctx.strokeStyle = isEnd ? '#ffffff' : '#f59e0b';
                  ctx.stroke();
                  ctx.restore();
                });
              }
            }

            clonedOverlayPane.appendChild(exportLinesCanvas);
          } catch (err) {
            console.warn('Error rendering custom export lines canvas in clone:', err);
          }

          // Raise marker pane so marker icons and distance pills sit cleanly on top of canvas lines
          const clonedMarkerPane = clonedDoc.querySelector('.leaflet-marker-pane') as HTMLElement;
          if (clonedMarkerPane) {
            clonedMarkerPane.style.zIndex = '800';
          }
        }
      }
    };
  }, [
    mapInstance,
    showFlightTrack,
    allHistoryPoints,
    metrics,
    visibleCampIds,
    campDistToLastEnabled,
    showCampDistance,
    showDistanceToRelease,
    measurePoints
  ]);

  // Re-capture current interactive map view as snapshot photo
  // IMPORTANT: Hide any "التقاط كصورة" button or controls so it NEVER appears in the snapshot!
  const handleCaptureInteractiveMap = async () => {
    if (mapDisplayMode === 'snapshot') {
      setHistoryUploadNotice('الخريطة حالياً في وضع الصورة الثابتة. تم التبديل إلى "تفاعلية" لتتمكن من ضبط المنظور ثم النقر على التقاط كصورة.');
      setMapDisplayMode('interactive');
      setFitKey(k => k + 1);
      return;
    }
    if (!mapViewportRef.current) return;
    const snapBtn = document.getElementById('custom-map-quick-snap-btn');
    if (snapBtn) snapBtn.style.display = 'none';

    try {
      if (mapInstance) mapInstance.invalidateSize();
      await new Promise(r => setTimeout(r, 200));

      const canvas = await html2canvas(
        mapViewportRef.current, 
        buildHtml2CanvasMapExportOptions(mapViewportRef.current, true)
      );
      const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
      setMapSnapshotUrl(dataUrl);
      setMapDisplayMode('snapshot');
      setHistoryUploadNotice('تم التقاط منظور الخريطة بنجاح وتثبيت المسارات وخطوط المسافات بدقة 100%!');
    } catch (e) {
      console.warn('Could not capture map view:', e);
      alert('حدث خطأ أثناء التقاط الخريطة كصورة.');
    } finally {
      if (snapBtn) snapBtn.style.display = '';
    }
  };

  // ─── EXPORT TO PDF & PNG ───────────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (!reportContainerRef.current) return;
    setIsExportingPdf(true);

    const snapBtn = document.getElementById('custom-map-quick-snap-btn');
    if (snapBtn) snapBtn.style.display = 'none';

    try {
      if (mapInstance) mapInstance.invalidateSize();
      await new Promise(r => setTimeout(r, 400));
      const element = reportContainerRef.current;
      if (!element) return;

      const canvas = await html2canvas(
        element, 
        buildHtml2CanvasMapExportOptions(element, false)
      );

      const imgData = canvas.toDataURL('image/jpeg', 0.96);
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight, '', 'FAST');
      const exportFileName = `${customMetadata.issueDate}_${displayTransmitterLabel}_تقرير تتبع`;
      pdf.save(`${exportFileName}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('حدث خطأ أثناء تصدير ملف PDF.');
    } finally {
      if (snapBtn) snapBtn.style.display = '';
      setIsExportingPdf(false);
    }
  };

  const handleExportPng = async () => {
    if (!reportContainerRef.current) return;
    setIsExportingPng(true);

    const snapBtn = document.getElementById('custom-map-quick-snap-btn');
    if (snapBtn) snapBtn.style.display = 'none';

    try {
      if (mapInstance) mapInstance.invalidateSize();
      await new Promise(r => setTimeout(r, 400));
      const element = reportContainerRef.current;
      if (!element) return;

      const canvas = await html2canvas(
        element, 
        buildHtml2CanvasMapExportOptions(element, false)
      );

      const exportFileName = `${customMetadata.issueDate}_${displayTransmitterLabel}_تقرير تتبع`;
      const link = document.createElement('a');
      link.download = `${exportFileName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('Error exporting image:', error);
      alert('حدث خطأ أثناء حفظ الصورة.');
    } finally {
      if (snapBtn) snapBtn.style.display = '';
      setIsExportingPng(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ─── PRINT & REPORT STYLES ────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap');

        #custom-map-production-print-area {
          --maroon: #7a1c32;
          --green: #128a5b;
          --amber: #f5a623;
          --brown: #7a4a12;
          --red: #d9263a;
          --ink: #1f2937;
          --muted: #6b7280;
          --line: #d9dbe1;
          --bg: #f3f4f6;
          font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif !important;
          color: var(--ink);
        }

        #custom-map-production-print-area,
        #custom-map-production-print-area * {
          font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif !important;
        }

        /* Header UI (From Reference Design) */
        .trk-header { display: flex; justify-content: space-between; align-items: center; width: 100%; }
        .trk-header__agency { display: flex; align-items: center; gap: 14px; }
        .trk-header__agency img { height: 64px; }
        .trk-header__rule { width: 1px; height: 52px; background: #7a1c32; }
        .trk-header__names { text-align: right; }
        .trk-header__names .ar { font-size: 18px; font-weight: 600; letter-spacing: 0.02em; color: #1b2433; line-height: 1.25; }
        .trk-header__names .en { font-size: 19px; font-weight: 500; color: #1b2433; line-height: 1.2; font-family: 'Inter', 'Segoe UI', Arial, sans-serif !important; }
        .trk-header__center { height: 78px; }
        .trk-hr { height: 2px; background: #7a1c32; margin: 12px 0 18px; width: 100%; display: block; }

        .trk-title { text-align: center; font-size: 23px; font-weight: 700; margin: 0 0 8px; color: #1b2433; }
        .trk-sub { text-align: center; color: #6b7280; font-size: 13px; margin: 0 0 16px; }
        .trk-sub b { color: #7a1c32; font-weight: 700; }

        /* Two columns: side panel (440px on right in RTL) and map (left) */
        .trk-grid { display: grid; grid-template-columns: 440px 1fr; gap: 24px; flex: 1; min-height: 520px; width: 100%; }
        .trk-side { display: flex; flex-direction: column; gap: 12px; }

        .trk-card { border: 1px solid #d9dbe1; border-radius: 8px; overflow: hidden; background: #fff; }
        .trk-card__head { background: #7a1c32; color: #fff; font-weight: 700; font-size: 14.5px; padding: 10px 14px; text-align: right; }
        .trk-row { display: grid; grid-template-columns: 1fr 1fr; align-items: center; border-top: 1px solid #eceef2; }
        .trk-row:first-of-type { border-top: 0; }
        .trk-row .k { background: #f6f7f9; padding: 7px 14px; font-weight: 600; font-size: 13px; text-align: right; color: #374151; }
        .trk-row .v { padding: 7px 14px; font-size: 13px; text-align: center; }
        .trk-row .v .maroon, .maroon { color: #7a1c32; font-weight: 700; }

        .pill { display: inline-block; padding: 1.5px 12px; border-radius: 999px; font-size: 11px; font-weight: 600; }
        .pill--grey { background: #e8eaee; color: #6b7280; }
        .pill--ok { background: #e3f4ea; color: #15803d; }
        .pill--warn { background: #fdf0d5; color: #a16207; }
        .pill--bad { background: #fde4e4; color: #b91c1c; }

        .trk-card--table { border-color: #d9dbe1; }
        .trk-twohead { display: grid; grid-template-columns: 1fr 1fr 1fr; color: #fff; font-weight: 700; font-size: 14px; }
        .trk-twohead::before { content: ''; background: #fff; }
        .trk-twohead__install { background: #7a1c32; padding: 12px; text-align: center; }
        .trk-twohead__last { background: #128a5b; padding: 12px; text-align: center; }
        .trk-table { display: grid; grid-template-columns: 1fr 1fr 1fr; }
        .trk-table > span { padding: 9px 12px; text-align: center; font-size: 14px; border-top: 1px solid #eceef2; font-variant-numeric: tabular-nums; }
        .trk-table .lbl { background: #f6f7f9; font-weight: 600; text-align: right; order: 0; color: #374151; }

        .trk-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
        .trk-stat { border: 1px solid #d9dbe1; border-radius: 8px; padding: 8px 4px; text-align: center; background: #fff; }
        .trk-stat .val { font-size: 14.5px; font-weight: 700; margin-bottom: 2px; }
        .trk-stat .val.red { color: #d9263a; }
        .trk-stat .val.brown { color: #7a4a12; }
        .trk-stat .lab { font-size: 10px; color: #6b7280; line-height: 1.3; }

        .trk-legend {
          display: flex; flex-wrap: nowrap; gap: 12px; justify-content: center; align-items: center;
          border: 1px solid #d9dbe1; border-radius: 8px; padding: 6px 10px; margin-top: 10px; font-size: 11px; background: #fff; white-space: nowrap;
        }
        .trk-legend span { display: inline-flex; align-items: center; gap: 6px; }
        .trk-legend .dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
        .trk-legend .dot.maroon { background: #7a1c32; }
        .trk-legend .dot.green { background: #128a5b; }
        .trk-legend .tri { width: 0; height: 0; border-inline: 6px solid transparent; border-bottom: 11px solid #f5a623; }
        .trk-legend .line { width: 22px; height: 0; border-top: 3px solid #d9263a; display: inline-block; }
        .trk-legend .line.dotted { border-top: 2px dotted #f5a623; }
        .trk-legend .sq { width: 10px; height: 10px; background: #1c2430; display: inline-block; }
        .trk-footer { margin-top: 12px; border-top: 1px solid #d9dbe1; padding-top: 8px; color: #6b7280; font-size: 12px; text-align: left; }

        #custom-map-production-print-area .leaflet-control-scale {
          background: rgba(255, 255, 255, 0.95) !important;
          background-color: rgba(255, 255, 255, 0.95) !important;
          border: 1px solid rgba(0, 0, 0, 0.35) !important;
          border-radius: 4px !important;
          padding: 2px 6px 3px 6px !important;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25) !important;
          margin-right: 8px !important;
          margin-bottom: 8px !important;
          display: inline-block !important;
        }

        #custom-map-production-print-area .leaflet-control-scale-line {
          background: #ffffff !important;
          background-color: #ffffff !important;
          border: 2px solid #000000 !important;
          border-top: none !important;
          color: #000000 !important;
          font-weight: 800 !important;
          font-family: 'IBM Plex Sans Arabic', monospace, Arial, sans-serif !important;
          font-size: 10px !important;
          line-height: 1.1 !important;
          padding: 1px 5px !important;
          border-radius: 2px !important;
          text-shadow: none !important;
          box-sizing: border-box !important;
          display: block !important;
        }

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
          nav, header, aside, .no-print, .report-toolbar, .drag-handle, #custom-map-quick-snap-btn {
            display: none !important;
          }
          #custom-map-production-print-area {
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

      {/* Hidden File Inputs for QGIS Map & Custom Logos */}
      <input
        ref={mapImageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={handleMapImageUpload}
      />
      <input
        ref={logoLeftInputRef}
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleLogoUpload(e, 'left')}
      />
      <input
        ref={logoRightInputRef}
        type="file"
        accept="image/png,image/svg+xml,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleLogoUpload(e, 'right')}
      />

      {/* ─── CONTROL TOOLBAR (RTL) ────────────────────────────────────────── */}
      <div className="no-print bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4" dir="rtl">
        
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 dark:border-slate-700/60 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Compass size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  إنتاج الخرائط والتقارير المخصصة (Custom Map Report)
                </h2>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                  <Sparkles size={12} />
                  <span>منظور التتبع المباشر</span>
                </span>
                {mapDisplayMode === 'snapshot' && mapSnapshotUrl && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center gap-1">
                    <Camera size={12} />
                    <span>صورة ملتقطة من الخريطة</span>
                  </span>
                )}
                {isTableEditing && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 animate-pulse">
                    وضع تعديل النصوص والجداول مفعل
                  </span>
                )}
                {isDragEnabled && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 animate-pulse flex items-center gap-1">
                    <Move size={12} />
                    <span>وضع السحب والتحريك (Drag & Drop)</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                تقرير ذكي متكامل: تخصيص كامل لكافة النصوص، وتعديل الجداول، والسحب والتحريك، وفلاتر المسافات والمخيمات.
              </p>
            </div>
          </div>

          {/* Action Buttons - Shortened to fit comfortably on a single line */}
          <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto py-0.5">
            {/* Upload from History */}
            <button
              onClick={() => handleUploadFromHistory()}
              disabled={isLoadingTelemetry}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap"
              title="جلب إحداثيات ومسار الجهاز من السجل التاريخي لقاعدة البيانات"
            >
              <History size={14} className={isLoadingTelemetry ? 'animate-spin' : ''} />
              <span>{isLoadingTelemetry ? '...' : 'السجل'}</span>
            </button>

            {/* Toggle Table Edit Mode */}
            <button
              onClick={() => setIsTableEditing(!isTableEditing)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap ${
                isTableEditing 
                  ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-slate-700 dark:text-white'
              }`}
              title="تعديل نصوص التقرير، التذييل، وجداول الإحداثيات مباشرة"
            >
              <Edit3 size={14} />
              <span>{isTableEditing ? 'حفظ' : 'تعديل'}</span>
            </button>

            {/* Drag & Drop Toggle */}
            <button
              onClick={() => setIsDragEnabled(!isDragEnabled)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap ${
                isDragEnabled 
                  ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-slate-700 dark:text-white'
              }`}
              title="تفعيل/تعطيل إمكانية سحب وتحريك عناصر التقرير (Drag & Drop)"
            >
              <Move size={14} />
              <span>{isDragEnabled ? 'تثبيت' : 'تحريك'}</span>
            </button>

            {isDragEnabled && (
              <button
                onClick={() => setDragResetKey(k => k + 1)}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300 rounded-lg whitespace-nowrap"
                title="إعادة تعيين أماكن العناصر للوضع الافتراضي"
              >
                <RotateCcw size={14} />
              </button>
            )}

            {/* Distance Measurement Ruler */}
            <button
              onClick={() => setIsMeasuring(!isMeasuring)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap ${
                isMeasuring 
                  ? 'bg-amber-500 hover:bg-amber-600 text-white ring-2 ring-amber-300' 
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
              }`}
              title="أداة قياس المسافة برسم خطوط على الخريطة وتصديرها مع الـ PNG و PDF"
            >
              <Ruler size={14} className={isMeasuring ? 'animate-pulse' : ''} />
              <span>{isMeasuring ? 'إنهاء' : 'قياس'}</span>
              {measurePoints.length > 1 && (
                <span className="bg-amber-700 text-white text-[10px] px-1 py-0.2 rounded font-mono">
                  {totalMeasureDistanceKm}k
                </span>
              )}
            </button>

            {measurePoints.length > 0 && (
              <button
                onClick={() => setMeasurePoints([])}
                className="p-1.5 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-600 dark:bg-slate-700 dark:text-gray-300 rounded-lg whitespace-nowrap"
                title="مسح خط القياس من على الخريطة"
              >
                <Trash2 size={14} />
              </button>
            )}

            {/* Upload QGIS Map Image */}
            <button
              onClick={() => mapImageInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap"
              title="رفع خريطة بصيغة PNG أو JPG مُعدلة في برنامج QGIS وعرضها بالتقرير"
            >
              <Upload size={14} />
              <span>خريطة QGIS</span>
            </button>

            {/* Export PDF */}
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap"
              title="تصدير التقرير كملف PDF"
            >
              <FileDown size={14} />
              <span>{isExportingPdf ? '...' : 'PDF'}</span>
            </button>

            {/* Export PNG */}
            <button
              onClick={handleExportPng}
              disabled={isExportingPng}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap"
              title="تصدير التقرير كصورة PNG"
            >
              <Download size={14} />
              <span>{isExportingPng ? '...' : 'صورة'}</span>
            </button>

            {/* Fullscreen */}
            <button
              onClick={() => setIsReportFullscreen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap"
              title="معاينة التقرير بملء الشاشة"
            >
              <Maximize2 size={14} />
              <span>ملء الشاشة</span>
            </button>

            {/* Filter & Customizer Toggle */}
            <button
              onClick={() => setShowCustomizer(!showCustomizer)}
              className={`p-1.5 rounded-lg border text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1 ${
                showCustomizer 
                  ? 'bg-brand-50 text-brand-600 border-brand-300 ring-2 ring-brand-500/30 dark:bg-brand-900/30' 
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-slate-700 dark:border-slate-600 dark:text-gray-300'
              }`}
              title="خيارات الفلاتر والمسافات وعناصر الخريطة المتقدمة"
            >
              <SlidersHorizontal size={15} />
            </button>
          </div>
        </div>

        {/* Notice Bar */}
        {historyUploadNotice && (
          <div className="flex items-center justify-between p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-800 dark:text-blue-300">
            <span className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={15} className="text-blue-600 dark:text-blue-400" />
              {historyUploadNotice}
            </span>
            <button onClick={() => setHistoryUploadNotice(null)} className="text-blue-500 hover:text-blue-700 font-bold">×</button>
          </div>
        )}

        {/* Primary Controls Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5 pt-1">
          
          {/* 1. Transmitter Selector */}
          <div className="relative">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              جهاز التتبع (Transmitter ID):
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
                placeholder="رقم الجهاز..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white font-mono"
              />
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {isSearchOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsSearchOpen(false)} />
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
                        {pid === 'NA' && <span className="text-[10px] text-gray-400 font-sans">عرض برقم الحجل</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 2. Map View Mode (Snapshot vs Interactive) */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
              <span>عرض الخريطة (Map Display):</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                {mapDisplayMode === 'snapshot' ? 'صورة ملتقطة' : 'تفاعلية'}
              </span>
            </label>
            <div className="flex bg-gray-100 dark:bg-slate-900 p-1 rounded-xl border border-gray-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setMapDisplayMode('snapshot')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                  mapDisplayMode === 'snapshot' 
                    ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="عرض الصورة الملتقطة طبق الأصل من شاشة التتبع المباشر"
              >
                <Camera size={13} />
                <span>صورة ملتقطة</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMapDisplayMode('interactive');
                  setFitKey(k => k + 1);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                  mapDisplayMode === 'interactive' 
                    ? 'bg-white dark:bg-slate-800 text-brand-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="عرض خريطة تفاعلية نظيفة"
              >
                <Layers size={13} />
                <span>خريطة تفاعلية</span>
              </button>
            </div>
          </div>

          {/* 3. Base Map Layer */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              نوع الخريطة (Base Map):
            </label>
            <div className="relative">
              <select
                value={activeBaseLayer}
                onChange={(e) => setActiveBaseLayer(e.target.value as any)}
                className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white appearance-none cursor-pointer font-medium"
              >
                <option value="google_roadmap">خرائط جوجل عادية – شوارع وتضاريس (Google Roadmap)</option>
                <option value="google_hybrid">خرائط جوجل هجين – أقمار وشوارع (Google Hybrid)</option>
                <option value="google_satellite">خرائط جوجل – أقمار صناعية (Google Satellite)</option>
                <option value="scienceterrain">أقمار صناعية Esri (Esri Satellite)</option>
                <option value="roadmap">خريطة الشوارع (OpenStreetMap)</option>
              </select>
              <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="mt-2.5 flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="showGoogleLabels"
                checked={showGoogleLabels}
                onChange={(e) => setShowGoogleLabels(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer"
              />
              <label htmlFor="showGoogleLabels" className="text-[11.5px] font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                إضافة مسميات جوجل (المدن والطرق) على الخريطة
              </label>
            </div>
          </div>

          {/* 4. Table Display Mode */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              نوع الجدول (Table Style):
            </label>
            <div className="relative">
              <select
                value={tableMode}
                onChange={(e) => setTableMode(e.target.value as any)}
                className="w-full px-3.5 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white appearance-none cursor-pointer font-medium"
              >
                <option value="standard">الجدول القياسي (بيانات الطائر + الإحداثيات)</option>
                <option value="history_list">جدول سجل المسار التاريخي (History Fixes)</option>
                <option value="both">عرض كلا الجدولين في التقرير</option>
              </select>
              <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* 5. Telemetry Status & Snap Button in Toolbar */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-100 dark:border-slate-700/60">
            <div className="space-y-0.5">
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 block">
                حالة الإحداثيات:
              </span>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                {isLoadingTelemetry ? (
                  <>
                    <RefreshCw size={13} className="animate-spin text-brand-500" />
                    <span>جارِ جلب السجل...</span>
                  </>
                ) : telemetryData.rawGpsCount > 0 ? (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span>{telemetryData.rawGpsCount} نقطة مسجلة</span>
                  </>
                ) : (
                  <>
                    <Info size={14} className="text-brand-500" />
                    <span>النموذج الافتراضي</span>
                  </>
                )}
              </span>
            </div>

            {/* Quick Snap button placed safely in toolbar so it NEVER overlays on the map */}
            <button
              type="button"
              onClick={handleCaptureInteractiveMap}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-colors flex items-center gap-1 shadow-sm"
              title="التقاط المنظور الحالي للخريطة التفاعلية وتثبيته كصورة في التقرير"
            >
              <Camera size={13} />
              <span>التقاط كصورة</span>
            </button>
          </div>

        </div>

        {/* ─── EXPANDABLE FILTER & CUSTOMIZER PANEL (PHOTO ATTACHED FEATURE) ─── */}
        {showCustomizer && (
          <div className="pt-4 border-t border-gray-200 dark:border-slate-700/70 space-y-4 animate-in fade-in slide-in-from-top-2">
            
            {/* Section A: Map Feature Filters & Distance Checkboxes (USER SPECIFIC REQUESTS) */}
            <div className="bg-gray-50/80 dark:bg-slate-900/60 p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <SlidersHorizontal size={14} className="text-brand-500" />
                  <span>فلاتر المخيمات، المسافات، وأداة القياس على الخريطة:</span>
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (visibleCampIds.length === FIXED_FIELD_CAMPS.length) {
                        setVisibleCampIds([]);
                      } else {
                        setVisibleCampIds(FIXED_FIELD_CAMPS.map(c => c.id));
                      }
                    }}
                    className="text-[10px] text-brand-600 dark:text-brand-400 font-bold hover:underline"
                  >
                    {visibleCampIds.length === FIXED_FIELD_CAMPS.length ? 'إلغاء تحديد كل المخيمات' : 'تحديد كل المخيمات'}
                  </button>
                </div>
              </div>

              {/* 1. Field Camps Filter (Choose one by one with distance to last pos check case) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {FIXED_FIELD_CAMPS.map(camp => {
                  const isVisible = visibleCampIds.includes(camp.id);
                  const isDistToLastActive = campDistToLastEnabled[camp.id] || false;
                  const distToLast = metrics.lLat && metrics.lLon 
                    ? calculateDistanceKm(camp.lat, camp.lon, metrics.lLat, metrics.lLon).toFixed(1) 
                    : '0.0';

                  return (
                    <div 
                      key={camp.id}
                      className={`p-2.5 rounded-xl border transition-all ${
                        isVisible 
                          ? 'bg-white dark:bg-slate-800 border-emerald-300 dark:border-emerald-700/60 shadow-xs' 
                          : 'bg-gray-100/60 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700 opacity-75'
                      }`}
                    >
                      {/* Checkbox: Camp Show/Hide */}
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setVisibleCampIds(prev => [...prev, camp.id]);
                            } else {
                              setVisibleCampIds(prev => prev.filter(id => id !== camp.id));
                              // Also disable distance if camp hidden
                              setCampDistToLastEnabled(prev => ({ ...prev, [camp.id]: false }));
                            }
                          }}
                          className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                              {camp.name}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                              {camp.region || 'كازاخستان'}
                            </span>
                          </div>
                          <span className="block text-[10px] text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                            {camp.nameEn} ({camp.lat.toFixed(2)}, {camp.lon.toFixed(2)})
                          </span>
                        </div>
                      </label>

                      {/* Checkbox: Distance between chosen camp and last position (Requested Feature) */}
                      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-slate-700/60">
                        <label className={`flex items-center gap-2 cursor-pointer select-none ${!isVisible ? 'opacity-40 pointer-events-none' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isDistToLastActive}
                            disabled={!isVisible}
                            onChange={(e) => {
                              setCampDistToLastEnabled(prev => ({
                                ...prev,
                                [camp.id]: e.target.checked
                              }));
                            }}
                            className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                          />
                          <div className="flex items-center justify-between flex-1">
                            <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                              المسافة إلى آخر موقع
                            </span>
                            <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                              {distToLast} km
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  );
                })}

                {/* Distance Between Camps Checkbox */}
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex flex-col justify-between">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showCampDistance}
                      onChange={(e) => setShowCampDistance(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          المسافة بين المخيمات
                        </span>
                        <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                          {campDistanceKm} km
                        </span>
                      </div>
                      <span className="block text-[10px] text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                        رسم خط مباشر وبطاقة مسافة بين مخيمات الميدان
                      </span>
                    </div>
                  </label>
                  <div className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700/60">
                    {visibleCampIds.length >= 2 ? 'مفعل بين المخيمات المعروضة' : 'يتطلب اختيار مخيمين على الأقل'}
                  </div>
                </div>

                {/* Show / Hide Release Marker Checkbox */}
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex flex-col justify-between">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showReleaseMarker}
                      onChange={(e) => setShowReleaseMarker(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-gray-900 dark:text-white block">
                        علامة "موقع التركيب"
                      </span>
                      <span className="block text-[10px] text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                        إظهار أو إخفاء علامة نقطة إطلاق/تركيب الطائر
                      </span>
                    </div>
                  </label>
                  <div className="text-[10px] font-mono text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700/60">
                    {metrics.rLat ? metrics.rLat.toFixed(4) : '0.0000'}, {metrics.rLon ? metrics.rLon.toFixed(4) : '0.0000'}
                  </div>
                </div>

                {/* Distance between Last Position & Release Location */}
                <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex flex-col justify-between">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showDistanceToRelease}
                      onChange={(e) => setShowDistanceToRelease(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          المسافة إلى موقع التركيب
                        </span>
                        <span className="text-[10px] font-mono font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">
                          {metrics.distFromReleaseKm} km
                        </span>
                      </div>
                      <span className="block text-[10px] text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                        خط متقطع بين آخر إحداثية ونقطة التركيب
                      </span>
                    </div>
                  </label>
                  <div className="text-[10px] text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-slate-700/60">
                    الاتجاه: {metrics.bearingArabic?.text || ''} ({metrics.bearingDegrees ? metrics.bearingDegrees.toFixed(0) : 0}°)
                  </div>
                </div>

                {/* Map Distance Measurement Tool (Requested Feature) */}
                <div className="p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 flex flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-500 text-white rounded-lg">
                        <Ruler size={16} />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
                          أداة قياس المسافة على الخريطة
                        </span>
                        <span className="text-[10px] text-amber-700 dark:text-amber-400">
                          {isMeasuring ? 'انقر على الخريطة لرسم النقاط' : 'رسم خطوط قياس وتصديرها'}
                        </span>
                      </div>
                    </div>
                    {measurePoints.length > 1 && (
                      <span className="text-xs font-mono font-bold text-amber-900 dark:text-amber-200 bg-amber-200 dark:bg-amber-800/60 px-2 py-0.5 rounded-md">
                        {totalMeasureDistanceKm} km
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-amber-200 dark:border-amber-800/60">
                    <button
                      type="button"
                      onClick={() => setIsMeasuring(!isMeasuring)}
                      className={`flex-1 py-1 px-2 rounded-lg text-xs font-bold transition-all ${
                        isMeasuring 
                          ? 'bg-amber-600 text-white' 
                          : 'bg-white dark:bg-slate-800 text-amber-800 dark:text-amber-300 border border-amber-300 hover:bg-amber-100'
                      }`}
                    >
                      {isMeasuring ? 'إنهاء الرسم' : 'بدء القياس بالمسطرة'}
                    </button>
                    {measurePoints.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMeasurePoints([])}
                        className="py-1 px-2 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-red-600 border border-red-200 hover:bg-red-50"
                        title="مسح نقاط القياس"
                      >
                        مسح ({measurePoints.length})
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Section B: Editable Texts, Footer, and Metadata */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200">
                تخصيص نصوص وعناوين التقرير وتذييل الصفحة:
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">عنوان التقرير:</label>
                  <input
                    type="text"
                    value={customMetadata.reportTitle}
                    onChange={(e) => setCustomMetadata({ ...customMetadata, reportTitle: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">المنطقة الجغرافية:</label>
                  <input
                    type="text"
                    value={customMetadata.regionName}
                    onChange={(e) => setCustomMetadata({ ...customMetadata, regionName: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">رقم الحجل (Ring ID):</label>
                  <input
                    type="text"
                    value={customMetadata.birdRing}
                    onChange={(e) => setCustomMetadata({ ...customMetadata, birdRing: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none font-mono font-bold"
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
                  <label className="block text-[11px] text-gray-500 mb-1">تاريخ الإصدار:</label>
                  <input
                    type="date"
                    value={customMetadata.issueDate}
                    onChange={(e) => setCustomMetadata({ ...customMetadata, issueDate: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">نص تذييل الصفحة الأيمن:</label>
                  <input
                    type="text"
                    value={customMetadata.footerRight}
                    onChange={(e) => setCustomMetadata({ ...customMetadata, footerRight: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Section C: Upload & Customize Logos and QGIS Map (USER REQUESTED) */}
            <div className="bg-sky-50/70 dark:bg-sky-950/30 p-3.5 rounded-xl border border-sky-200 dark:border-sky-800/60 space-y-3">
              <h4 className="text-xs font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                <Upload size={14} className="text-sky-600 dark:text-sky-400" />
                <span>رفع وتخصيص الشعارات وخريطة QGIS (Logos & QGIS Map Upload):</span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. Left Logo (Qatar Houbara Center) */}
                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      الشعار الأيسر (المركز القطري)
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">PNG / SVG</span>
                  </div>
                  
                  <div className="h-14 bg-gray-50 dark:bg-slate-900 rounded-lg border border-dashed border-gray-200 dark:border-slate-700 flex items-center justify-center p-1">
                    <img
                      src={logoLeftUrl}
                      alt="الشعار الأيسر"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => logoLeftInputRef.current?.click()}
                      className="flex-1 py-1.5 px-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 shadow-xs"
                    >
                      <Upload size={12} />
                      <span>رفع شعار</span>
                    </button>
                    {logoLeftUrl !== '/qatar-houbara-center-logo.png' && (
                      <button
                        type="button"
                        onClick={() => setLogoLeftUrl('/qatar-houbara-center-logo.png')}
                        className="py-1.5 px-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300 rounded-lg text-xs font-bold transition-colors"
                        title="استعادة الشعار الافتراضي"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>

                  {/* Left Logo Dimension Sliders */}
                  <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-slate-700/60">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500 font-semibold">الارتفاع:</span>
                      <span className="font-mono font-bold text-brand-600">{logoLeftHeight} px</span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={200}
                      step={5}
                      value={logoLeftHeight}
                      onChange={(e) => setLogoLeftHeight(Number(e.target.value))}
                      className="w-full accent-brand-600 cursor-pointer h-1.5"
                    />

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500 font-semibold">أقصى عرض:</span>
                      <span className="font-mono font-bold text-brand-600">{logoLeftWidth} px</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={450}
                      step={10}
                      value={logoLeftWidth}
                      onChange={(e) => setLogoLeftWidth(Number(e.target.value))}
                      className="w-full accent-brand-600 cursor-pointer h-1.5"
                    />

                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setLogoLeftHeight(h => Math.max(30, h - 10));
                          setLogoLeftWidth(w => Math.max(60, w - 20));
                        }}
                        className="flex-1 py-1 px-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded text-[10px] font-bold flex items-center justify-center gap-0.5"
                      >
                        <Minus size={10} />
                        <span>تصغير</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLogoLeftHeight(h => Math.min(220, h + 10));
                          setLogoLeftWidth(w => Math.min(480, w + 20));
                        }}
                        className="flex-1 py-1 px-1.5 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 rounded text-[10px] font-bold flex items-center justify-center gap-0.5"
                      >
                        <Plus size={10} />
                        <span>تكبير</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Right Logo (External Reserves Office) */}
                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      الشعار الأيمن (محميات الدولة)
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">PNG / SVG</span>
                  </div>

                  <div className="h-14 bg-gray-50 dark:bg-slate-900 rounded-lg border border-dashed border-gray-200 dark:border-slate-700 flex items-center justify-center p-1">
                    <img
                      src={logoRightUrl}
                      alt="الشعار الأيمن"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => logoRightInputRef.current?.click()}
                      className="flex-1 py-1.5 px-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 shadow-xs"
                    >
                      <Upload size={12} />
                      <span>رفع شعار</span>
                    </button>
                    {logoRightUrl !== '/external-reserves-office-logo.png' && (
                      <button
                        type="button"
                        onClick={() => setLogoRightUrl('/external-reserves-office-logo.png')}
                        className="py-1.5 px-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300 rounded-lg text-xs font-bold transition-colors"
                        title="استعادة الشعار الافتراضي"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>

                  {/* Right Logo Dimension Sliders */}
                  <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-slate-700/60">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500 font-semibold">الارتفاع:</span>
                      <span className="font-mono font-bold text-brand-600">{logoRightHeight} px</span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={200}
                      step={5}
                      value={logoRightHeight}
                      onChange={(e) => setLogoRightHeight(Number(e.target.value))}
                      className="w-full accent-brand-600 cursor-pointer h-1.5"
                    />

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-500 font-semibold">أقصى عرض:</span>
                      <span className="font-mono font-bold text-brand-600">{logoRightWidth} px</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={450}
                      step={10}
                      value={logoRightWidth}
                      onChange={(e) => setLogoRightWidth(Number(e.target.value))}
                      className="w-full accent-brand-600 cursor-pointer h-1.5"
                    />

                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setLogoRightHeight(h => Math.max(30, h - 10));
                          setLogoRightWidth(w => Math.max(60, w - 20));
                        }}
                        className="flex-1 py-1 px-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded text-[10px] font-bold flex items-center justify-center gap-0.5"
                      >
                        <Minus size={10} />
                        <span>تصغير</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLogoRightHeight(h => Math.min(220, h + 10));
                          setLogoRightWidth(w => Math.min(480, w + 20));
                        }}
                        className="flex-1 py-1 px-1.5 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 rounded text-[10px] font-bold flex items-center justify-center gap-0.5"
                      >
                        <Plus size={10} />
                        <span>تكبير</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. QGIS Map Upload & Fit Controls */}
                <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                      خريطة معدّلة في QGIS
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">PNG / JPG</span>
                  </div>

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => mapImageInputRef.current?.click()}
                      className="w-full py-2 px-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <Upload size={14} />
                      <span>رفع صورة خريطة QGIS جديدة</span>
                    </button>

                    <div className="flex items-center justify-between gap-1 text-[11px] pt-1">
                      <span className="text-gray-500 font-semibold">ملاءمة العرض:</span>
                      <div className="flex gap-1 bg-gray-100 dark:bg-slate-900 p-0.5 rounded-lg border border-gray-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => setMapImageFit('contain')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${mapImageFit === 'contain' ? 'bg-sky-600 text-white' : 'text-gray-600 dark:text-gray-300'}`}
                          title="احتواء كامل للخريطة دون اقتصاص الحواف"
                        >
                          احتواء (Contain)
                        </button>
                        <button
                          type="button"
                          onClick={() => setMapImageFit('cover')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${mapImageFit === 'cover' ? 'bg-sky-600 text-white' : 'text-gray-600 dark:text-gray-300'}`}
                          title="تغطية كامل نافذة الخريطة"
                        >
                          تغطية (Cover)
                        </button>
                        <button
                          type="button"
                          onClick={() => setMapImageFit('fill')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${mapImageFit === 'fill' ? 'bg-sky-600 text-white' : 'text-gray-600 dark:text-gray-300'}`}
                          title="ملء الإطار بالكامل"
                        >
                          ملء (Fill)
                        </button>
                      </div>
                    </div>
                  </div>

                  {mapSnapshotUrl && mapDisplayMode === 'snapshot' && (
                    <div className="pt-1 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 size={12} />
                        معروضة حالياً بالتقرير
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setMapDisplayMode('interactive');
                          setFitKey(k => k + 1);
                        }}
                        className="text-brand-600 font-bold hover:underline"
                      >
                        العودة للتفاعلية
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Section D: Map Legend Customization Item-by-Item (USER REQUESTED) */}
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <Palette size={14} className="text-emerald-600 dark:text-emerald-400" />
                  <span>تخصيص مفتاح الخريطة عنصراً بعنصر (Map Legend Items):</span>
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddLegendItem}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-xs"
                  >
                    <Plus size={12} />
                    <span>إضافة عنصر جديد</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetLegendItems}
                    className="px-2.5 py-1 bg-white hover:bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 transition-colors flex items-center gap-1"
                    title="استعادة عناصر المفتاح الافتراضية للتقرير"
                  >
                    <RotateCcw size={12} />
                    <span>استعادة الافتراضي</span>
                  </button>
                </div>
              </div>

              {/* Grid of legend items */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {legendItems.map((item, index) => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl border transition-all ${
                      item.visible
                        ? 'bg-white dark:bg-slate-800 border-emerald-300 dark:border-emerald-700/60 shadow-xs'
                        : 'bg-gray-100/60 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700 opacity-60'
                    }`}
                  >
                    {/* Top Row: Visibility checkbox & delete */}
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={item.visible}
                          onChange={(e) => handleUpdateLegendItem(item.id, { visible: e.target.checked })}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                          {item.visible ? 'ظاهر بالمفتاح' : 'مخفي من المفتاح'}
                        </span>
                      </label>

                      <div className="flex items-center gap-1">
                        {/* Move Buttons */}
                        <button
                          type="button"
                          onClick={() => handleMoveLegendItem(index, 'left')}
                          disabled={index === 0}
                          className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-white disabled:opacity-30 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
                          title="تحريك للأمام (اليمين)"
                        >
                          <ChevronRight size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveLegendItem(index, 'right')}
                          disabled={index === legendItems.length - 1}
                          className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-white disabled:opacity-30 rounded hover:bg-gray-100 dark:hover:bg-slate-700"
                          title="تحريك للخلف (اليسار)"
                        >
                          <ChevronLeft size={13} />
                        </button>
                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => handleDeleteLegendItem(item.id)}
                          className="p-1 text-red-500 hover:text-red-700 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
                          title="حذف العنصر"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Middle Row: Text input */}
                    <div className="mb-2">
                      <label className="block text-[10px] text-gray-500 mb-0.5">نص العنصر (Label):</label>
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => handleUpdateLegendItem(item.id, { label: e.target.value })}
                        className="w-full px-2.5 py-1 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none font-bold text-gray-900 dark:text-white"
                        placeholder="نص المفتاح..."
                      />
                    </div>

                    {/* Bottom Row: Color picker & Symbol selector */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-100 dark:border-slate-700/60 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">الرمز:</span>
                        <select
                          value={item.symbol}
                          onChange={(e) => handleUpdateLegendItem(item.id, { symbol: e.target.value as any })}
                          className="text-[11px] bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded px-1.5 py-0.5 outline-none cursor-pointer text-gray-800 dark:text-gray-200 font-medium"
                        >
                          <option value="circle">دائرة (Circle)</option>
                          <option value="line">خط (Line)</option>
                          <option value="dashed-line">متقطع (Dashed)</option>
                          <option value="tent">خيمة (Tent)</option>
                          <option value="square">مربع (Square)</option>
                          <option value="star">نجمة (Star)</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">اللون:</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="color"
                            value={item.color}
                            onChange={(e) => handleUpdateLegendItem(item.id, { color: e.target.value })}
                            className="w-6 h-6 rounded cursor-pointer border border-gray-300 dark:border-slate-600 p-0"
                            title="تغيير لون الرمز"
                          />
                          <div className="p-1 rounded bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 flex items-center justify-center">
                            {renderLegendSymbol(item.symbol, item.color)}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* ─── OFFICIAL REPORT SHEET CONTAINER (A4 LANDSCAPE) ─── */}
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
                معاينة التقرير المخصص بملء الشاشة الكامل
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
          id="custom-map-production-print-area"
          ref={reportContainerRef}
          className="trk-page bg-white text-gray-900 w-[1123px] min-w-[1123px] p-[28px_36px_18px] shadow-2xl rounded-sm border border-gray-300 relative select-none"
          dir="rtl"
          style={{
            direction: 'rtl',
            fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif",
            letterSpacing: 'normal'
          }}
        >

          {/* 1. REPORT HEADER (Pixel-faithful to reference design) */}
          <header className="trk-header relative" style={{ direction: 'rtl', zIndex: 2000 }}>
            
            {/* Agency Info: Emblem + Rule + Names (On Right in RTL) */}
            <div className="trk-header__agency relative">
              {/* Emblem Logo */}
              <div 
                className={`logo-clickable-container flex items-center justify-center relative group transition-all select-none ${
                  activeResizingLogo === 'right' 
                    ? 'ring-2 ring-brand-500 rounded p-1 bg-brand-50/20' 
                    : 'hover:ring-1 hover:ring-brand-300 rounded p-0.5'
                }`}
                style={{ position: 'relative', zIndex: activeResizingLogo === 'right' ? 3000 : 20 }}
              >
                <img 
                  src={logoRightUrl} 
                  alt="شعار الدولة" 
                  className="object-contain cursor-pointer transition-all"
                  style={{
                    height: `${logoRightHeight}px`,
                    maxWidth: `${logoRightWidth}px`,
                    width: 'auto',
                    display: 'block'
                  }}
                  onClick={() => setActiveResizingLogo(activeResizingLogo === 'right' ? null : 'right')}
                  title="انقر على الشعار لتكبيره أو تصغيره وتعديل أبعاده"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/external-reserves-office-logo.png';
                  }}
                />

                {/* Hover Quick Edit Badge */}
                <div className="no-export-snapshot no-print absolute -bottom-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/85 backdrop-blur-xs text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-lg z-20">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveResizingLogo(activeResizingLogo === 'right' ? null : 'right');
                    }}
                    className="hover:text-amber-300 flex items-center gap-0.5 font-bold"
                    title="تعديل الأبعاد وتكبير أو تصغير الحجم"
                  >
                    <Maximize2 size={10} />
                    <span>تعديل الحجم ({logoRightHeight}px)</span>
                  </button>
                  <span className="text-gray-500">•</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      logoRightInputRef.current?.click();
                    }}
                    className="hover:underline flex items-center gap-0.5 text-sky-300"
                    title="رفع شعار جديد (PNG أو SVG)"
                  >
                    <Upload size={10} />
                    <span>استبدال</span>
                  </button>
                  {logoRightUrl !== '/qatar-emblem.png' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLogoRightUrl('/qatar-emblem.png');
                      }}
                      className="hover:text-amber-300 font-bold mr-0.5"
                      title="استعادة الشعار الافتراضي"
                    >
                      ↺
                    </button>
                  )}
                </div>

                {/* Floating Dimension Controller Popover */}
                {activeResizingLogo === 'right' && (
                  <div 
                    className="logo-control-popover no-export-snapshot no-print absolute top-full right-0 mt-2 bg-white dark:bg-slate-900 border border-brand-300 dark:border-brand-700 p-3 rounded-xl shadow-2xl w-64 text-right space-y-2.5 animate-in fade-in slide-in-from-top-2"
                    style={{ direction: 'rtl', zIndex: 9999, position: 'absolute' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-1.5">
                      <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1">
                        <Maximize2 size={13} className="text-brand-500" />
                        <span>تعديل حجم الشعار الأيمن</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveResizingLogo(null)}
                        className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-md"
                        title="إغلاق"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setLogoRightHeight(h => Math.max(30, h - 10));
                          setLogoRightWidth(w => Math.max(60, w - 20));
                        }}
                        className="flex-1 py-1 px-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 rounded text-xs font-bold flex items-center justify-center gap-1"
                      >
                        <Minus size={12} />
                        <span>تصغير</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLogoRightHeight(h => Math.min(220, h + 10));
                          setLogoRightWidth(w => Math.min(480, w + 20));
                        }}
                        className="flex-1 py-1 px-2 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold flex items-center justify-center gap-1 shadow-xs"
                      >
                        <Plus size={12} />
                        <span>تكبير</span>
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                        <span>الارتفاع:</span>
                        <span className="font-mono font-bold text-brand-600">{logoRightHeight} px</span>
                      </div>
                      <input
                        type="range"
                        min={30}
                        max={200}
                        step={5}
                        value={logoRightHeight}
                        onChange={(e) => setLogoRightHeight(Number(e.target.value))}
                        className="w-full accent-brand-600 cursor-pointer h-1.5"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                        <span>العرض الأقصى:</span>
                        <span className="font-mono font-bold text-brand-600">{logoRightWidth} px</span>
                      </div>
                      <input
                        type="range"
                        min={60}
                        max={450}
                        step={10}
                        value={logoRightWidth}
                        onChange={(e) => setLogoRightWidth(Number(e.target.value))}
                        className="w-full accent-brand-600 cursor-pointer h-1.5"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-gray-100 dark:border-slate-800">
                      <span className="text-[10px] text-gray-500">حجم سريع:</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => { setLogoRightHeight(50); setLogoRightWidth(200); }}
                          className="px-1.5 py-0.5 text-[10px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 rounded font-bold"
                        >
                          صغير
                        </button>
                        <button
                          type="button"
                          onClick={() => { setLogoRightHeight(64); setLogoRightWidth(240); }}
                          className="px-1.5 py-0.5 text-[10px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 rounded font-bold"
                        >
                          افتراضي
                        </button>
                        <button
                          type="button"
                          onClick={() => { setLogoRightHeight(85); setLogoRightWidth(320); }}
                          className="px-1.5 py-0.5 text-[10px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 rounded font-bold"
                        >
                          كبير
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-gray-100 dark:border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => logoRightInputRef.current?.click()}
                        className="text-sky-600 dark:text-sky-400 hover:underline font-bold flex items-center gap-1"
                      >
                        <Upload size={11} />
                        <span>استبدال الصورة</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setLogoRightHeight(64); setLogoRightWidth(240); }}
                        className="text-gray-500 hover:text-gray-800 dark:hover:text-white flex items-center gap-0.5"
                      >
                        <RotateCcw size={11} />
                        <span>الافتراضي</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>


            </div>

            {/* Center Logo (On Left in RTL) */}
            <div 
              className={`logo-clickable-container flex items-center justify-start relative group transition-all select-none ${
                activeResizingLogo === 'left' 
                  ? 'ring-2 ring-brand-500 rounded p-1 bg-brand-50/20' 
                  : 'hover:ring-1 hover:ring-brand-300 rounded p-0.5'
              }`}
              style={{ position: 'relative', zIndex: activeResizingLogo === 'left' ? 3000 : 20 }}
            >
              <img 
                src={logoLeftUrl} 
                alt="المركز القطري لتكاثر الحبارى والصقور" 
                className="trk-header__center object-contain cursor-pointer transition-all"
                style={{
                  height: `${logoLeftHeight}px`,
                  maxWidth: `${logoLeftWidth}px`,
                  width: 'auto',
                  display: 'block'
                }}
                onClick={() => setActiveResizingLogo(activeResizingLogo === 'left' ? null : 'left')}
                title="انقر على الشعار لتكبيره أو تصغيره وتعديل أبعاده"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />

              {/* Hover Quick Edit Badge */}
              <div className="no-export-snapshot no-print absolute -bottom-2 left-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/85 backdrop-blur-xs text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-lg z-20">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveResizingLogo(activeResizingLogo === 'left' ? null : 'left');
                  }}
                  className="hover:text-amber-300 flex items-center gap-0.5 font-bold"
                  title="تعديل الأبعاد وتكبير أو تصغير الحجم"
                >
                  <Maximize2 size={10} />
                  <span>تعديل الحجم ({logoLeftHeight}px)</span>
                </button>
                <span className="text-gray-500">•</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    logoLeftInputRef.current?.click();
                  }}
                  className="hover:underline flex items-center gap-0.5 text-sky-300"
                  title="رفع شعار جديد (PNG أو SVG)"
                >
                  <Upload size={10} />
                  <span>استبدال</span>
                </button>
                {logoLeftUrl !== '/qatar-houbara-center-logo.png' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLogoLeftUrl('/qatar-houbara-center-logo.png');
                    }}
                    className="hover:text-amber-300 font-bold ml-0.5"
                    title="استعادة الشعار الافتراضي"
                  >
                    ↺
                  </button>
                )}
              </div>

              {/* Floating Dimension Controller Popover */}
              {activeResizingLogo === 'left' && (
                <div 
                  className="logo-control-popover no-export-snapshot no-print absolute top-full left-0 mt-2 bg-white dark:bg-slate-900 border border-brand-300 dark:border-brand-700 p-3 rounded-xl shadow-2xl w-64 text-right space-y-2.5 animate-in fade-in slide-in-from-top-2"
                  style={{ direction: 'rtl', zIndex: 9999, position: 'absolute' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 pb-1.5">
                    <span className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1">
                      <Maximize2 size={13} className="text-brand-500" />
                      <span>تعديل حجم الشعار الأيسر</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveResizingLogo(null)}
                      className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white rounded-md"
                      title="إغلاق"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setLogoLeftHeight(h => Math.max(30, h - 10));
                        setLogoLeftWidth(w => Math.max(60, w - 20));
                      }}
                      className="flex-1 py-1 px-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 rounded text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Minus size={12} />
                      <span>تصغير</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLogoLeftHeight(h => Math.min(220, h + 10));
                        setLogoLeftWidth(w => Math.min(480, w + 20));
                      }}
                      className="flex-1 py-1 px-2 bg-brand-600 hover:bg-brand-700 text-white rounded text-xs font-bold flex items-center justify-center gap-1 shadow-xs"
                    >
                      <Plus size={12} />
                      <span>تكبير</span>
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                      <span>الارتفاع:</span>
                      <span className="font-mono font-bold text-brand-600">{logoLeftHeight} px</span>
                    </div>
                    <input
                      type="range"
                      min={30}
                      max={200}
                      step={5}
                      value={logoLeftHeight}
                      onChange={(e) => setLogoLeftHeight(Number(e.target.value))}
                      className="w-full accent-brand-600 cursor-pointer h-1.5"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                      <span>العرض الأقصى:</span>
                      <span className="font-mono font-bold text-brand-600">{logoLeftWidth} px</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={450}
                      step={10}
                      value={logoLeftWidth}
                      onChange={(e) => setLogoLeftWidth(Number(e.target.value))}
                      className="w-full accent-brand-600 cursor-pointer h-1.5"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-1 border-t border-gray-100 dark:border-slate-800">
                    <span className="text-[10px] text-gray-500">حجم سريع:</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => { setLogoLeftHeight(50); setLogoLeftWidth(160); }}
                        className="px-1.5 py-0.5 text-[10px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 rounded font-bold"
                      >
                        صغير
                      </button>
                      <button
                        type="button"
                        onClick={() => { setLogoLeftHeight(78); setLogoLeftWidth(260); }}
                        className="px-1.5 py-0.5 text-[10px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 rounded font-bold"
                      >
                        افتراضي
                      </button>
                      <button
                        type="button"
                        onClick={() => { setLogoLeftHeight(105); setLogoLeftWidth(340); }}
                        className="px-1.5 py-0.5 text-[10px] bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 rounded font-bold"
                      >
                        كبير
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-gray-100 dark:border-slate-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => logoLeftInputRef.current?.click()}
                      className="text-sky-600 dark:text-sky-400 hover:underline font-bold flex items-center gap-1"
                    >
                      <Upload size={11} />
                      <span>استبدال الصورة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLogoLeftHeight(78); setLogoLeftWidth(260); }}
                      className="text-gray-500 hover:text-gray-800 dark:hover:text-white flex items-center gap-0.5"
                    >
                      <RotateCcw size={11} />
                      <span>الافتراضي</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </header>

          {/* 2px Solid Maroon Rule */}
          <div className="trk-hr" />

          {/* Centered Title */}
          {isTableEditing ? (
            <input
              type="text"
              value={customMetadata.reportTitle}
              onChange={(e) => setCustomMetadata({ ...customMetadata, reportTitle: e.target.value })}
              className="w-full text-center text-[28px] font-bold text-gray-900 border border-amber-300 rounded px-2 py-0.5 bg-amber-50/40 mb-2"
            />
          ) : (
            <h1 className="trk-title">
              {customMetadata.reportTitle || 'تقرير متابعة طائر حبارى مزود بجهاز تتبع'}
            </h1>
          )}

          {/* Subtitle */}
          <p className="trk-sub">
            جهاز التتبع <b>{displayTransmitterLabel}</b> • منطقة {activeCamp.name ? activeCamp.name.replace(/^مخيم\s*/, '') : 'جيزقازغان'} – {customMetadata.regionName || 'كازاخستان'} • تاريخ الإصدار <b dir="ltr">{customMetadata.issueDate}</b>
          </p>

          {/* 2. MAIN REPORT BODY */}
          <div className="trk-grid" dir="rtl">

            {/* ─── COLUMN 1 (RIGHT in RTL): SIDE PANEL (440px) ───── */}
            <aside className="trk-side" key={dragResetKey}>
              
              {/* TABLE 1: BIRD DATA (بيانات الطائر) */}
              {(tableMode === 'standard' || tableMode === 'both') && (
                <section id="custom-bird-data-table" className={`trk-card ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1 relative' : ''}`}>
                  {isDragEnabled && (
                    <div className="drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print">
                      <span className="flex items-center gap-1"><GripHorizontal size={12} /> اسحب لنقل جدول بيانات الطائر</span>
                      <span>⋮⋮</span>
                    </div>
                  )}

                  <div className="trk-card__head flex items-center justify-between">
                    <span>بيانات الطائر</span>
                    {isTableEditing && (
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded text-white font-normal">
                        تعديل مباشر
                      </span>
                    )}
                  </div>

                  <div className="trk-row">
                    <span className="k">رقم جهاز التتبع</span>
                    <span className="v">
                      {isTableEditing ? (
                        <input
                          type="text"
                          value={selectedPttId}
                          onChange={(e) => setSelectedPttId(e.target.value)}
                          className="w-full text-center font-bold text-[#7a1c32] text-[15px] border border-amber-300 rounded px-1.5 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        <b className="maroon">
                          {displayTransmitterLabel}
                          {isPttNA && <span className="text-[10px] text-gray-400 font-sans mr-1">(حجل)</span>}
                        </b>
                      )}
                    </span>
                  </div>

                  <div className="trk-row">
                    <span className="k">رقم الحجل</span>
                    <span className="v">
                      {isTableEditing ? (
                        <input
                          type="text"
                          value={customMetadata.birdRing}
                          onChange={(e) => setCustomMetadata({ ...customMetadata, birdRing: e.target.value })}
                          className="w-full text-center font-bold text-gray-800 text-[13px] border border-amber-300 rounded px-1.5 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        <span className="pill pill--grey">{customMetadata.birdRing || 'NA'}</span>
                      )}
                    </span>
                  </div>

                  <div className="trk-row">
                    <span className="k">النوعية</span>
                    <span className="v">
                      {isTableEditing ? (
                        <input
                          type="text"
                          value={customMetadata.species}
                          onChange={(e) => setCustomMetadata({ ...customMetadata, species: e.target.value })}
                          className="w-full text-center font-bold text-gray-800 text-[14px] border border-amber-300 rounded px-1.5 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        <span>{customMetadata.species || 'وحش'}</span>
                      )}
                    </span>
                  </div>

                  <div className="trk-row">
                    <span className="k">الجنس</span>
                    <span className="v">
                      {isTableEditing ? (
                        <select
                          value={customMetadata.gender}
                          onChange={(e) => setCustomMetadata({ ...customMetadata, gender: e.target.value })}
                          className="w-full text-center font-bold text-gray-800 text-[14px] border border-amber-300 rounded px-1.5 py-0.5 bg-amber-50/50"
                        >
                          <option value="ذكر">ذكر</option>
                          <option value="أنثى">أنثى</option>
                          <option value="غير محدد">غير محدد</option>
                        </select>
                      ) : (
                        <span>{customMetadata.gender || 'ذكر'}</span>
                      )}
                    </span>
                  </div>

                  <div className="trk-row">
                    <span className="k">حالة الطائر</span>
                    <span className="v">
                      {isTableEditing ? (
                        <input
                          type="text"
                          value={customMetadata.birdStatus}
                          onChange={(e) => setCustomMetadata({ ...customMetadata, birdStatus: e.target.value })}
                          className="w-full text-center font-bold text-emerald-700 text-[13px] border border-amber-300 rounded px-1.5 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        <span className={`pill ${
                          customMetadata.birdStatus === 'نافق' || customMetadata.birdStatus === 'dead' ? 'pill--bad' :
                          customMetadata.birdStatus === 'غير نشط' || customMetadata.birdStatus === 'inactive' ? 'pill--warn' :
                          'pill--ok'
                        }`}>
                          {customMetadata.birdStatus || 'حي'}
                        </span>
                      )}
                    </span>
                  </div>
                </section>
              )}

              {/* TABLE 2: MOVEMENT & COORDINATES COMPARISON TABLE */}
              {(tableMode === 'standard' || tableMode === 'both') && (
                <section id="custom-table2-coordinates" className={`trk-card trk-card--table ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1 relative' : ''}`}>
                  {isDragEnabled && (
                    <div className="drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print">
                      <span className="flex items-center gap-1"><GripHorizontal size={12} /> اسحب لنقل جدول مقارنة الإحداثيات</span>
                      <span>⋮⋮</span>
                    </div>
                  )}

                  <div className="trk-twohead">
                    <div className="trk-twohead__install">تركيب الجهاز</div>
                    <div className="trk-twohead__last">آخر موقع</div>
                  </div>
                  <div className="trk-table">
                    <span className="lbl">التاريخ</span>
                    <span dir="ltr">
                      {isTableEditing ? (
                        <input
                          type="text"
                          value={telemetryData.releasePos.dateStr}
                          onChange={(e) => setTelemetryData({ ...telemetryData, releasePos: { ...telemetryData.releasePos, dateStr: e.target.value } })}
                          className="w-full text-center font-bold text-[12px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        telemetryData.releasePos.dateStr
                      )}
                    </span>
                    <span dir="ltr">
                      {isTableEditing ? (
                        <input
                          type="text"
                          value={telemetryData.lastGpsPos.dateStr}
                          onChange={(e) => setTelemetryData({ ...telemetryData, lastGpsPos: { ...telemetryData.lastGpsPos, dateStr: e.target.value } })}
                          className="w-full text-center font-bold text-[12px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        telemetryData.lastGpsPos.dateStr
                      )}
                    </span>

                    <span className="lbl">خط العرض (N)</span>
                    <span dir="ltr">
                      {isTableEditing ? (
                        <input
                          type="number"
                          step="0.0001"
                          value={telemetryData.releasePos.lat}
                          onChange={(e) => setTelemetryData({ ...telemetryData, releasePos: { ...telemetryData.releasePos, lat: parseFloat(e.target.value) || 0 } })}
                          className="w-full text-center font-bold text-[12px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        metrics.releaseLatTableDMM
                      )}
                    </span>
                    <span dir="ltr">
                      {isTableEditing ? (
                        <input
                          type="number"
                          step="0.0001"
                          value={telemetryData.lastGpsPos.lat}
                          onChange={(e) => setTelemetryData({ ...telemetryData, lastGpsPos: { ...telemetryData.lastGpsPos, lat: parseFloat(e.target.value) || 0 } })}
                          className="w-full text-center font-bold text-[12px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        metrics.lastGpsLatTableDMM
                      )}
                    </span>

                    <span className="lbl">خط الطول (E)</span>
                    <span dir="ltr">
                      {isTableEditing ? (
                        <input
                          type="number"
                          step="0.0001"
                          value={telemetryData.releasePos.lon}
                          onChange={(e) => setTelemetryData({ ...telemetryData, releasePos: { ...telemetryData.releasePos, lon: parseFloat(e.target.value) || 0 } })}
                          className="w-full text-center font-bold text-[12px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        metrics.releaseLonTableDMM
                      )}
                    </span>
                    <span dir="ltr">
                      {isTableEditing ? (
                        <input
                          type="number"
                          step="0.0001"
                          value={telemetryData.lastGpsPos.lon}
                          onChange={(e) => setTelemetryData({ ...telemetryData, lastGpsPos: { ...telemetryData.lastGpsPos, lon: parseFloat(e.target.value) || 0 } })}
                          className="w-full text-center font-bold text-[12px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        metrics.lastGpsLonTableDMM
                      )}
                    </span>
                  </div>
                </section>
              )}

              {/* TABLE 3: DETAILED HISTORY TRAJECTORY TABLE */}
              {(tableMode === 'history_list' || tableMode === 'both') && (
                <div className={`border border-gray-300 rounded-xl overflow-hidden shadow-xs relative bg-white ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1' : ''}`}>
                  {isDragEnabled && (
                    <div className="drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print">
                      <span className="flex items-center gap-1"><GripHorizontal size={12} /> اسحب لنقل جدول سجل المسار</span>
                      <span>⋮⋮</span>
                    </div>
                  )}

                  <div className="w-full bg-[#1e293b] text-white py-1.5 px-3 flex items-center justify-between text-[12px] font-bold">
                    <span className="flex items-center gap-1.5">
                      <History size={14} className="text-amber-400" />
                      <span>سجل مسار وإحداثيات الطائر التاريخي</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-300">
                        ({historyRows.length} نقاط)
                      </span>
                      {isTableEditing && (
                        <button
                          onClick={handleAddCustomHistoryRow}
                          className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold flex items-center gap-1"
                        >
                          <Plus size={11} />
                          <span>إضافة نقطة</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-[220px] overflow-y-auto">
                    <table id="custom-history-table" className="w-full text-[11px] text-center border-collapse">
                      <thead className="bg-gray-100 text-gray-700 sticky top-0 font-bold border-b border-gray-200">
                        <tr>
                          <th className="py-1 px-1.5 text-center">#</th>
                          <th className="py-1 px-1.5 text-center">التاريخ</th>
                          <th className="py-1 px-1.5 text-center">الوقت</th>
                          <th className="py-1 px-1.5 text-center">خط العرض</th>
                          <th className="py-1 px-1.5 text-center">خط الطول</th>
                          <th className="py-1 px-1.5 text-center">النوع</th>
                          <th className="py-1 px-1.5 text-center">ملاحظات</th>
                          {isTableEditing && <th className="py-1 px-1.5 text-center">إجراء</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {historyRows.slice(0, historyRowCount).map((row, idx) => (
                          <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                            <td className="py-1 px-1.5 font-mono text-[10px] text-gray-500">{idx + 1}</td>
                            <td className="py-1 px-1.5 font-mono text-[10.5px]">
                              {isTableEditing ? (
                                <input
                                  type="text"
                                  value={row.dateStr}
                                  onChange={(e) => handleUpdateHistoryRow(row.id, 'dateStr', e.target.value)}
                                  className="w-20 text-center border rounded px-0.5 py-0.2 bg-white text-[10px]"
                                />
                              ) : (
                                row.dateStr
                              )}
                            </td>
                            <td className="py-1 px-1.5 font-mono text-[10px] text-gray-600">
                              {isTableEditing ? (
                                <input
                                  type="text"
                                  value={row.timeStr}
                                  onChange={(e) => handleUpdateHistoryRow(row.id, 'timeStr', e.target.value)}
                                  className="w-16 text-center border rounded px-0.5 py-0.2 bg-white text-[10px]"
                                />
                              ) : (
                                row.timeStr
                              )}
                            </td>
                            <td className="py-1 px-1.5 font-mono text-[11px] font-bold text-gray-800">
                              {isTableEditing ? (
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={row.lat}
                                  onChange={(e) => handleUpdateHistoryRow(row.id, 'lat', parseFloat(e.target.value) || 0)}
                                  className="w-16 text-center border rounded px-0.5 py-0.2 bg-white text-[10px]"
                                />
                              ) : (
                                row.lat.toFixed(4)
                              )}
                            </td>
                            <td className="py-1 px-1.5 font-mono text-[11px] font-bold text-gray-800">
                              {isTableEditing ? (
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={row.lon}
                                  onChange={(e) => handleUpdateHistoryRow(row.id, 'lon', parseFloat(e.target.value) || 0)}
                                  className="w-16 text-center border rounded px-0.5 py-0.2 bg-white text-[10px]"
                                />
                              ) : (
                                row.lon.toFixed(4)
                              )}
                            </td>
                            <td className="py-1 px-1.5">
                              <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded-full ${row.type === 'GPS' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                                {row.type}
                              </span>
                            </td>
                            <td className="py-1 px-1.5 text-[10px] text-gray-600 truncate max-w-[100px]">
                              {isTableEditing ? (
                                <input
                                  type="text"
                                  value={row.notes}
                                  onChange={(e) => handleUpdateHistoryRow(row.id, 'notes', e.target.value)}
                                  className="w-full border rounded px-0.5 py-0.2 bg-white text-[10px]"
                                />
                              ) : (
                                row.notes
                              )}
                            </td>
                            {isTableEditing && (
                              <td className="py-1 px-1 text-center">
                                <button
                                  onClick={() => handleDeleteHistoryRow(row.id)}
                                  className="text-red-500 hover:text-red-700 p-0.5"
                                  title="حذف هذا الصف"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        {historyRows.length === 0 && (
                          <tr>
                            <td colSpan={isTableEditing ? 8 : 7} className="py-4 text-center text-xs text-gray-400 italic">
                              لا توجد إحداثيات مسجلة. اضغط على زر "تحميل من سجل الجهاز" أعلاه لجلب البيانات.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4 KPI METRIC TILES */}
              <div className={`trk-stats ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1 p-1 rounded-xl relative' : ''}`}>
                {isDragEnabled && (
                  <div className="col-span-4 drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print rounded-t-lg">
                    <span className="flex items-center gap-1"><GripHorizontal size={12} /> اسحب لنقل بطاقات المؤشرات</span>
                    <span>⋮⋮</span>
                  </div>
                )}

                {/* Card 1: Distance from Release (Rightmost in RTL) */}
                <div className="trk-stat">
                  <div className="val red" dir="ltr">
                    {metrics.distFromReleaseKm} km
                  </div>
                  <div className="lab">
                    المسافة من موقع التركيب
                  </div>
                </div>

                {/* Card 2: Bearing Direction & Degrees */}
                <div className="trk-stat">
                  <div className="val">
                    {metrics.bearingArabic.text}
                  </div>
                  <div className="lab">
                    الاتجاه ({metrics.bearingArabic.degrees}°)
                  </div>
                </div>

                {/* Card 3: Distance from Camp */}
                <div className="trk-stat">
                  <div className="val brown" dir="ltr">
                    {metrics.distToCampKm} km
                  </div>
                  <div className="lab">
                    البعد عن المخيم
                  </div>
                </div>

                {/* Card 4: Tracking Duration (Leftmost in RTL) */}
                <div className="trk-stat">
                  <div className="val" dir="rtl">
                    <span>{metrics.durationDays}</span> يوم
                  </div>
                  <div className="lab">
                    مدة المتابعة
                  </div>
                </div>
              </div>

            </aside>

            {/* ─── COLUMN 2 (LEFT in RTL): MAP WINDOW & LEGEND (1fr) ───── */}
            <div className="flex flex-col space-y-2.5" style={{ direction: 'ltr', minWidth: 0 }}>
              
              {/* Map Viewport Frame */}
              <div 
                ref={mapViewportRef}
                className="relative border border-[#d9dbe1] rounded-[10px] overflow-hidden bg-stone-900 h-[465px] shadow-xs flex items-center justify-center"
                style={{ direction: 'ltr', textAlign: 'left' }}
              >
                
                {/* 1. SCREENED PHOTO FROM LIVE TRACK OR UPLOADED QGIS MAP */}
                {mapDisplayMode === 'snapshot' && mapSnapshotUrl ? (
                  <div className="relative w-full h-full overflow-hidden bg-slate-950 flex items-center justify-center group">
                    <img 
                      src={mapSnapshotUrl} 
                      alt="خريطة التقرير (QGIS أو لقطة مباشرة)" 
                      className="w-full h-full select-none"
                      style={{ 
                        display: 'block', 
                        width: '100%', 
                        height: '100%',
                        objectFit: mapImageFit 
                      }}
                    />
                    {/* Floating Controls for Uploaded/Captured Map (Excluded during PDF/PNG export) */}
                    <div className="no-export-snapshot no-print absolute top-2 right-2 flex items-center gap-1.5 bg-black/80 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg text-xs shadow-lg opacity-85 hover:opacity-100 transition-opacity">
                      <span className="text-[10px] text-sky-400 font-bold pl-1 border-l border-white/20">خريطة QGIS / صورة</span>
                      <button
                        type="button"
                        onClick={() => mapImageInputRef.current?.click()}
                        className="hover:text-sky-300 flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px]"
                        title="استبدال بصورة خريطة QGIS أخرى"
                      >
                        <Upload size={11} />
                        <span>استبدال</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMapImageFit(prev => prev === 'contain' ? 'cover' : prev === 'cover' ? 'fill' : 'contain')}
                        className="hover:text-sky-300 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-mono"
                        title="تبديل وضع ملاءمة العرض: احتواء (contain) / تغطية (cover) / ملء (fill)"
                      >
                        {mapImageFit}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMapDisplayMode('interactive');
                          setFitKey(k => k + 1);
                        }}
                        className="hover:text-amber-300 flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px]"
                        title="العودة للخريطة التفاعلية"
                      >
                        <Layers size={11} />
                        <span>تفاعلية</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 2. CLEAN DYNAMIC MAP WITH APPLIED FILTERS */
                  <div className="relative w-full h-full">
                    {/* Quick Button to Upload QGIS Map right from the interactive map view */}
                    <div className="no-export-snapshot no-print absolute top-2 left-2 z-[400]">
                      <button
                        type="button"
                        onClick={() => mapImageInputRef.current?.click()}
                        className="px-2.5 py-1 bg-white/95 dark:bg-slate-800/95 hover:bg-white text-gray-800 dark:text-gray-200 rounded-md shadow-md border border-gray-300 dark:border-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all backdrop-blur-xs"
                        title="رفع خريطة PNG معدلة ببرنامج QGIS وتثبيتها مكان الخريطة التفاعلية"
                      >
                        <Upload size={12} className="text-sky-600" />
                        <span>رفع خريطة QGIS</span>
                      </button>
                    </div>
                    <MapContainer
                      center={mapCenter}
                      zoom={mapZoom}
                      scrollWheelZoom={true}
                      dragging={true}
                      doubleClickZoom={true}
                      touchZoom={true}
                      zoomControl={false}
                      attributionControl={false}
                      className={`w-full h-full ${isMeasuring ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
                      style={{ direction: 'ltr', width: '100%', height: '100%' }}
                    >
                      <MapInstanceBinder onMapInstance={setMapInstance} />

                      {/* Measure Map Click Events Listener */}
                      <MeasureMapEvents
                        isMeasuring={isMeasuring}
                        onMapClick={(lat, lon) => {
                          setMeasurePoints(prev => [...prev, [lat, lon]]);
                        }}
                      />

                      {/* Base Tile Layer */}
                      {getProductionTileLayer(activeBaseLayer)}

                      {/* Optional Google Labels Overlay (Roads & Cities) */}
                      {showGoogleLabels && (
                        <TileLayer
                          url="https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}"
                          attribution="&copy; Google"
                          maxZoom={20}
                          zIndex={400}
                          crossOrigin="anonymous"
                        />
                      )}

                      {/* Map View Controller */}
                      <CustomReportMapViewController 
                        center={mapCenter}
                        zoom={mapZoom}
                        fitKey={fitKey}
                      />

                      {/* GIS Scale Bar */}
                      <ScaleControl position="bottomright" metric={true} imperial={false} />

                      {/* Real History Flight Trajectory */}
                      {showFlightTrack && allHistoryPoints.length > 1 && (
                        <Polyline
                          positions={allHistoryPoints}
                          pathOptions={{
                            color: '#6366f1',
                            weight: 2.8,
                            opacity: 0.85
                          }}
                        />
                      )}

                      {/* Telemetry Fix Dots */}
                      {showFlightTrack && allHistoryPoints.map((pt, i) => (
                        <CircleMarker
                          key={`pt-${i}`}
                          center={pt}
                          radius={3}
                          pathOptions={{
                            fillColor: '#ffffff',
                            fillOpacity: 0.95,
                            color: '#4f46e5',
                            weight: 1.5
                          }}
                        />
                      ))}

                      {/* Distance line between Camps (Requested Filter) */}
                      {showCampDistance && visibleCampIds.length >= 2 && (() => {
                        const c1 = FIXED_FIELD_CAMPS.find(c => c.id === visibleCampIds[0]) || FIXED_FIELD_CAMPS[0];
                        const c2 = FIXED_FIELD_CAMPS.find(c => c.id === visibleCampIds[1]) || FIXED_FIELD_CAMPS[1];
                        const dKm = calculateDistanceKm(c1.lat, c1.lon, c2.lat, c2.lon).toFixed(1);
                        const mid: [number, number] = [(c1.lat + c2.lat) / 2, (c1.lon + c2.lon) / 2];
                        return (
                          <>
                            <Polyline
                              positions={[
                                [c1.lat, c1.lon],
                                [c2.lat, c2.lon]
                              ]}
                              pathOptions={{
                                color: '#059669',
                                weight: 2.5,
                                dashArray: '6, 6',
                                opacity: 0.95
                              }}
                            />
                            <Marker
                              position={mid}
                              icon={createDistancePillIcon(`${dKm} km`, '#059669')}
                              zIndexOffset={1500}
                              interactive={false}
                            />
                          </>
                        );
                      })()}

                      {/* Distance line between Chosen Camp(s) and Last Position (Requested Feature) */}
                      {visibleCampIds.map(campId => {
                        if (!campDistToLastEnabled[campId]) return null;
                        const camp = FIXED_FIELD_CAMPS.find(c => c.id === campId);
                        if (!camp || metrics.lLat === 0 || metrics.lLon === 0) return null;

                        const distKm = calculateDistanceKm(camp.lat, camp.lon, metrics.lLat, metrics.lLon).toFixed(1);
                        const midLat = (camp.lat + metrics.lLat) / 2;
                        const midLon = (camp.lon + metrics.lLon) / 2;

                        return (
                          <React.Fragment key={`camp-dist-to-last-${campId}`}>
                            <Polyline
                              positions={[
                                [camp.lat, camp.lon],
                                [metrics.lLat, metrics.lLon]
                              ]}
                              pathOptions={{
                                color: '#d97706',
                                weight: 2.5,
                                dashArray: '6, 6',
                                opacity: 0.95
                              }}
                            />
                            <Marker
                              position={[midLat, midLon]}
                              icon={createDistancePillIcon(`${distKm} km`, '#d97706')}
                              zIndexOffset={1600}
                              interactive={false}
                            />
                          </React.Fragment>
                        );
                      })}

                      {/* Distance line: Last Position to Release Location (Requested Filter) */}
                      {showDistanceToRelease && metrics.lLat !== 0 && metrics.rLat !== 0 && (
                        <>
                          <Polyline
                            positions={[
                              [metrics.lLat, metrics.lLon],
                              [metrics.rLat, metrics.rLon]
                            ]}
                            pathOptions={{
                              color: '#dc2626',
                              weight: 2.5,
                              dashArray: '6, 6',
                              opacity: 0.95
                            }}
                          />
                          <Marker
                            position={metrics.releaseToLastMid}
                            icon={createDistancePillIcon(`${metrics.distFromReleaseKm} km`, '#dc2626')}
                            zIndexOffset={1500}
                            interactive={true}
                            draggable={true}
                          />
                        </>
                      )}

                      {/* Release Location Marker (Requested Filter) */}
                      {showReleaseMarker && metrics.rLat !== 0 && metrics.rLon !== 0 && (
                        <>
                          <Marker
                            position={[metrics.rLat, metrics.rLon]}
                            icon={createLiveTrackingPinIcon('#701a2b')}
                            zIndexOffset={1800}
                            interactive={false}
                          />
                          <Marker
                            position={[metrics.rLat, metrics.rLon]}
                            icon={createLiveTrackingLabelIcon({
                              number: displayTransmitterLabel,
                              ringId: customMetadata.birdRing,
                              borderColorHex: '#701a2b',
                              labelTitle: 'موقع تركيب الجهاز'
                            })}
                            zIndexOffset={1801}
                            draggable={true}
                          />
                        </>
                      )}

                      {/* Current/Latest Active Transmitter Marker (With Ring fallback if NA) */}
                      {metrics.lLat !== 0 && metrics.lLon !== 0 && (
                        <>
                          <Marker
                            position={[metrics.lLat, metrics.lLon]}
                            icon={createLiveTrackingPinIcon('#22c55e')}
                            zIndexOffset={2000}
                            interactive={false}
                          />
                          <Marker
                            position={[metrics.lLat, metrics.lLon]}
                            icon={createLiveTrackingLabelIcon({
                              number: displayTransmitterLabel,
                              ringId: customMetadata.birdRing,
                              borderColorHex: '#22c55e',
                              labelTitle: 'آخر موقع'
                            })}
                            zIndexOffset={2001}
                            draggable={true}
                          />
                        </>
                      )}

                      {/* Field Camps - Filtered one by one (Requested Filter) */}
                      {FIXED_FIELD_CAMPS.filter(camp => visibleCampIds.includes(camp.id)).map(camp => (
                        <React.Fragment key={camp.id}>
                          <Marker
                            position={[camp.lat, camp.lon]}
                            icon={createLiveTrackingCampPinIcon()}
                            zIndexOffset={1000}
                            interactive={false}
                          />
                          <Marker
                            position={[camp.lat, camp.lon]}
                            icon={createLiveTrackingCampLabelIcon(camp.name)}
                            zIndexOffset={1001}
                            draggable={true}
                          />
                        </React.Fragment>
                      ))}

                      {/* Interactive Distance Measurement Tool Drawing (EXPORTED WITH PNG & PDF) */}
                      {measurePoints.length > 0 && (
                        <>
                          <Polyline
                            positions={measurePoints}
                            pathOptions={{
                              color: '#eab308',
                              weight: 3.5,
                              dashArray: '7, 7',
                              opacity: 0.95
                            }}
                          />
                          {measurePoints.map((point, idx) => (
                            <Marker
                              key={`custom-measure-point-${idx}`}
                              position={point}
                              icon={idx === measurePoints.length - 1 ? measureEndIcon : measureDotIcon}
                              zIndexOffset={2200}
                              interactive={false}
                            />
                          ))}
                          {segmentDistances.map((seg, idx) => (
                            <Marker
                              key={`custom-measure-seg-${idx}`}
                              position={seg.midpoint}
                              icon={createDistancePillIcon(`${seg.distKm} km`, '#d97706', [32, 26])}
                              zIndexOffset={2300}
                              interactive={true}
                              draggable={true}
                            />
                          ))}
                          {measurePoints.length > 2 && (
                            <Marker
                              position={measurePoints[measurePoints.length - 1]}
                              icon={createDistancePillIcon(`المجموع: ${totalMeasureDistanceKm} km`, '#b45309', [42, 30])}
                              zIndexOffset={2400}
                              interactive={false}
                            />
                          )}
                        </>
                      )}

                    </MapContainer>

                    {/* Floating Measurement Tool Controls (Like Live Tracking Overlay) */}
                    {(isMeasuring || measurePoints.length > 0) && (
                      <div 
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] no-export-snapshot no-print flex items-center gap-2 bg-slate-900/95 backdrop-blur text-white px-3.5 py-1.5 rounded-full shadow-2xl border border-slate-700 text-xs select-none animate-in fade-in slide-in-from-bottom-2"
                      >
                        <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                          <Ruler size={14} />
                          <span>{isMeasuring ? 'وضع القياس (انقر للإضافة):' : 'المسافة المقاسة:'}</span>
                        </div>
                        
                        <div className="h-3.5 w-px bg-slate-700"></div>
                        
                        <div className="font-mono font-bold text-amber-300 text-xs">
                          {totalMeasureDistanceKm} km
                        </div>
                        
                        <div className="text-[10px] text-gray-400 font-normal">
                          ({measurePoints.length} نقاط)
                        </div>
                        
                        <div className="h-3.5 w-px bg-slate-700"></div>
                        
                        <button
                          type="button"
                          onClick={() => setMeasurePoints([])}
                          className="p-1 hover:bg-slate-800 rounded-full text-gray-400 hover:text-red-400 transition-colors"
                          title="مسح نقاط القياس"
                          disabled={measurePoints.length === 0}
                        >
                          <Trash2 size={13} />
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => setIsMeasuring(false)}
                          className="p-1 hover:bg-emerald-800/60 rounded-full text-emerald-400 hover:text-emerald-300 transition-colors"
                          title="إنهاء الرسم والاحتفاظ بالخط على الخريطة لتصديره"
                        >
                          <Check size={14} />
                        </button>
                      </div>
                    )}

                  </div>
                )}

                {/* ─── MAP OVERLAYS (MATCHING REFERENCE DESIGN) ──────────────────── */}

                {/* Top-Left Inset: Kazakhstan Country Silhouette Locator Map & Exact Bird Position */}
                <div className="absolute top-2 left-2 z-[1000] bg-white/95 backdrop-blur-sm border border-gray-400 rounded-md p-1 shadow-md w-[138px] pointer-events-none select-none">
                  <div className="relative w-full h-[76px] flex items-center justify-center bg-stone-50 border border-gray-200 rounded overflow-hidden">
                    {insetMapData.svgPath ? (
                      <svg viewBox={insetMapData.viewBox} className="w-full h-full">
                        {/* Kazakhstan Country Silhouette Border */}
                        <path
                          d={insetMapData.svgPath}
                          fill="#fdfbf7"
                          stroke="#881337"
                          strokeWidth="1.1"
                          strokeLinejoin="round"
                        />
                        {/* Red Bird Location Point */}
                        <circle 
                          cx={insetMapData.birdPoint.x} 
                          cy={insetMapData.birdPoint.y} 
                          r="4" 
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
                      </svg>
                    ) : (
                      <div className="text-[10px] text-gray-500 font-bold">{insetMapData.countryNameAr || 'كازاخستان'}</div>
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

                {/* Graticule Perimeter Labels (Ticks) */}
                <div className="absolute top-1 left-38 z-[900] pointer-events-none select-none">
                  <svg width="74" height="16" viewBox="0 0 74 16" style={{ display: 'block' }}>
                    <rect x="0" y="0" width="74" height="16" rx="4" fill="rgba(0, 0, 0, 0.55)" />
                    <text x="37" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                      {metrics.lLat ? `${Math.floor(metrics.lLat)}° 15.0000'N` : "47° 15.0000'N"}
                    </text>
                  </svg>
                </div>
                <div className="absolute top-1/2 -translate-y-1/2 left-1 z-[900] pointer-events-none select-none">
                  <svg width="74" height="16" viewBox="0 0 74 16" style={{ display: 'block' }}>
                    <rect x="0" y="0" width="74" height="16" rx="4" fill="rgba(0, 0, 0, 0.55)" />
                    <text x="37" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                      {metrics.lLat ? `${Math.floor(metrics.lLat)}° 00.0000'N` : "47° 00.0000'N"}
                    </text>
                  </svg>
                </div>
                <div className="absolute bottom-6 left-1 z-[900] pointer-events-none select-none">
                  <svg width="74" height="16" viewBox="0 0 74 16" style={{ display: 'block' }}>
                    <rect x="0" y="0" width="74" height="16" rx="4" fill="rgba(0, 0, 0, 0.55)" />
                    <text x="37" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                      {metrics.lLat ? `${Math.floor(metrics.lLat) - 1}° 45.0000'N` : "46° 45.0000'N"}
                    </text>
                  </svg>
                </div>

              </div>

              {/* Map Legend Bar */}
              <div 
                id="custom-map-legend-bar"
                className="trk-legend relative group select-none transition-all"
                style={{ direction: 'rtl', margin: '4px 0 0 0' }}
              >
                {/* Hover Quick Edit Button (when not in table edit mode) */}
                {!isTableEditing && (
                  <div className="no-export-snapshot no-print absolute -top-3 left-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <button
                      type="button"
                      onClick={() => setIsTableEditing(true)}
                      className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-md"
                      title="تعديل نصوص وألوان ورموز مفتاح الخريطة عنصراً بعنصر"
                    >
                      <Edit3 size={10} />
                      <span>تعديل المفتاح</span>
                    </button>
                  </div>
                )}

                {/* Edit Mode Top Toolbar */}
                {isTableEditing && (
                  <div className="no-export-snapshot no-print mb-2 pb-1.5 border-b border-gray-200 flex items-center justify-between text-xs w-full">
                    <span className="font-bold text-gray-800 flex items-center gap-1">
                      <Edit3 size={12} className="text-brand-500" />
                      <span>تعديل مفتاح الخريطة (عنصراً بعنصر):</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddLegendItem}
                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow-xs"
                      >
                        <Plus size={11} />
                        <span>إضافة عنصر</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetLegendItems}
                        className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-[11px] font-bold flex items-center gap-1"
                        title="إعادة تعيين مفتاح الخريطة للوضع الافتراضي"
                      >
                        <RotateCcw size={11} />
                        <span>استعادة الافتراضي</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Content: Edit View vs Clean Official Report View */}
                {isTableEditing ? (
                  <div className="flex flex-wrap items-center gap-2 py-1 w-full">
                    {legendItems.map((item, index) => (
                      <div 
                        key={item.id} 
                        className={`flex items-center gap-1.5 p-1 rounded-md border text-xs transition-colors ${
                          item.visible ? 'bg-amber-50/80 border-amber-300 shadow-xs' : 'bg-gray-100/60 border-gray-200 opacity-60'
                        }`}
                      >
                        {/* Visibility Toggle */}
                        <button
                          type="button"
                          onClick={() => handleUpdateLegendItem(item.id, { visible: !item.visible })}
                          className={`p-0.5 rounded hover:bg-white/80 ${item.visible ? 'text-emerald-700' : 'text-gray-400'}`}
                          title={item.visible ? 'إخفاء هذا العنصر من التقرير' : 'إظهار هذا العنصر في التقرير'}
                        >
                          {item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>

                        {/* Color Picker */}
                        <input
                          type="color"
                          value={item.color}
                          onChange={(e) => handleUpdateLegendItem(item.id, { color: e.target.value })}
                          className="w-5 h-5 rounded cursor-pointer border border-gray-300 p-0"
                          title="تغيير اللون"
                        />

                        {/* Symbol Selector */}
                        <select
                          value={item.symbol}
                          onChange={(e) => handleUpdateLegendItem(item.id, { symbol: e.target.value as any })}
                          className="text-[10.5px] bg-white border border-gray-200 rounded px-1 py-0.5 font-sans cursor-pointer outline-none"
                          title="نوع الرمز"
                        >
                          <option value="circle">دائرة</option>
                          <option value="line">خط</option>
                          <option value="dashed-line">متقطع</option>
                          <option value="tent">خيمة</option>
                          <option value="square">مربع</option>
                          <option value="star">نجمة</option>
                        </select>

                        {/* Editable Label */}
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => handleUpdateLegendItem(item.id, { label: e.target.value })}
                          className="px-1.5 py-0.5 text-[11px] font-bold text-gray-900 border border-gray-300 rounded bg-white w-28 md:w-36 outline-none focus:ring-1 focus:ring-amber-500 font-sans"
                          placeholder="نص العنصر..."
                        />

                        {/* Reorder: Move Left / Right */}
                        <button
                          type="button"
                          onClick={() => handleMoveLegendItem(index, 'left')}
                          disabled={index === 0}
                          className="p-0.5 text-gray-500 hover:text-gray-800 disabled:opacity-30"
                          title="تحريك للأمام (اليمين)"
                        >
                          <ChevronRight size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveLegendItem(index, 'right')}
                          disabled={index === legendItems.length - 1}
                          className="p-0.5 text-gray-500 hover:text-gray-800 disabled:opacity-30"
                          title="تحريك للخلف (اليسار)"
                        >
                          <ChevronLeft size={13} />
                        </button>

                        {/* Delete Item */}
                        <button
                          type="button"
                          onClick={() => handleDeleteLegendItem(item.id)}
                          className="p-0.5 text-red-500 hover:text-red-700"
                          title="حذف هذا العنصر من المفتاح"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-5 w-full">
                    {legendItems.filter(item => item.visible).map(item => (
                      <span key={item.id} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-800 whitespace-nowrap">
                        {renderLegendSymbol(item.symbol, item.color)}
                        <span>{item.label}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>

          {/* 3. REPORT FOOTER (MODIFIABLE AND PERSONALIZED) */}
          <footer className="trk-footer">
            <div className="flex items-center justify-between w-full" style={{ direction: 'rtl' }}>
              {/* Right Footer Text */}
              {isTableEditing ? (
                <input
                  type="text"
                  value={customMetadata.footerRight}
                  onChange={(e) => setCustomMetadata({ ...customMetadata, footerRight: e.target.value })}
                  className="text-right border border-amber-300 rounded px-2 py-0.5 bg-amber-50/50 font-bold text-gray-700 text-[11.5px] w-[55%]"
                  title="تعديل نص التذييل الأيمن"
                />
              ) : (
                <span className="font-semibold text-[12px] text-gray-600">
                  {customMetadata.footerRight || 'المركز القطري لتكاثر الحبارى والصقور – كازاخستان'}
                </span>
              )}

              {/* Left Footer Text */}
              {isTableEditing ? (
                <input
                  type="text"
                  value={customMetadata.footerLeft}
                  onChange={(e) => setCustomMetadata({ ...customMetadata, footerLeft: e.target.value })}
                  className="text-left font-mono border border-amber-300 rounded px-2 py-0.5 bg-amber-50/50 font-bold text-gray-500 text-[10px] w-[40%]"
                  dir="ltr"
                  title="تعديل نص التذييل الأيسر"
                  placeholder="تذييل اختياري..."
                />
              ) : customMetadata.footerLeft ? (
                <span className="text-[11px] text-gray-400 font-mono" dir="ltr">
                  {customMetadata.footerLeft}
                </span>
              ) : null}
            </div>
          </footer>

        </div>

      </div>

    </div>
  );
};
