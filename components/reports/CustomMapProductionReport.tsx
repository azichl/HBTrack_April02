import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Download, RefreshCw, Compass, MapPin, 
  Calendar, ChevronDown, Check, Search, SlidersHorizontal, 
  Layers, Info, FileDown, CheckCircle2,
  Plus, Minus, Crosshair, Maximize2, Minimize2,
  Edit3, Trash2, History, Camera, Image as ImageIcon, Sparkles,
  Move, RotateCcw, GripHorizontal, Eye, EyeOff, Ruler, Building2, Upload,
  ChevronLeft, ChevronRight, Palette, ZoomIn, ZoomOut, X, Save, AlertTriangle,
  Bot
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, useMap, useMapEvents, ScaleControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { exportReport, leafletIdle } from '../TrackingReport/exportReport';
import Draggable from 'react-draggable';
const DraggableComponent = Draggable as any;

import { useAppStore } from '../../store/appStore';
import { getHistoricalPositions } from '../../services/firestoreService';
import { FIXED_FIELD_CAMPS, FieldCampPoint } from '../../constants';
import { 
  safeParseTimestamp, 
  classifyLocationType, 
  findBirdForTransmitter,
  isBirdLinkedToTransmitter
} from '../../utils/formatting';
import { parseBirdCoordinateCommand, resolveBirdOrTransmitter } from '../../utils/coordinateParser';
import { SevenDayTempChart } from './SevenDayTempChart';
import { CustomMapAnnotation, createCustomAnnotationDivIcon } from './CustomMapAnnotations';
import { generateReportPdfBlob } from '../TrackingReport/exportReportToBlob';
import { BotReportBridgeModal } from './BotReportBridgeModal';
import {
  calculateDistanceKm,
  calculateBearingDegrees,
  formatArabicBearing,
  formatEnglishBearing,
  formatBearingByLanguage,
  translateDirection,
  formatDMM,
  formatDateDDMMYYYY,
  formatDateYYYYMMDD,
  calculateDurationFromReleaseToToday,
  getProductionTileLayer,
  buildCountrySvgData,
  resolveLocationFromCoords,
  normalizeCountryAr,
  resolveRegionBilingual,
  AutoResolvedLocation
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
  labelTitle,
  position = 'top'
}: {
  number: string;
  ringId?: string;
  borderColorHex: string;
  labelTitle?: string;
  position?: 'top' | 'right' | 'bottom' | 'left';
}) => {
  const rawId = String(number || '').trim().replace(/^trans-/, '');
  const isNA = !rawId || rawId.toUpperCase() === 'NA' || rawId.toUpperCase() === 'N/A' || rawId.toUpperCase() === 'NONE';
  const cleanId = isNA ? (String(ringId || 'NA').trim() || 'NA') : rawId;
  const hasTitle = Boolean(labelTitle);
  const pillW = Math.max(54, cleanId.length * 7.5 + 16);
  const titleW = hasTitle ? Math.max(54, (labelTitle || '').length * 8 + 12) : 0;
  const totalW = Math.max(pillW + 16, titleW + 16, 80);
  const totalH = hasTitle ? 45 : 25;

  let anchorX = totalW / 2;
  let anchorY = totalH + 35; // Default: 'top' (above pin)

  if (position === 'right') {
    // Label sits neatly to the right of the pin (e.g. Release label in Photo 1)
    anchorX = -12;
    anchorY = totalH / 2 + 6;
  } else if (position === 'left') {
    anchorX = totalW + 12;
    anchorY = totalH / 2 + 6;
  } else if (position === 'bottom') {
    anchorX = totalW / 2;
    anchorY = -12;
  }

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
    iconAnchor: [anchorX, anchorY],
  });
};

const createLiveTrackingCampPinIcon = (pinColorHex: string = '#f59e0b') => {
  return L.divIcon({
    className: 'bg-transparent',
    html: `
      <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; display: block;">
        <circle cx="15" cy="15" r="14" fill="${pinColorHex}" stroke="#ffffff" stroke-width="2"/>
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
        <rect x="0" y="0" width="${totalW}" height="${totalH}" fill="none" pointer-events="all" style="cursor: grab;" />
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
          pointer-events="none"
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
  anchorOffset?: [number, number]
) => {
  const pillW = Math.max(70, text.length * 7.5 + 16);
  const pillH = 24;
  const finalAnchor: [number, number] = anchorOffset || [pillW / 2, pillH / 2];

  return L.divIcon({
    className: 'bg-transparent cursor-grab active:cursor-grabbing',
    html: `
      <svg width="${pillW}" height="${pillH}" viewBox="0 0 ${pillW} ${pillH}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; display: block; cursor: grab; pointer-events: auto;">
        <rect 
          x="1" 
          y="1" 
          width="${pillW - 2}" 
          height="${pillH - 2}" 
          rx="11" 
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
    iconAnchor: finalAnchor
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

/**
 * Dynamic GIS Graphic Scale Bar matching reference model (e.g., 25 km with two-segment black/white bar)
 */
const CustomGraphicScaleControl = () => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const GraphicControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function() {
        const div = L.DomUtil.create('div', 'leaflet-graphic-scale-card');
        div.style.backgroundColor = '#ffffff';
        div.style.padding = '5px 14px 6px 14px';
        div.style.borderRadius = '6px';
        div.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.18)';
        div.style.border = '1px solid rgba(0, 0, 0, 0.2)';
        div.style.marginRight = '12px';
        div.style.marginBottom = '10px';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.alignItems = 'center';
        div.style.minWidth = '115px';
        div.style.boxSizing = 'border-box';
        div.style.userSelect = 'none';
        div.style.pointerEvents = 'none';
        div.style.direction = 'ltr';
        div.innerHTML = `
          <div class="scale-text" style="font-size: 11px; font-weight: 600; color: #111827; font-family: Arial, sans-serif; line-height: 1.2; margin-bottom: 3px; text-align: center;">25 km</div>
          <div class="scale-bar" style="width: 80px; height: 4.5px; display: flex; border: 1px solid #111827; box-sizing: border-box; overflow: hidden;">
            <div style="width: 50%; height: 100%; background-color: #111827;"></div>
            <div style="width: 50%; height: 100%; background-color: #ffffff;"></div>
          </div>
        `;
        return div;
      }
    });

    const control = new GraphicControl();
    control.addTo(map);

    const updateScale = () => {
      const container = control.getContainer();
      if (!container) return;
      const size = map.getSize();
      if (!size.x || !size.y) return;

      const y = size.y / 2;
      const maxPixels = 80;
      const p1 = map.containerPointToLatLng([size.x / 2 - maxPixels / 2, y]);
      const p2 = map.containerPointToLatLng([size.x / 2 + maxPixels / 2, y]);
      const maxMeters = map.distance(p1, p2);
      if (!maxMeters || isNaN(maxMeters)) return;

      const pow10 = Math.pow(10, Math.floor(Math.log10(maxMeters)));
      const d = maxMeters / pow10;
      let roundFactor = 1;
      if (d >= 5) roundFactor = 5;
      else if (d >= 2.5) roundFactor = 2.5;
      else if (d >= 2) roundFactor = 2;
      else roundFactor = 1;
      const targetMeters = roundFactor * pow10;

      const actualWidthPx = Math.max(65, Math.min(95, Math.round((targetMeters / maxMeters) * maxPixels)));
      const text = targetMeters >= 1000 
        ? `${targetMeters / 1000} km` 
        : `${targetMeters} m`;

      const textEl = container.querySelector('.scale-text') as HTMLElement;
      const barEl = container.querySelector('.scale-bar') as HTMLElement;
      if (textEl) textEl.textContent = text;
      if (barEl) barEl.style.width = `${actualWidthPx}px`;
    };

    updateScale();
    map.on('zoomend moveend resize', updateScale);

    return () => {
      map.off('zoomend moveend resize', updateScale);
      control.remove();
    };
  }, [map]);

  return null;
};

// ─── DYNAMIC GIS GRATICULE (GRID LINES & PERIMETER TICKS THAT MOVE WITH MAP) ───
const getGraticuleGridStep = (span: number): number => {
  const candidates = [5.0, 2.0, 1.0, 0.5, 0.25, 1 / 6, 1 / 12, 1 / 30, 1 / 60];
  for (const step of candidates) {
    const count = span / step;
    if (count >= 1.5 && count <= 5) return step;
  }
  if (span > 5) return 2.0;
  if (span < 0.05) return 1 / 60;
  return 0.25;
};

const formatGraticuleLat = (lat: number): string => {
  const abs = Math.abs(lat);
  let deg = Math.floor(abs);
  let min = (abs - deg) * 60;
  if (min >= 59.9995) {
    deg += 1;
    min = 0;
  }
  const degStr = String(deg).padStart(2, '0');
  const minStr = (Math.round(min * 10000) / 10000).toFixed(4).padStart(7, '0');
  const dir = lat >= 0 ? 'N' : 'S';
  return `${degStr}° ${minStr}'${dir}`;
};

const formatGraticuleLon = (lon: number): string => {
  let normalized = ((lon + 180) % 360 + 360) % 360 - 180;
  const abs = Math.abs(normalized);
  let deg = Math.floor(abs);
  let min = (abs - deg) * 60;
  if (min >= 59.9995) {
    deg += 1;
    min = 0;
  }
  const degStr = String(deg).padStart(3, '0');
  const minStr = (Math.round(min * 10000) / 10000).toFixed(4).padStart(7, '0');
  const dir = normalized >= 0 ? 'E' : 'W';
  return `${degStr}° ${minStr}'${dir}`;
};

interface GraticuleData {
  latLines: { lat: number; y: number; label: string }[];
  lonLines: { lon: number; x: number; label: string }[];
  width: number;
  height: number;
}

const MapGraticuleListener = ({
  onUpdate
}: {
  onUpdate: (data: GraticuleData) => void;
}) => {
  const map = useMap();

  const calculate = useCallback(() => {
    if (!map) return;
    try {
      const bounds = map.getBounds();
      const size = map.getSize();
      if (!size.x || !size.y) return;

      const north = bounds.getNorth();
      const south = bounds.getSouth();
      const west = bounds.getWest();
      const east = bounds.getEast();

      const latSpan = Math.abs(north - south);
      const lonSpan = Math.abs(east - west);
      if (!latSpan || !lonSpan || isNaN(latSpan) || isNaN(lonSpan)) return;

      const latStep = getGraticuleGridStep(latSpan);
      const lonStep = getGraticuleGridStep(lonSpan);

      const latLines: { lat: number; y: number; label: string }[] = [];
      const startLatIdx = Math.ceil(south / latStep);
      const endLatIdx = Math.floor(north / latStep);
      for (let i = startLatIdx; i <= endLatIdx; i++) {
        const lat = Math.round(i * latStep * 1000000) / 1000000;
        const pt = map.latLngToContainerPoint([lat, (west + east) / 2]);
        latLines.push({
          lat,
          y: Math.round(pt.y),
          label: formatGraticuleLat(lat)
        });
      }

      const lonLines: { lon: number; x: number; label: string }[] = [];
      const startLonIdx = Math.ceil(west / lonStep);
      const endLonIdx = Math.floor(east / lonStep);
      for (let i = startLonIdx; i <= endLonIdx; i++) {
        const lon = Math.round(i * lonStep * 1000000) / 1000000;
        const pt = map.latLngToContainerPoint([(north + south) / 2, lon]);
        lonLines.push({
          lon,
          x: Math.round(pt.x),
          label: formatGraticuleLon(lon)
        });
      }

      onUpdate({ latLines, lonLines, width: size.x, height: size.y });
    } catch (e) {
      console.warn('Graticule calculation error:', e);
    }
  }, [map, onUpdate]);

  useMapEvents({
    move: calculate,
    zoom: calculate,
    moveend: calculate,
    zoomend: calculate,
    resize: calculate
  });

  useEffect(() => {
    calculate();
    const t = setTimeout(calculate, 200);
    return () => clearTimeout(t);
  }, [calculate]);

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

export interface ReportSectionVisibility {
  header: boolean;
  birdDataCard: boolean;
  coordinatesCard: boolean;
  kpiCards: boolean;
  tempChart: boolean;
  legend: boolean;
  scaleBar: boolean;
  northArrow: boolean;
  footer: boolean;
}

export interface ReportThemeColors {
  primaryMaroon: string;
  latestGreen: string;
  trackLine: string;
  campPin: string;
  releasePin: string;
}

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

  // ─── 100% EDITABLE STUDIO: SECTION VISIBILITY & THEME COLORS ─────────────
  const [sectionVisibility, setSectionVisibility] = useState<ReportSectionVisibility>({
    header: true,
    birdDataCard: true,
    coordinatesCard: true,
    kpiCards: true,
    tempChart: true,
    legend: true,
    scaleBar: true,
    northArrow: true,
    footer: true,
  });

  const [themeColors, setThemeColors] = useState<ReportThemeColors>({
    primaryMaroon: '#7a1c32',
    latestGreen: '#059669',
    trackLine: '#dc2626',
    campPin: '#f59e0b',
    releasePin: '#7a1c32',
  });

  const [isBotModalOpen, setIsBotModalOpen] = useState<boolean>(false);
  const [annotations, setAnnotations] = useState<CustomMapAnnotation[]>([]);

  // Selected Transmitter (defaults to 244289 as requested)
  const initialPtt = useMemo(() => {
    if (exportedMapView?.transmitterId) return exportedMapView.transmitterId;
    return '244289';
  }, [exportedMapView]);

  const initialNearestCamp = useMemo(() => {
    let nearest = FIXED_FIELD_CAMPS[0];
    let minDist = Infinity;
    const lat = 46.9965;
    const lon = 67.0222;
    for (const c of FIXED_FIELD_CAMPS) {
      const d = calculateDistanceKm(lat, lon, c.lat, c.lon);
      if (d < minDist) {
        minDist = d;
        nearest = c;
      }
    }
    return nearest;
  }, []);

  const [selectedPttId, setSelectedPttId] = useState<string>(initialPtt);
  const [pttSearchTerm, setPttSearchTerm] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);
  const [selectedCampId, setSelectedCampId] = useState<string>(initialNearestCamp.id);

  // Base Map Layer
  const initialBaseLayer = useMemo(() => {
    const imported = exportedMapView?.baseLayer;
    if (imported && ['google_hybrid', 'google_roadmap', 'google_satellite', 'scienceterrain', 'roadmap'].includes(imported)) {
      return imported as any;
    }
    return 'google_roadmap';
  }, [exportedMapView]);

  const [activeBaseLayer, setActiveBaseLayer] = useState<'google_hybrid' | 'google_roadmap' | 'google_satellite' | 'scienceterrain' | 'roadmap'>(initialBaseLayer);
  const [showLayerMenu, setShowLayerMenu] = useState<boolean>(false);
  const [showFooter, setShowFooter] = useState<boolean>(true);
  const [showGoogleLabels, setShowGoogleLabels] = useState<boolean>(true);
  const [reportLanguage, setReportLanguage] = useState<'ar' | 'en'>('ar');
  const [fitKey, setFitKey] = useState<number>(0);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  // Map Display Mode:
  // 'snapshot': exact photo screened from live track or QGIS upload (default on export)
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
  const [visibleCampIds, setVisibleCampIds] = useState<string[]>(FIXED_FIELD_CAMPS.map(c => c.id));
  // Distance between each chosen camp and last position (automatically enabled for nearest camp)
  const [campDistToLastEnabled, setCampDistToLastEnabled] = useState<{ [campId: string]: boolean }>({
    [initialNearestCamp.id]: true
  });
  // Distance between camps
  const [showCampDistance, setShowCampDistance] = useState<boolean>(false);

  // ─── DISTANCE MEASUREMENT TOOL ON MAP (AS REQUESTED) ──────────────────────
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);

  // ─── RELEASE & TRACK TOGGLES ──────────────────────────────────────────────
  const [showReleaseMarker, setShowReleaseMarker] = useState<boolean>(true);
  const [showDistanceToRelease, setShowDistanceToRelease] = useState<boolean>(true);
  const [showFlightTrack, setShowFlightTrack] = useState<boolean>(true);
  const [showGraticule, setShowGraticule] = useState<boolean>(true);
  const [graticuleData, setGraticuleData] = useState<GraticuleData>({
    latLines: [],
    lonLines: [],
    width: 800,
    height: 465
  });

  // ─── DRAG & DROP PERSONALIZATION MODE ──────────────────────────────────────
  const [isDragEnabled, setIsDragEnabled] = useState<boolean>(false);
  const [dragResetKey, setDragResetKey] = useState<number>(0);
  const [customCampDistPositions, setCustomCampDistPositions] = useState<{ [campId: string]: [number, number] }>({});
  const [customCampLabelPositions, setCustomCampLabelPositions] = useState<{ [campId: string]: [number, number] }>({});
  const [customReleaseDistPos, setCustomReleaseDistPos] = useState<[number, number] | null>(null);
  const [customReleaseMarkerPos, setCustomReleaseMarkerPos] = useState<[number, number] | null>(null);
  const [customLastPosMarkerPos, setCustomLastPosMarkerPos] = useState<[number, number] | null>(null);

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

  // ─── PERSISTENT SETTINGS SAVE/LOAD ──────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('hbtrack_report_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.customMetadata) setCustomMetadata(parsed.customMetadata);
        if (parsed.logoLeftUrl) setLogoLeftUrl(parsed.logoLeftUrl);
        if (parsed.logoLeftHeight) setLogoLeftHeight(parsed.logoLeftHeight);
        if (parsed.logoLeftWidth) setLogoLeftWidth(parsed.logoLeftWidth);
        if (parsed.logoRightUrl) setLogoRightUrl(parsed.logoRightUrl);
        if (parsed.logoRightHeight) setLogoRightHeight(parsed.logoRightHeight);
        if (parsed.logoRightWidth) setLogoRightWidth(parsed.logoRightWidth);
        if (parsed.legendItems) setLegendItems(parsed.legendItems);
        if (parsed.showGoogleLabels !== undefined) setShowGoogleLabels(parsed.showGoogleLabels);
        if (parsed.activeBaseLayer) setActiveBaseLayer(parsed.activeBaseLayer);
        if (parsed.showFooter !== undefined) setShowFooter(parsed.showFooter);
        if (parsed.showFlightTrack !== undefined) setShowFlightTrack(parsed.showFlightTrack);
        if (parsed.showGraticule !== undefined) setShowGraticule(parsed.showGraticule);
        if (parsed.tableMode) setTableMode(parsed.tableMode);
        if (parsed.reportLanguage) setReportLanguage(parsed.reportLanguage);
        if (parsed.mapImageFit) setMapImageFit(parsed.mapImageFit);
        if (parsed.sectionVisibility) setSectionVisibility(parsed.sectionVisibility);
        if (parsed.themeColors) setThemeColors(parsed.themeColors);
      } catch (e) {
        console.error('Failed to parse saved report settings', e);
      }
    }
  }, []);

  const saveSettings = () => {
    const settings = {
      customMetadata,
      logoLeftUrl,
      logoLeftHeight,
      logoLeftWidth,
      logoRightUrl,
      logoRightHeight,
      logoRightWidth,
      legendItems,
      showGoogleLabels,
      activeBaseLayer,
      showFooter,
      showFlightTrack,
      showGraticule,
      tableMode,
      reportLanguage,
      mapImageFit,
      sectionVisibility,
      themeColors
    };
    localStorage.setItem('hbtrack_report_settings', JSON.stringify(settings));
    setHistoryUploadNotice('تم بنجاح حفظ الإعدادات الافتراضية للتقرير.');
    setTimeout(() => setHistoryUploadNotice(null), 3000);
  };


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
    statDistFromRelease: string;
    statDirection: string;
    statDirectionDeg: string;
    statDistToCamp: string;
    statDuration: string;
  }>({
    birdRing: 'NA',
    statDistFromRelease: '',
    statDirection: '',
    statDirectionDeg: '',
    statDistToCamp: '',
    statDuration: '',

    species: 'وحش',
    gender: 'ذكر',
    birdStatus: 'حي',
    issueDate: formatDateYYYYMMDD(new Date()) || '2026-10-09',
    reportTitle: 'تقرير متابعة طائر حبارى مزود بجهاز تتبع',
    regionName: '',
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

  const T = {
    reportTitle: reportLanguage === 'ar' ? customMetadata.reportTitle || 'تقرير متابعة طائر حبارى مزود بجهاز تتبع' : customMetadata.reportTitle.includes('تقرير') ? 'Houbara Bustard Tracking Report' : customMetadata.reportTitle,
    issueDateLabel: reportLanguage === 'ar' ? 'تاريخ الإصدار' : 'Issue Date',
    transmitterLabel: reportLanguage === 'ar' ? 'جهاز التتبع' : 'Transmitter',
    regionLabel: reportLanguage === 'ar' ? 'منطقة' : 'Region',
    campLabel: reportLanguage === 'ar' ? 'مخيم' : 'Camp',
    birdData: reportLanguage === 'ar' ? 'بيانات الطائر' : 'Bird Data',
    txId: reportLanguage === 'ar' ? 'رقم جهاز التتبع' : 'Transmitter ID',
    ringId: reportLanguage === 'ar' ? 'رقم الحجل' : 'Ring Number',
    species: reportLanguage === 'ar' ? 'النوعية' : 'Species',
    gender: reportLanguage === 'ar' ? 'الجنس' : 'Gender',
    status: reportLanguage === 'ar' ? 'حالة الطائر' : 'Bird Status',
    installHead: reportLanguage === 'ar' ? 'تركيب الجهاز' : 'Release',
    lastHead: reportLanguage === 'ar' ? 'آخر موقع' : 'Latest Location',
    dateHeader: reportLanguage === 'ar' ? 'التاريخ' : 'Date',
    latHeader: reportLanguage === 'ar' ? 'خط العرض (N)' : 'Latitude (N)',
    lonHeader: reportLanguage === 'ar' ? 'خط الطول (E)' : 'Longitude (E)',
    followUp: reportLanguage === 'ar' ? 'مدة المتابعة' : 'Follow-up Duration',
    days: reportLanguage === 'ar' ? 'يوم' : 'days',
    distToCamp: reportLanguage === 'ar' ? 'البعد عن المخيم' : 'Distance to Camp',
    direction: reportLanguage === 'ar' ? 'الاتجاه' : 'Direction',
    distFromRelease: reportLanguage === 'ar' ? 'المسافة من موقع التركيب' : 'Distance from Release',
    agencyAr: reportLanguage === 'ar' ? customMetadata.agencyNameAr : customMetadata.agencyNameEn,
    agencyEn: reportLanguage === 'ar' ? customMetadata.agencyNameEn : customMetadata.agencyNameAr,
    footerLeft: customMetadata.footerLeft,
    footerRight: reportLanguage === 'ar' ? customMetadata.footerRight : customMetadata.footerRight.includes('المركز القطري') ? 'Qatar Center for Houbara Breeding - Kazakhstan' : customMetadata.footerRight
  };

  const translateValue = (val: string) => {
    if (reportLanguage === 'ar') return val;
    const dict: any = { 
      'حي': 'Alive', 'ميت': 'Dead', 'مفقود': 'Lost', 'ذكر': 'Male', 'أنثى': 'Female', 'وحش': 'Wild', 'إكثار أسري': 'Captive', 'NA': 'NA', 'كازاخستان': 'Kazakhstan',
      'موقع تركيب الجهاز': 'Release Location', 'آخر موقع': 'Latest Location', 'مخيم': 'Camp', 'طريق رئيسي': 'Main Road', 'مدن وقرى': 'Cities & Villages', 'البعد عنه': 'Distance to Camp', 'البعد عن المخيم': 'Distance to Camp',
      'جيزقازغان': 'Zhezqazgan', 'ألماتي': 'Almaty',
      'شمال': 'North', 'شمال شرق': 'Northeast', 'شرق': 'East', 'جنوب شرق': 'Southeast',
      'جنوب': 'South', 'جنوب غرب': 'Southwest', 'غرب': 'West', 'شمال غرب': 'Northwest'
    };
    let res = val.trim();
    if (dict[res]) return dict[res];
    if (res.includes('آخر موقع')) {
      res = res.replace('آخر موقع', 'Latest Location');
    }
    if (res.includes('البعد') || res.includes('المخيمات')) {
      res = 'Distance to Camp';
    }
    if (res.includes('مخيم جيزقازغان')) {
      res = 'Zhezqazgan camp';
    } else if (res.includes('جيزقازغان')) {
      res = 'Zhezqazgan';
    }
    if (res.includes('مخيم ألماتي')) {
      res = 'Almaty camp';
    } else if (res.includes('ألماتي')) {
      res = 'Almaty';
    }
    return res;
  };

  const getBearingLabel = (deg: number) => {
    return formatBearingByLanguage(deg, reportLanguage).text;
  };


  const reportContainerRef = useRef<HTMLDivElement>(null);
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ─── CUSTOM LOGOS & QGIS MAP UPLOAD (USER REQUESTED) ────────────────────────
  const [logoLeftUrl, setLogoLeftUrl] = useState<string>('/qatar-houbara-center-logo.png');
  const [logoRightUrl, setLogoRightUrl] = useState<string>('/qatar-emblem.png');
  const [mapImageFit, setMapImageFit] = useState<'cover' | 'contain' | 'fill'>('cover');



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
      label: 'Release Location',
      color: '#701a2b',
      symbol: 'circle',
      visible: true
    },
    {
      id: 'last_pos',
      label: 'Latest Location',
      color: '#22c55e',
      symbol: 'circle',
      visible: true
    },
    {
      id: 'camps',
      label: 'Camp',
      color: '#f59e0b',
      symbol: 'tent',
      visible: true
    },
    {
      id: 'camp_dist',
      label: 'Distance to Camp',
      color: '#d97706',
      symbol: 'dashed-line',
      visible: true
    },
    {
      id: 'main_road',
      label: 'Main Road',
      color: '#c4a47c',
      symbol: 'line',
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
        label: reportLanguage === 'en' ? 'Release Location' : 'موقع تركيب الجهاز',
        color: '#701a2b',
        symbol: 'circle',
        visible: showReleaseMarker
      },
      {
        id: 'last_pos',
        label: reportLanguage === 'en' ? 'Latest Location' : 'آخر موقع',
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
        label: reportLanguage === 'en' ? 'Distance to Camp' : 'المسافة إلى المخيم',
        color: '#d97706',
        symbol: 'dashed-line',
        visible: true
      },
      {
        id: 'main_road',
        label: reportLanguage === 'en' ? 'Main Road' : 'طريق رئيسي',
        color: '#c4a47c',
        symbol: 'line',
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
  }, [showReleaseMarker, visibleCampIds, showCampDistance, campDistanceKm, measurePoints.length, totalMeasureDistanceKm, reportLanguage]);

  // Keep legend items smoothly in sync with language & filters if not manually customized
  useEffect(() => {
    if (!isLegendCustomizedByUser) {
      setLegendItems(prev => prev.map(item => {
        if (item.id === 'last_pos') {
          return { ...item, label: reportLanguage === 'en' ? 'Latest Location' : 'آخر موقع' };
        }
        return item;
      }));
    }
  }, [reportLanguage, isLegendCustomizedByUser]);

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
    setCustomCampDistPositions({});
    setCustomCampLabelPositions({});
    setCustomReleaseDistPos(null);
    setCustomReleaseMarkerPos(null);
    setCustomLastPosMarkerPos(null);

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
          issueDate: formatDateYYYYMMDD(new Date()) || prev.issueDate,
          regionName: '',
          statDirection: '',
          statDirectionDeg: '',
          statDistFromRelease: '',
          statDistToCamp: '',
          statDuration: ''
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

        // Automatically find and select the nearest camp to the bird's last GPS fix
        const targetLastLat = isNaN(lastLat) ? 46.9965 : lastLat;
        const targetLastLon = isNaN(lastLon) ? 67.0222 : lastLon;
        let nearestCamp = FIXED_FIELD_CAMPS[0];
        let minCampDist = Infinity;
        for (const camp of FIXED_FIELD_CAMPS) {
          const dist = calculateDistanceKm(targetLastLat, targetLastLon, camp.lat, camp.lon);
          if (dist < minCampDist) {
            minCampDist = dist;
            nearestCamp = camp;
          }
        }

        setSelectedCampId(nearestCamp.id);
        setCampDistToLastEnabled({ [nearestCamp.id]: true });
        setShowDistanceToRelease(true);
        setVisibleCampIds(prev => prev.includes(nearestCamp.id) ? prev : [...prev, nearestCamp.id]);

        setHistoryRows(generatedRows);
        setHistoryUploadNotice(`تم تحميل ${gpsPositions.length} نقطة من سجل جهاز ${pttId} بنجاح!`);
      } else {
        const defLastLat = 46.9965;
        const defLastLon = 67.0222;
        let nearestCamp = FIXED_FIELD_CAMPS[0];
        let minCampDist = Infinity;
        for (const camp of FIXED_FIELD_CAMPS) {
          const dist = calculateDistanceKm(defLastLat, defLastLon, camp.lat, camp.lon);
          if (dist < minCampDist) {
            minCampDist = dist;
            nearestCamp = camp;
          }
        }
        setSelectedCampId(nearestCamp.id);
        setCampDistToLastEnabled({ [nearestCamp.id]: true });
        setShowDistanceToRelease(true);
        setVisibleCampIds(prev => prev.includes(nearestCamp.id) ? prev : [...prev, nearestCamp.id]);
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
    const matched = FIXED_FIELD_CAMPS.find(c => c.id === selectedCampId);
    if (matched) return matched;
    
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
    const bearingEnglish = formatEnglishBearing(bearing);
    const activeBearing = reportLanguage === 'ar' ? bearingArabic : bearingEnglish;
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
      bearingArabic: activeBearing,
      bearingEnglish,
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
  }, [telemetryData, activeCamp, reportLanguage]);

  // Recenter Map Helper (Fits bounds around Release Point, Last GPS Fix, and Active Camp)
  const handleRecenterMap = useCallback(() => {
    if (!mapInstance) return;
    mapInstance.invalidateSize();
    const pts: Array<[number, number]> = [];
    if (metrics.lLat && metrics.lLon && metrics.lLat !== 0 && metrics.lLon !== 0) {
      pts.push([metrics.lLat, metrics.lLon]);
    }
    if (metrics.rLat && metrics.rLon && metrics.rLat !== 0 && metrics.rLon !== 0) {
      pts.push([metrics.rLat, metrics.rLon]);
    }
    if (activeCamp?.lat && activeCamp?.lon) {
      pts.push([activeCamp.lat, activeCamp.lon]);
    }

    if (pts.length >= 2) {
      const bounds = L.latLngBounds(pts.map(p => L.latLng(p[0], p[1])));
      mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } else if (metrics.lLat && metrics.lLon) {
      mapInstance.setView([metrics.lLat, metrics.lLon], 10);
    } else {
      mapInstance.setView(mapCenter, mapZoom);
    }
  }, [mapInstance, metrics.lLat, metrics.lLon, metrics.rLat, metrics.rLon, activeCamp, mapCenter, mapZoom]);

  // Auto-recenter when telemetry loads or changes
  useEffect(() => {
    if (!mapInstance) return;
    const timer = setTimeout(() => {
      handleRecenterMap();
    }, 200);
    return () => clearTimeout(timer);
  }, [mapInstance, telemetryData.lastGpsPos.lat, telemetryData.lastGpsPos.lon, selectedCampId, handleRecenterMap]);

  // Close layer menu on outside click
  useEffect(() => {
    if (!showLayerMenu) return;
    const handleClickOutside = () => setShowLayerMenu(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showLayerMenu]);

  // Dynamic Kazakhstan country silhouette & bird location for the top-left locator map
  const insetMapData = useMemo(() => {
    const lat = metrics.lLat || 46.9965;
    const lon = metrics.lLon || 67.0222;
    return buildCountrySvgData(lon, lat, 140, 78, 5);
  }, [metrics.lLat, metrics.lLon]);

  // Automatic Country & Region Detection based on Transmitter's Last GPS Location
  const [autoLocation, setAutoLocation] = useState<AutoResolvedLocation>(() => {
    return resolveLocationFromCoords(metrics.lLat || 46.9965, metrics.lLon || 67.0222);
  });

  useEffect(() => {
    const lLat = Number(metrics.lLat);
    const lLon = Number(metrics.lLon);
    if (!lLat || !lLon || isNaN(lLat) || isNaN(lLon) || (lLat === 0 && lLon === 0)) return;

    // 1. Instant offline resolution (Uzbekistan, Kazakhstan, Algeria, etc.)
    const initial = resolveLocationFromCoords(lLat, lLon);
    setAutoLocation(initial);

    // 2. Async OpenStreetMap reverse geocoding to refine region bilingually
    const cacheKey = `${lLat.toFixed(2)},${lLon.toFixed(2)}`;
    try {
      const cached = sessionStorage.getItem(`hb_geo_v3_${cacheKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.regionAr && parsed?.countryAr) {
          setAutoLocation(parsed);
          return;
        }
      }
    } catch (_) {}

    let isMounted = true;
    Promise.all([
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lLat}&lon=${lLon}&zoom=10&accept-language=ar`).then(r => r.json()).catch(() => null),
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lLat}&lon=${lLon}&zoom=10&accept-language=en`).then(r => r.json()).catch(() => null)
    ])
      .then(([arData, enData]) => {
        if (!isMounted) return;
        const addrAr = arData?.address || {};
        const addrEn = enData?.address || {};

        const rawStateAr = addrAr.state || addrAr.county || addrAr.city || addrAr.district || '';
        const rawStateEn = addrEn.state || addrEn.county || addrEn.city || addrEn.district || '';

        const { regionAr, regionEn } = resolveRegionBilingual(
          rawStateAr,
          rawStateEn,
          initial.regionAr,
          initial.regionEn
        );

        const countryAr = normalizeCountryAr(addrAr.country || initial.countryAr, initial.iso2 || addrEn.country_code);
        const countryEn = addrEn.country || initial.countryEn;

        const refined: AutoResolvedLocation = {
          iso2: initial.iso2 || addrEn.country_code?.toUpperCase(),
          regionAr: regionAr || initial.regionAr,
          regionEn: regionEn || initial.regionEn,
          countryAr,
          countryEn
        };

        setAutoLocation(refined);
        try {
          sessionStorage.setItem(`hb_geo_v3_${cacheKey}`, JSON.stringify(refined));
        } catch (_) {}
      })
      .catch(() => {
        // Silently keep offline initial resolution
      });

    return () => {
      isMounted = false;
    };
  }, [metrics.lLat, metrics.lLon]);

  // Graticule Top Longitude (Meridian) Line Label (e.g. 067° 00.0000'E or 074° 15.0000'E)
  const graticuleLonLabel = useMemo(() => {
    const rawLon = Number(metrics.lLon);
    if (!rawLon || isNaN(rawLon)) return "067° 00.0000'E";
    const abs = Math.abs(rawLon);
    let deg = Math.floor(abs);
    let min = Math.round(((abs - deg) * 60) / 15) * 15;
    if (min >= 60) {
      deg += 1;
      min = 0;
    }
    const degStr = String(deg).padStart(3, '0');
    const minStr = String(min).padStart(2, '0');
    const dir = rawLon >= 0 ? 'E' : 'W';
    return `${degStr}° ${minStr}.0000'${dir}`;
  }, [metrics.lLon]);

  const filteredPtts = useMemo(() => {
    const list: string[] = ['244289', '244276'];
    transmitters.forEach(t => {
      if (t.platform_id && !list.includes(t.platform_id)) list.push(t.platform_id);
      if (t.id && !list.includes(t.id)) list.push(t.id);
    });
    if (!pttSearchTerm.trim()) return list;
    return list.filter(id => id.toLowerCase().includes(pttSearchTerm.toLowerCase()));
  }, [transmitters, pttSearchTerm]);

  // ─── UNIFIED BIRD ID SELECTOR & RESOLVER (PTT, RING, DARVIC) ──────────────
  const unifiedTargetOptions = useMemo(() => {
    const options: Array<{
      key: string;
      id: string;
      label: string;
      sublabel: string;
      pttId: string;
      ringId?: string;
      darvicId?: string;
      type: 'transmitter' | 'bird';
      searchValue: string;
    }> = [];

    const seenKeys = new Set<string>();

    // 1. All Transmitters from App Store
    transmitters.forEach(tx => {
      const ptt = tx.platform_id || tx.id;
      if (!ptt || seenKeys.has(`tx-${ptt}`)) return;
      seenKeys.add(`tx-${ptt}`);

      const linkedBird = birds.find(b => isBirdLinkedToTransmitter(b, tx));
      const ring = linkedBird?.ring_id;
      const darvic = linkedBird?.darvic_number;

      const subParts: string[] = [];
      if (ring && ring !== 'NA') subParts.push(`حجل: ${ring}`);
      if (darvic) subParts.push(`دارفيك: ${darvic}`);
      if (tx.status) subParts.push(`حالة: ${tx.status}`);

      options.push({
        key: `tx-${ptt}`,
        id: ptt,
        label: `جهاز PTT: ${ptt}`,
        sublabel: subParts.join(' | ') || 'جهاز تتبع',
        pttId: ptt,
        ringId: ring,
        darvicId: darvic,
        type: 'transmitter',
        searchValue: `${ptt} ${ring || ''} ${darvic || ''} ${tx.id || ''}`.toLowerCase()
      });
    });

    // 2. All Birds from App Store
    birds.forEach(b => {
      const ring = b.ring_id && b.ring_id !== 'NA' ? b.ring_id : '';
      const darvic = b.darvic_number || '';
      const linkedTx = transmitters.find(t => isBirdLinkedToTransmitter(b, t));
      const ptt = linkedTx?.platform_id || b.assigned_transmitter_id || 'NA';

      if (ring && !seenKeys.has(`ring-${ring}`)) {
        seenKeys.add(`ring-${ring}`);
        options.push({
          key: `ring-${ring}`,
          id: ring,
          label: `طائر (حجل): ${ring}`,
          sublabel: `جهاز: ${ptt}${darvic ? ` | دارفيك: ${darvic}` : ''}${b.species ? ` | ${b.species}` : ''}`,
          pttId: ptt,
          ringId: ring,
          darvicId: darvic,
          type: 'bird',
          searchValue: `${ring} ${ptt} ${darvic} ${b.species || ''}`.toLowerCase()
        });
      }

      if (darvic && !seenKeys.has(`darvic-${darvic}`)) {
        seenKeys.add(`darvic-${darvic}`);
        options.push({
          key: `darvic-${darvic}`,
          id: darvic,
          label: `طائر (دارفيك): ${darvic}`,
          sublabel: `حجل: ${ring || 'NA'} | جهاز: ${ptt}`,
          pttId: ptt,
          ringId: ring,
          darvicId: darvic,
          type: 'bird',
          searchValue: `${darvic} ${ring} ${ptt}`.toLowerCase()
        });
      }
    });

    // Fallbacks
    ['244289', '244276'].forEach(demoPtt => {
      if (!seenKeys.has(`tx-${demoPtt}`)) {
        seenKeys.add(`tx-${demoPtt}`);
        options.unshift({
          key: `tx-${demoPtt}`,
          id: demoPtt,
          label: `جهاز PTT: ${demoPtt}`,
          sublabel: 'نموذج قياسي',
          pttId: demoPtt,
          type: 'transmitter',
          searchValue: demoPtt.toLowerCase()
        });
      }
    });

    return options;
  }, [transmitters, birds]);

  const filteredUnifiedTargets = useMemo(() => {
    if (!pttSearchTerm.trim()) return unifiedTargetOptions;
    const term = pttSearchTerm.trim().toLowerCase();
    return unifiedTargetOptions.filter(opt => opt.searchValue.includes(term));
  }, [unifiedTargetOptions, pttSearchTerm]);

  const handleSelectUnifiedTarget = useCallback((targetId: string) => {
    const resolved = resolveBirdOrTransmitter(targetId, transmitters, birds);
    const targetPtt = resolved.pttId && resolved.pttId !== 'NA' ? resolved.pttId : targetId;
    setSelectedPttId(targetPtt);
    setPttSearchTerm('');
    setIsSearchOpen(false);

    if (resolved.bird) {
      const b = resolved.bird;
      setCustomMetadata(prev => ({
        ...prev,
        birdRing: b.ring_id || prev.birdRing || 'NA',
        species: b.species === 'Asian Houbara' ? 'وحش' : (b.species || prev.species),
        gender: b.sex === 'M' ? 'ذكر' : b.sex === 'F' ? 'أنثى' : prev.gender,
        birdStatus: resolved.transmitter?.status === 'active' ? 'حي' : (resolved.transmitter?.status || prev.birdStatus)
      }));
    }

    handleUploadFromHistory(targetPtt);
  }, [transmitters, birds, handleUploadFromHistory]);

  const handleApplyBotCommand = useCallback(async (identifier: string, lat?: number, lon?: number) => {
    if (identifier) {
      const resolved = resolveBirdOrTransmitter(identifier, transmitters, birds);
      const targetPtt = resolved.pttId && resolved.pttId !== 'NA' ? resolved.pttId : identifier;
      setSelectedPttId(targetPtt);
      if (resolved.bird) {
        const b = resolved.bird;
        setCustomMetadata(prev => ({
          ...prev,
          birdRing: b.ring_id || prev.birdRing || 'NA',
          species: b.species === 'Asian Houbara' ? 'وحش' : (b.species || prev.species),
          gender: b.sex === 'M' ? 'ذكر' : b.sex === 'F' ? 'أنثى' : prev.gender,
          birdStatus: resolved.transmitter?.status === 'active' ? 'حي' : (resolved.transmitter?.status || prev.birdStatus)
        }));
      }
      await handleUploadFromHistory(targetPtt);
    }

    if (lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon)) {
      setTelemetryData(prev => ({
        ...prev,
        lastGpsPos: {
          lat,
          lon,
          dateStr: formatDateDDMMYYYY(new Date())
        },
        dataSource: 'telemetry'
      }));
      setMapCenter([lat, lon]);
      setFitKey(k => k + 1);
    }
  }, [transmitters, birds, handleUploadFromHistory]);

  const handleGeneratePdfBlob = useCallback(async (): Promise<{ blob: Blob; fileName: string; caption: string }> => {
    const node = reportContainerRef.current || document.getElementById('custom-map-production-print-area')!;
    const blob = await generateReportPdfBlob(node);
    const fileName = `Houbara_Tracking_Report_${selectedPttId}_${formatDateYYYYMMDD(new Date())}`;
    const caption = `🦅 تقرير متابعة الحبارى (Houbara Report)\nجهاز: ${selectedPttId}\nالحجل: ${customMetadata.birdRing || 'NA'}\nالتاريخ: ${telemetryData.lastGpsPos.dateStr}\nالموقع: ${metrics.lLat.toFixed(4)}, ${metrics.lLon.toFixed(4)}`;
    return { blob, fileName, caption };
  }, [selectedPttId, customMetadata.birdRing, telemetryData.lastGpsPos.dateStr, metrics.lLat, metrics.lLon]);

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

        // 2. Format Graphic Scale Control card on white background (matching reference design)
        const clonedScaleCards = clonedDoc.querySelectorAll('.leaflet-graphic-scale-card');
        clonedScaleCards.forEach(card => {
          const el = card as HTMLElement;
          el.style.setProperty('background', '#ffffff', 'important');
          el.style.setProperty('background-color', '#ffffff', 'important');
          el.style.setProperty('border', '1px solid rgba(0, 0, 0, 0.2)', 'important');
          el.style.setProperty('border-radius', '6px', 'important');
          el.style.setProperty('padding', '5px 14px 6px 14px', 'important');
          el.style.setProperty('box-shadow', '0 1px 4px rgba(0, 0, 0, 0.18)', 'important');
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('flex-direction', 'column', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          el.style.setProperty('min-width', '115px', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
          const txt = el.querySelector('.scale-text') as HTMLElement;
          if (txt) {
            txt.style.setProperty('font-size', '11px', 'important');
            txt.style.setProperty('font-weight', '600', 'important');
            txt.style.setProperty('color', '#111827', 'important');
            txt.style.setProperty('margin-bottom', '3px', 'important');
            txt.style.setProperty('line-height', '1.2', 'important');
            txt.style.setProperty('text-align', 'center', 'important');
          }
          const bar = el.querySelector('.scale-bar') as HTMLElement;
          if (bar) {
            bar.style.setProperty('margin', '0 auto', 'important');
            bar.style.setProperty('height', '4.5px', 'important');
          }
        });

        // 3. FORCE PERFECT VERTICAL CENTERING ACROSS ALL TABLES, CELLS, AND BADGES (HTML2CANVAS FIX)
        const clonedCardHeads = clonedDoc.querySelectorAll('#custom-map-production-print-area .trk-card__head');
        clonedCardHeads.forEach(ch => {
          const el = ch as HTMLElement;
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          el.style.setProperty('min-height', '38px', 'important');
          el.style.setProperty('padding', '0 14px', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
        });

        const clonedRows = clonedDoc.querySelectorAll('#custom-map-production-print-area .trk-row');
        clonedRows.forEach(row => {
          const el = row as HTMLElement;
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('flex-direction', 'row', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          el.style.setProperty('min-height', '36px', 'important');
          el.style.setProperty('height', '36px', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
        });

        const clonedKs = clonedDoc.querySelectorAll('#custom-map-production-print-area .trk-row .k');
        clonedKs.forEach(k => {
          const el = k as HTMLElement;
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          el.style.setProperty('height', '100%', 'important');
          el.style.setProperty('padding', '0 14px', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
          el.style.setProperty('line-height', '1.2', 'important');
        });

        const clonedVs = clonedDoc.querySelectorAll('#custom-map-production-print-area .trk-row .v');
        clonedVs.forEach(v => {
          const el = v as HTMLElement;
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          el.style.setProperty('justify-content', 'center', 'important');
          el.style.setProperty('height', '100%', 'important');
          el.style.setProperty('padding', '0 14px', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
          el.style.setProperty('line-height', '1.2', 'important');
        });

        const clonedTwoHead = clonedDoc.querySelectorAll('#custom-map-production-print-area .trk-twohead');
        clonedTwoHead.forEach(th => {
          const el = th as HTMLElement;
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('flex-direction', 'row', 'important');
          el.style.setProperty('align-items', 'stretch', 'important');
          el.style.setProperty('height', '40px', 'important');
          el.style.setProperty('min-height', '40px', 'important');
        });

        const clonedTwoHeadItems = clonedDoc.querySelectorAll('#custom-map-production-print-area .trk-twohead__install, #custom-map-production-print-area .trk-twohead__last');
        clonedTwoHeadItems.forEach(item => {
          const el = item as HTMLElement;
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          el.style.setProperty('justify-content', 'center', 'important');
          el.style.setProperty('height', '100%', 'important');
          el.style.setProperty('padding', '0 12px', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
          el.style.setProperty('line-height', '1.2', 'important');
        });

        const clonedTableSpans = clonedDoc.querySelectorAll('#custom-map-production-print-area .trk-table > span');
        clonedTableSpans.forEach(sp => {
          const el = sp as HTMLElement;
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          el.style.setProperty('height', '36px', 'important');
          el.style.setProperty('min-height', '36px', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
          el.style.setProperty('line-height', '1.2', 'important');
          if (el.classList.contains('lbl')) {
            el.style.setProperty('justify-content', 'flex-start', 'important');
            el.style.setProperty('padding', '0 14px', 'important');
          } else {
            el.style.setProperty('justify-content', 'center', 'important');
            el.style.setProperty('padding', '0 10px', 'important');
          }
        });

        const clonedStats = clonedDoc.querySelectorAll('#custom-map-production-print-area .trk-stat');
        clonedStats.forEach(st => {
          const el = st as HTMLElement;
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('flex-direction', 'column', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          el.style.setProperty('justify-content', 'center', 'important');
          el.style.setProperty('min-height', '58px', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
        });

        const clonedPills = clonedDoc.querySelectorAll('#custom-map-production-print-area .pill');
        clonedPills.forEach(p => {
          const el = p as HTMLElement;
          el.style.setProperty('display', 'inline-flex', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          el.style.setProperty('justify-content', 'center', 'important');
          el.style.setProperty('vertical-align', 'middle', 'important');
          el.style.setProperty('height', '22px', 'important');
          el.style.setProperty('line-height', '1', 'important');
          el.style.setProperty('box-sizing', 'border-box', 'important');
        });

        const clonedLegendBars = clonedDoc.querySelectorAll('#custom-map-legend-bar, #custom-map-production-print-area .trk-legend');
        clonedLegendBars.forEach(bar => {
          const el = bar as HTMLElement;
          el.style.setProperty('display', 'flex', 'important');
          el.style.setProperty('align-items', 'center', 'important');
          const items = el.querySelectorAll('div, span');
          items.forEach(it => {
            const elIt = it as HTMLElement;
            elIt.style.setProperty('display', 'inline-flex', 'important');
            elIt.style.setProperty('align-items', 'center', 'important');
            elIt.style.setProperty('vertical-align', 'middle', 'important');
            elIt.style.setProperty('line-height', '1', 'important');
          });
        });

        // Set IBM Plex Sans Arabic font on the cloned print container
        const clonedPrintArea = clonedDoc.getElementById('custom-map-production-print-area');
        if (clonedPrintArea) {
          clonedPrintArea.style.setProperty('font-family', "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif", 'important');
        }

        // Ensure marker pane and distance pills sit cleanly on top
        const clonedMarkerPane = clonedDoc.querySelector('.leaflet-marker-pane') as HTMLElement;
        if (clonedMarkerPane) {
          clonedMarkerPane.style.zIndex = '800';
        }
      }
    };
  }, []);

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
  const getExportFileName = () => {
    let datePart = (customMetadata.issueDate || '').trim();
    if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      datePart = formatDateYYYYMMDD(new Date()) || new Date().toISOString().slice(0, 10);
    }
    const transmitterPart = displayTransmitterLabel || 'NA';
    const suffix = reportLanguage === 'en' ? 'Tracking report' : 'تقرير تتبع';
    return `${datePart}_${transmitterPart}_${suffix}`;
  };

  const handleExportPdf = async () => {
    if (!reportContainerRef.current) return;
    setIsExportingPdf(true);

    const snapBtn = document.getElementById('custom-map-quick-snap-btn');
    if (snapBtn) snapBtn.style.display = 'none';

    try {
      if (mapInstance) mapInstance.invalidateSize();
      const element = reportContainerRef.current;
      if (!element) return;

      const waitForMapReady = async () => {
        if (mapDisplayMode === 'interactive' && mapInstance) {
          await leafletIdle(mapInstance);
        } else if (mapDisplayMode === 'live') {
          const checkReady = () => !!reportContainerRef.current?.querySelector('.rpt-mapframe [data-map-ready="1"]');
          if (!checkReady()) {
            await new Promise<void>((resolve) => {
              let elapsed = 0;
              const interval = setInterval(() => {
                elapsed += 60;
                if (checkReady() || elapsed >= 8000) {
                  clearInterval(interval);
                  resolve();
                }
              }, 60);
            });
          }
          if (mapInstance) {
            await leafletIdle(mapInstance);
          }
        }
      };

      const exportFileName = getExportFileName();
      await exportReport(element, {
        fileName: exportFileName,
        format: 'pdf',
        pixelRatio: 2,
        waitForMap: waitForMapReady
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert(reportLanguage === 'en' ? 'An error occurred while exporting PDF.' : 'حدث خطأ أثناء تصدير ملف PDF.');
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
      const element = reportContainerRef.current;
      if (!element) return;

      const waitForMapReady = async () => {
        if (mapDisplayMode === 'interactive' && mapInstance) {
          await leafletIdle(mapInstance);
        } else if (mapDisplayMode === 'live') {
          const checkReady = () => !!reportContainerRef.current?.querySelector('.rpt-mapframe [data-map-ready="1"]');
          if (!checkReady()) {
            await new Promise<void>((resolve) => {
              let elapsed = 0;
              const interval = setInterval(() => {
                elapsed += 60;
                if (checkReady() || elapsed >= 8000) {
                  clearInterval(interval);
                  resolve();
                }
              }, 60);
            });
          }
          if (mapInstance) {
            await leafletIdle(mapInstance);
          }
        }
      };

      const exportFileName = getExportFileName();
      await exportReport(element, {
        fileName: exportFileName,
        format: 'png',
        pixelRatio: 2,
        waitForMap: waitForMapReady
      });
    } catch (error) {
      console.error('Error exporting image:', error);
      alert(reportLanguage === 'en' ? 'An error occurred while saving the image.' : 'حدث خطأ أثناء حفظ الصورة.');
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
          --maroon: ${themeColors.primaryMaroon};
          --green: ${themeColors.latestGreen};
          --amber: ${themeColors.campPin};
          --brown: #7a4a12;
          --red: ${themeColors.trackLine};
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
        .trk-header__rule { width: 1px; height: 52px; background: var(--maroon, #7a1c32); }
        .trk-header__names { text-align: right; }
        .trk-header__names .ar { font-size: 18px; font-weight: 600; letter-spacing: 0.02em; color: #1b2433; line-height: 1.25; }
        .trk-header__names .en { font-size: 19px; font-weight: 500; color: #1b2433; line-height: 1.2; font-family: 'Inter', 'Segoe UI', Arial, sans-serif !important; }
        .trk-header__center { height: 78px; }
        .trk-hr { height: 2px; background: var(--maroon, #7a1c32); margin: 12px 0 18px; width: 100%; display: block; }

        .trk-title { text-align: center; font-size: 23px; font-weight: 700; margin: 0 0 8px; color: #1b2433; }
        .trk-sub { text-align: center; color: #6b7280; font-size: 13px; margin: 0 0 16px; }
        .trk-sub b { color: var(--maroon, #7a1c32); font-weight: 700; }

        /* Two columns: side panel (440px on right in RTL) and map (left) */
        .trk-grid { display: grid; grid-template-columns: 440px 1fr; gap: 24px; flex: 1; min-height: 520px; width: 100%; }
        .trk-side { display: flex; flex-direction: column; gap: 12px; }

        /* 1. Explicit line boxes & vertical alignment */
        .trk-card__head,
        .trk-twohead > div,
        .trk-row .k,
        .trk-row .v,
        .trk-table > span,
        .trk-stat .val,
        .trk-stat .lab,
        .trk-legend span {
          line-height: 1.35;
        }

        .trk-card { border: 1px solid #d9dbe1; border-radius: 8px; overflow: hidden; background: #fff; }
        .trk-card__head { 
          background: var(--maroon, #7a1c32); 
          color: #fff; 
          font-weight: 700; 
          font-size: 14.5px; 
          padding: 0 14px; 
          height: 38px; 
          min-height: 38px; 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          box-sizing: border-box; 
          line-height: 1.35;
        }

        /* 2. Table cells: centre with flex and explicit box */
        .trk-row { 
          display: flex; 
          flex-direction: row; 
          align-items: stretch; 
          border-top: 1px solid #eceef2; 
          min-height: 36px; 
          box-sizing: border-box; 
        }
        .trk-row:first-of-type { border-top: 0; }
        .trk-row .k, .trk-row .v,
        .trk-table > span { 
          display: flex; 
          align-items: center; 
          min-height: 36px; 
          box-sizing: border-box; 
          line-height: 1.35; 
        }
        .trk-row .k { 
          flex: 1 1 50%; 
          width: 50%; 
          background: #f6f7f9; 
          padding: 0 14px; 
          font-weight: 600; 
          font-size: 13px; 
          text-align: right; 
          color: #374151; 
        }
        .trk-row .v { 
          flex: 1 1 50%; 
          width: 50%; 
          padding: 0 14px; 
          font-size: 13px; 
          text-align: center; 
          justify-content: center; 
        }
        .trk-row .v .maroon, .maroon { color: var(--maroon, #7a1c32); font-weight: 700; }

        /* 3. Pills: inline-flex + fixed height so they never clip */
        .pill { 
          display: inline-flex; 
          align-items: center; 
          justify-content: center; 
          height: 26px; 
          padding: 0 16px; 
          border-radius: 999px; 
          font-size: 11px; 
          font-weight: 600; 
          line-height: 1; 
          box-sizing: border-box; 
        }
        .pill--grey { background: #e8eaee; color: #6b7280; }
        .pill--ok { background: #e3f4ea; color: #15803d; }
        .pill--warn { background: #fdf0d5; color: #a16207; }
        .pill--bad { background: #fde4e4; color: #b91c1c; }

        .trk-card--table { border-color: #d9dbe1; }
        .trk-twohead { 
          display: flex; 
          flex-direction: row; 
          align-items: stretch; 
          color: #fff; 
          font-weight: 700; 
          font-size: 14px; 
          height: 40px; 
          min-height: 40px; 
          box-sizing: border-box; 
        }
        .trk-twohead::before { 
          content: ''; 
          background: #fff; 
          flex: 1 1 33.333%; 
          width: 33.333%; 
        }
        .trk-twohead > div {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          line-height: 1.35;
          box-sizing: border-box;
        }
        .trk-twohead__install { 
          background: var(--maroon, #7a1c32); 
          padding: 0 12px; 
          text-align: center; 
          flex: 1 1 33.333%; 
          width: 33.333%; 
        }
        .trk-twohead__last { 
          background: var(--green, #128a5b); 
          padding: 0 12px; 
          text-align: center; 
          flex: 1 1 33.333%; 
          width: 33.333%; 
        }
        .trk-table { 
          display: grid; 
          grid-template-columns: 1fr 1fr 1fr; 
        }
        .trk-table > span { 
          padding: 0 12px; 
          text-align: center; 
          font-size: 14px; 
          border-top: 1px solid #eceef2; 
          font-variant-numeric: tabular-nums; 
        }
        .trk-table > span:not(.lbl) {
          justify-content: center;
        }
        .trk-table .lbl { 
          background: #f6f7f9; 
          font-weight: 600; 
          text-align: right; 
          order: 0; 
          color: #374151; 
          justify-content: flex-start; 
          padding: 0 14px; 
        }

        .trk-stats { 
          display: grid; 
          grid-template-columns: repeat(4, 1fr); 
          gap: 8px; 
        }
        .trk-stat { 
          border: 1px solid #d9dbe1; 
          border-radius: 8px; 
          padding: 6px 4px; 
          text-align: center; 
          background: #fff; 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          justify-content: center; 
          min-height: 58px; 
          box-sizing: border-box; 
        }
        .trk-stat .val { 
          font-size: 14.5px; 
          font-weight: 700; 
          margin-bottom: 2px; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          line-height: 1.35; 
        }
        .trk-stat .val.red { color: #d9263a; }
        .trk-stat .val.brown { color: #7a4a12; }
        .trk-stat .lab { 
          font-size: 10px; 
          color: #6b7280; 
          line-height: 1.35; 
          text-align: center; 
        }

        /* 4. Legend: icon and label share one flex row, centred on the same axis */
        .trk-legend {
          display: flex; 
          flex-wrap: nowrap; 
          gap: 8px; 
          justify-content: space-between; 
          align-items: center;
          border: 1px solid #d9dbe1; 
          border-radius: 8px; 
          padding: 5px 12px; 
          margin-top: 6px; 
          font-size: 11px; 
          background: #fff; 
          white-space: nowrap; 
          width: 100%; 
          box-sizing: border-box; 
          min-height: 32px;
        }
        .trk-legend span, .trk-legend div { 
          display: inline-flex; 
          align-items: center; 
          gap: 8px; 
          line-height: 1.35; 
          vertical-align: middle; 
        }
        .trk-legend svg {
          flex: 0 0 auto;
          display: inline-block;
          vertical-align: middle;
        }
        .trk-legend i {
          flex: 0 0 auto;
          display: inline-block;
        }
        .trk-legend .dot { width: 11px; height: 11px; border-radius: 50%; display: inline-block; }
        .trk-legend .dot.maroon { background: #7a1c32; }
        .trk-legend .dot.green { background: #128a5b; }
        .trk-legend .tri { width: 0; height: 0; border-inline: 6px solid transparent; border-bottom: 11px solid #f5a623; }
        .trk-legend .line { width: 22px; height: 0; border-top: 3px solid #d9263a; display: inline-block; }
        .trk-legend .line.dotted { border-top: 2px dotted #f5a623; }
        .trk-legend .sq { width: 10px; height: 10px; background: #1c2430; display: inline-block; }
        .trk-footer { margin-top: 12px; border-top: 1px solid #d9dbe1; padding-top: 8px; color: #6b7280; font-size: 12px; text-align: left; }

        /* 5. Export mode: lock fonts/size so nothing reflows during capture */
        .trk-exporting { 
          -webkit-font-smoothing: antialiased; 
          font-kerning: normal; 
        }
        .trk-exporting .no-print, 
        .trk-exporting .no-export, 
        .trk-exporting .no-export-snapshot, 
        .trk-exporting .drag-handle, 
        .trk-exporting .logo-control-popover { 
          display: none !important; 
        }

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

            {/* Language Toggle */}
            <div className="flex bg-gray-100 dark:bg-slate-800 rounded-lg p-0.5 shadow-inner">
              <button
                onClick={() => setReportLanguage('ar')}
                className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${reportLanguage === 'ar' ? 'bg-white dark:bg-slate-700 shadow-sm text-brand-600' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'}`}
              >
                العربية
              </button>
              <button
                onClick={() => setReportLanguage('en')}
                className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${reportLanguage === 'en' ? 'bg-white dark:bg-slate-700 shadow-sm text-brand-600' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'}`}
              >
                English
              </button>
            </div>

            {/* Telegram & WhatsApp Bot Bridge Trigger */}
            <button
              onClick={() => setIsBotModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-700 hover:to-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all whitespace-nowrap"
              title="ربط التقرير مع بوت تيليجرام وواتساب واستقبال الأوامر تلقائياً"
            >
              <Bot size={15} />
              <span>📲 بوت تيليجرام / واتساب</span>
            </button>

            {/* Save Settings */}
            <button
              onClick={saveSettings}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors whitespace-nowrap"
              title="حفظ الشعارات والتنسيقات للتقارير القادمة"
            >
              <Save size={14} />
              <span>حفظ الإعدادات</span>
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
          
          {/* 1. Unified Bird ID Selector & Resolver (PTT / Ring / Darvic) */}
          <div className="relative">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
              <span>البحث عن طائر أو جهاز:</span>
              <span className="text-[10px] text-brand-600 dark:text-brand-400 font-bold font-mono">PTT / Ring / Darvic</span>
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
                placeholder="ابحث برقم PTT أو الحجل أو الدارفيك..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white font-mono"
              />
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {isSearchOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsSearchOpen(false)} />
                <div className="absolute top-full mt-1.5 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-30 max-h-64 overflow-y-auto">
                  <div className="p-1.5 space-y-1">
                    {filteredUnifiedTargets.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => handleSelectUnifiedTarget(opt.id)}
                        className={`w-full text-right px-3 py-2 text-xs rounded-lg flex flex-col gap-0.5 transition-colors ${
                          selectedPttId === opt.pttId 
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 font-bold' 
                            : 'hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-800 dark:text-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono">
                          <span className="font-bold">{opt.label}</span>
                          <span className="text-[10px] text-gray-400 font-sans">
                            {opt.type === 'bird' ? 'طائر' : 'جهاز'}
                          </span>
                        </div>
                        {opt.sublabel && (
                          <div className="text-[10.5px] text-gray-500 dark:text-gray-400 font-sans truncate">
                            {opt.sublabel}
                          </div>
                        )}
                      </button>
                    ))}
                    {filteredUnifiedTargets.length === 0 && (
                      <div className="p-3 text-center text-xs text-gray-400 font-sans">
                        لا توجد نتائج مطابقة
                      </div>
                    )}
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
            <div className="flex bg-gray-100 dark:bg-slate-900 p-1 rounded-xl border border-gray-200 dark:border-slate-700 gap-1">
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
            <div className="mt-2.5 flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="showFlightTrack"
                checked={showFlightTrack}
                onChange={(e) => setShowFlightTrack(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer"
              />
              <label htmlFor="showFlightTrack" className="text-[11.5px] font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                إظهار مسار التتبع (Flight Track)
              </label>
            </div>
            <div className="mt-2.5 flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="showGraticule"
                checked={showGraticule}
                onChange={(e) => setShowGraticule(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer"
              />
              <label htmlFor="showGraticule" className="text-[11.5px] font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                إظهار شبكة ودرجات الإحداثيات المتحركة (Graticule Grid)
              </label>
            </div>
          </div>

          {/* 4. Table Display Mode & Footer */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              تذييل التقرير (Footer):
            </label>
            <div className="flex items-center gap-2 px-1 mb-4">
              <input
                type="checkbox"
                id="showFooter"
                checked={showFooter}
                onChange={(e) => setShowFooter(e.target.checked)}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer"
              />
              <label htmlFor="showFooter" className="text-[11.5px] font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                إظهار تذييل التقرير (نصوص أسفل الصفحة)
              </label>
            </div>
            
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
            
            {/* Section A: Map Feature Filters & Distance Checkboxes (Compact short cells with checkboxes) */}
            <div className="bg-gray-50/80 dark:bg-slate-900/60 p-3 rounded-xl border border-gray-200 dark:border-slate-700 space-y-2.5">
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

              {/* Grid of short compact cells with check cases */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {/* 1. Field Camps: Each in a short compact cell */}
                {FIXED_FIELD_CAMPS.map(camp => {
                  const isVisible = visibleCampIds.includes(camp.id);
                  const isDistToLastActive = campDistToLastEnabled[camp.id] || false;
                  const distToLast = metrics.lLat && metrics.lLon 
                    ? calculateDistanceKm(camp.lat, camp.lon, metrics.lLat, metrics.lLon).toFixed(1) 
                    : '0.0';

                  return (
                    <div 
                      key={camp.id}
                      className={`px-3 py-1.5 rounded-lg border flex items-center justify-between gap-2 transition-all ${
                        isVisible 
                          ? 'bg-white dark:bg-slate-800 border-emerald-300 dark:border-emerald-700/60 shadow-2xs' 
                          : 'bg-gray-100/60 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700 opacity-60'
                      }`}
                    >
                      {/* Checkbox: Camp Show/Hide */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setVisibleCampIds(prev => [...prev, camp.id]);
                            } else {
                              setVisibleCampIds(prev => prev.filter(id => id !== camp.id));
                              setCampDistToLastEnabled(prev => ({ ...prev, [camp.id]: false }));
                            }
                          }}
                          className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-gray-900 dark:text-white whitespace-nowrap">
                          {camp.name}
                        </span>
                      </label>

                      {/* Checkbox: Distance to last position */}
                      <label className={`flex items-center gap-1.5 cursor-pointer select-none text-[11px] ${!isVisible ? 'opacity-30 pointer-events-none' : ''}`}>
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
                        <span className="text-amber-800 dark:text-amber-300 font-semibold whitespace-nowrap">
                          المسافة لآخر موقع ({distToLast} km)
                        </span>
                      </label>
                    </div>
                  );
                })}

                {/* 2. Show / Hide Release Marker Checkbox */}
                <label className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-between gap-2 cursor-pointer select-none shadow-2xs hover:border-red-300 transition-colors">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showReleaseMarker}
                      onChange={(e) => setShowReleaseMarker(e.target.checked)}
                      className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-gray-900 dark:text-white">
                      علامة "موقع التركيب"
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 bg-gray-50 dark:bg-slate-700/60 px-1.5 py-0.5 rounded">
                    نقطة الإطلاق
                  </span>
                </label>

                {/* 3. Distance between Last Position & Release Location */}
                <label className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-between gap-2 cursor-pointer select-none shadow-2xs hover:border-red-300 transition-colors">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showDistanceToRelease}
                      onChange={(e) => setShowDistanceToRelease(e.target.checked)}
                      className="w-4 h-4 rounded text-red-600 focus:ring-red-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-gray-900 dark:text-white">
                      المسافة إلى موقع التركيب
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">
                    {metrics.distFromReleaseKm} km
                  </span>
                </label>

                {/* 4. Distance Between Camps Checkbox */}
                <label className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 flex items-center justify-between gap-2 cursor-pointer select-none shadow-2xs hover:border-emerald-300 transition-colors">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={showCampDistance}
                      onChange={(e) => setShowCampDistance(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-gray-900 dark:text-white">
                      المسافة بين المخيمات
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                    {campDistanceKm} km
                  </span>
                </label>
              </div>

              {/* 5. Compact Map Distance Measurement Tool */}
              <div className="px-3 py-1.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/60 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2">
                  <Ruler size={14} className="text-amber-600 dark:text-amber-400" />
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    أداة قياس المسافة على الخريطة:
                  </span>
                  {measurePoints.length > 1 && (
                    <span className="text-[11px] font-mono font-bold text-amber-800 dark:text-amber-200 bg-amber-200/80 dark:bg-amber-800/60 px-1.5 py-0.5 rounded">
                      {totalMeasureDistanceKm} km ({measurePoints.length} نقاط)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsMeasuring(!isMeasuring)}
                    className={`py-1 px-3 rounded-lg text-xs font-bold transition-all ${
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

            {/* Section C: Upload & Display QGIS Map (Logos & Legend managed directly on the report) */}
            <div className="bg-sky-50/70 dark:bg-sky-950/30 p-3.5 rounded-xl border border-sky-200 dark:border-sky-800/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-gradient-to-br from-sky-600 to-indigo-600 text-white rounded-lg shadow-2xs">
                    <Upload size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white block">
                      خريطة معدّلة في QGIS (PNG / JPG)
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      رفع وتثبيت صورة خريطة خارجية عالية الدقة تم تصميمها ببرنامج QGIS
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Upload button */}
                  <button
                    type="button"
                    onClick={() => mapImageInputRef.current?.click()}
                    className="py-1.5 px-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <Upload size={13} />
                    <span>رفع صورة خريطة QGIS جديدة</span>
                  </button>

                  {/* Display fit options */}
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-gray-200 dark:border-slate-700 text-[11px]">
                    <span className="px-1.5 text-gray-400 text-[10px] font-semibold">ملاءمة العرض:</span>
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

                  {mapSnapshotUrl && mapDisplayMode === 'snapshot' && (
                    <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded-lg text-xs">
                      <span className="text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1 text-[11px]">
                        <CheckCircle2 size={12} />
                        معروضة حالياً بالتقرير
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setMapDisplayMode('interactive');
                          setFitKey(k => k + 1);
                        }}
                        className="text-brand-600 hover:text-brand-700 font-bold text-[11px] underline"
                      >
                        العودة للتفاعلية
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Studio Section: Report Section Visibility */}
            <div className="bg-gray-50/80 dark:bg-slate-900/60 p-3 rounded-xl border border-gray-200 dark:border-slate-700 space-y-2">
              <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                <Eye size={14} className="text-brand-500" />
                <span>إظهار وإخفاء أقسام التقرير (100% Studio Section Visibility):</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-[11px] font-medium text-gray-700 dark:text-gray-300">
                <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={sectionVisibility.header}
                    onChange={(e) => setSectionVisibility(prev => ({ ...prev, header: e.target.checked }))}
                    className="rounded text-brand-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>رأس الصفحة والشعارات</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={sectionVisibility.birdDataCard}
                    onChange={(e) => setSectionVisibility(prev => ({ ...prev, birdDataCard: e.target.checked }))}
                    className="rounded text-brand-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>جدول بيانات الطائر</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={sectionVisibility.coordinatesCard}
                    onChange={(e) => setSectionVisibility(prev => ({ ...prev, coordinatesCard: e.target.checked }))}
                    className="rounded text-brand-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>جدول الإحداثيات</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={sectionVisibility.kpiCards}
                    onChange={(e) => setSectionVisibility(prev => ({ ...prev, kpiCards: e.target.checked }))}
                    className="rounded text-brand-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>بطاقات المؤشرات (KPIs)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={sectionVisibility.tempChart}
                    onChange={(e) => setSectionVisibility(prev => ({ ...prev, tempChart: e.target.checked }))}
                    className="rounded text-brand-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>منحنى درجات الحرارة (7 أيام)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={sectionVisibility.legend}
                    onChange={(e) => setSectionVisibility(prev => ({ ...prev, legend: e.target.checked }))}
                    className="rounded text-brand-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>مفتاح الخريطة (Legend)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={sectionVisibility.scaleBar}
                    onChange={(e) => setSectionVisibility(prev => ({ ...prev, scaleBar: e.target.checked }))}
                    className="rounded text-brand-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>مقياس الرسم (Scale Bar)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={sectionVisibility.northArrow}
                    onChange={(e) => setSectionVisibility(prev => ({ ...prev, northArrow: e.target.checked }))}
                    className="rounded text-brand-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>سهم الشمال (North Arrow)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer bg-white dark:bg-slate-800 p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={sectionVisibility.footer}
                    onChange={(e) => setSectionVisibility(prev => ({ ...prev, footer: e.target.checked }))}
                    className="rounded text-brand-600 w-3.5 h-3.5 cursor-pointer"
                  />
                  <span>تذييل الصفحة (Footer)</span>
                </label>
              </div>
            </div>

            {/* Studio Section: Theme Colors */}
            <div className="bg-gray-50/80 dark:bg-slate-900/60 p-3 rounded-xl border border-gray-200 dark:border-slate-700 space-y-2">
              <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                <Palette size={14} className="text-brand-500" />
                <span>ألوان عناصر التقرير والخريطة (Theme Colors):</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-gray-200 dark:border-slate-700">
                  <input
                    type="color"
                    value={themeColors.primaryMaroon}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, primaryMaroon: e.target.value }))}
                    className="w-7 h-7 rounded border border-gray-300 cursor-pointer"
                  />
                  <div>
                    <span className="block text-[11px] font-bold">اللون العنابي</span>
                    <span className="text-[10px] text-gray-400 font-mono">{themeColors.primaryMaroon}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-gray-200 dark:border-slate-700">
                  <input
                    type="color"
                    value={themeColors.latestGreen}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, latestGreen: e.target.value }))}
                    className="w-7 h-7 rounded border border-gray-300 cursor-pointer"
                  />
                  <div>
                    <span className="block text-[11px] font-bold">آخر موقع</span>
                    <span className="text-[10px] text-gray-400 font-mono">{themeColors.latestGreen}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-gray-200 dark:border-slate-700">
                  <input
                    type="color"
                    value={themeColors.trackLine}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, trackLine: e.target.value }))}
                    className="w-7 h-7 rounded border border-gray-300 cursor-pointer"
                  />
                  <div>
                    <span className="block text-[11px] font-bold">خط المسار</span>
                    <span className="text-[10px] text-gray-400 font-mono">{themeColors.trackLine}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-gray-200 dark:border-slate-700">
                  <input
                    type="color"
                    value={themeColors.campPin}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, campPin: e.target.value }))}
                    className="w-7 h-7 rounded border border-gray-300 cursor-pointer"
                  />
                  <div>
                    <span className="block text-[11px] font-bold">دبوس المخيم</span>
                    <span className="text-[10px] text-gray-400 font-mono">{themeColors.campPin}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-gray-200 dark:border-slate-700">
                  <input
                    type="color"
                    value={themeColors.releasePin}
                    onChange={(e) => setThemeColors(prev => ({ ...prev, releasePin: e.target.value }))}
                    className="w-7 h-7 rounded border border-gray-300 cursor-pointer"
                  />
                  <div>
                    <span className="block text-[11px] font-bold">دبوس الإطلاق</span>
                    <span className="text-[10px] text-gray-400 font-mono">{themeColors.releasePin}</span>
                  </div>
                </div>
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
          dir={reportLanguage === 'ar' ? 'rtl' : 'ltr'}
          style={{
            direction: reportLanguage === 'ar' ? 'rtl' : 'ltr',
            fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif",
            letterSpacing: 'normal'
          }}
        >

          {/* 1. REPORT HEADER (Pixel-faithful to reference design) */}
          {sectionVisibility.header && (
            <>
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
                <div className="no-export-snapshot no-print no-export absolute -bottom-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/85 backdrop-blur-xs text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-lg z-20">
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
                    className="logo-control-popover no-export-snapshot no-print no-export absolute top-full right-0 mt-2 bg-white dark:bg-slate-900 border border-brand-300 dark:border-brand-700 p-3 rounded-xl shadow-2xl w-64 text-right space-y-2.5 animate-in fade-in slide-in-from-top-2"
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
              <div className="no-export-snapshot no-print no-export absolute -bottom-2 left-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/85 backdrop-blur-xs text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-lg z-20">
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
                  className="logo-control-popover no-export-snapshot no-print no-export absolute top-full left-0 mt-2 bg-white dark:bg-slate-900 border border-brand-300 dark:border-brand-700 p-3 rounded-xl shadow-2xl w-64 text-right space-y-2.5 animate-in fade-in slide-in-from-top-2"
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
              {T.reportTitle}
            </h1>
          )}

          {/* Subtitle */}
          <p className="trk-sub">
            {T.transmitterLabel} <b>{displayTransmitterLabel}</b> • {isTableEditing ? (
              <span className="inline-flex items-center gap-1 mx-1">
                <input
                  type="text"
                  value={customMetadata.regionName}
                  onChange={(e) => setCustomMetadata({ ...customMetadata, regionName: e.target.value })}
                  className="text-xs font-semibold px-2 py-0.5 border border-amber-300 rounded bg-amber-50/50 text-gray-800"
                  placeholder={reportLanguage === 'ar' ? `${autoLocation.regionAr} – ${autoLocation.countryAr}` : `${autoLocation.regionEn} – ${autoLocation.countryEn}`}
                />
              </span>
            ) : (
              <span>
                {customMetadata.regionName 
                  ? (() => {
                      const res = resolveRegionBilingual(customMetadata.regionName, customMetadata.regionName);
                      const reg = reportLanguage === 'ar' ? res.regionAr : res.regionEn;
                      const cty = reportLanguage === 'ar' ? autoLocation.countryAr : autoLocation.countryEn;
                      return reportLanguage === 'ar'
                        ? `${T.regionLabel} ${reg} – ${cty}`
                        : `${reg} ${T.regionLabel} – ${cty}`;
                    })()
                  : (reportLanguage === 'ar' 
                      ? `${T.regionLabel} ${autoLocation.regionAr} – ${autoLocation.countryAr}`
                      : `${autoLocation.regionEn} ${T.regionLabel} – ${autoLocation.countryEn}`
                    )
                }
              </span>
            )} • {T.issueDateLabel} <b dir="ltr">{customMetadata.issueDate}</b>
          </p>
          </>
          )}

          {/* 2. MAIN REPORT BODY */}
          <div className="trk-grid" dir={reportLanguage === 'ar' ? 'rtl' : 'ltr'}>

            {/* ─── COLUMN 1 (RIGHT in RTL): SIDE PANEL (440px) ───── */}
            <aside className="trk-side" key={dragResetKey}>
              
              {/* TABLE 1: BIRD DATA (بيانات الطائر) */}
              {sectionVisibility.birdDataCard && (tableMode === 'standard' || tableMode === 'both') && (
                <section id="custom-bird-data-table" className={`trk-card ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1 relative' : ''}`}>
                  {isDragEnabled && (
                    <div className="drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print no-export">
                      <span className="flex items-center gap-1"><GripHorizontal size={12} /> اسحب لنقل جدول بيانات الطائر</span>
                      <span>⋮⋮</span>
                    </div>
                  )}

                  <div className="trk-card__head flex items-center justify-between">
                    <span>{T.birdData}</span>
                    {isTableEditing && (
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded text-white font-normal">
                        تعديل مباشر
                      </span>
                    )}
                  </div>

                  <div className="trk-row">
                    <span className="k">{T.txId}</span>
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
                    <span className="k">{T.ringId}</span>
                    <span className="v">
                      {isTableEditing ? (
                        <input
                          type="text"
                          value={customMetadata.birdRing}
                          onChange={(e) => setCustomMetadata({ ...customMetadata, birdRing: e.target.value })}
                          className="w-full text-center font-bold text-gray-800 text-[13px] border border-amber-300 rounded px-1.5 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        <span className="pill pill--grey">{translateValue(customMetadata.birdRing || 'NA')}</span>
                      )}
                    </span>
                  </div>

                  <div className="trk-row">
                    <span className="k">{T.species}</span>
                    <span className="v">
                      {isTableEditing ? (
                        <input
                          type="text"
                          value={customMetadata.species}
                          onChange={(e) => setCustomMetadata({ ...customMetadata, species: e.target.value })}
                          className="w-full text-center font-bold text-gray-800 text-[14px] border border-amber-300 rounded px-1.5 py-0.5 bg-amber-50/50"
                        />
                      ) : (
                        <span>{translateValue(customMetadata.species || 'وحش')}</span>
                      )}
                    </span>
                  </div>

                  <div className="trk-row">
                    <span className="k">{T.gender}</span>
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
                        <span>{translateValue(customMetadata.gender || 'ذكر')}</span>
                      )}
                    </span>
                  </div>

                  <div className="trk-row">
                    <span className="k">{T.status}</span>
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
                          {translateValue(customMetadata.birdStatus || 'حي')}
                        </span>
                      )}
                    </span>
                  </div>
                </section>
              )}

              {/* TABLE 2: MOVEMENT & COORDINATES COMPARISON TABLE */}
              {sectionVisibility.coordinatesCard && (tableMode === 'standard' || tableMode === 'both') && (
                <section id="custom-table2-coordinates" className={`trk-card trk-card--table ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1 relative' : ''}`}>
                  {isDragEnabled && (
                    <div className="drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print no-export">
                      <span className="flex items-center gap-1"><GripHorizontal size={12} /> اسحب لنقل جدول مقارنة الإحداثيات</span>
                      <span>⋮⋮</span>
                    </div>
                  )}

                  <div className="trk-twohead">
                    <div className="trk-twohead__install">{T.installHead}</div>
                    <div className="trk-twohead__last">{T.lastHead}</div>
                  </div>
                  <div className="trk-table">
                    <span className="lbl">{T.dateHeader}</span>
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

                    <span className="lbl">{T.latHeader}</span>
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

                    <span className="lbl">{T.lonHeader}</span>
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
                    <div className="drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print no-export">
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
              {sectionVisibility.kpiCards && (
                <div className={`trk-stats ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1 p-1 rounded-xl relative' : ''}`}>
                  {isDragEnabled && (
                    <div className="col-span-4 drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print no-export rounded-t-lg">
                      <span className="flex items-center gap-1"><GripHorizontal size={12} /> اسحب لنقل بطاقات المؤشرات</span>
                      <span>⋮⋮</span>
                    </div>
                  )}

                  {/* Card 1: Distance from Release (Rightmost in RTL) */}
                  <div className="trk-stat">
                    <div className="val red" dir="ltr">
                      {isTableEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={customMetadata.statDistFromRelease ?? ''}
                            onChange={(e) => setCustomMetadata({ ...customMetadata, statDistFromRelease: e.target.value })}
                            className="w-16 text-center border border-amber-300 rounded bg-amber-50/50 text-gray-800 font-bold"
                            placeholder={metrics.distFromReleaseKm.toString()}
                          />
                          <span>km</span>
                        </div>
                      ) : (
                        <>{customMetadata.statDistFromRelease || metrics.distFromReleaseKm} km</>
                      )}
                    </div>
                    <div className="lab">
                      {T.distFromRelease}
                    </div>
                  </div>

                  {/* Card 2: Bearing Direction & Degrees */}
                  <div className="trk-stat">
                    <div className="val">
                      {isTableEditing ? (
                        <input
                          type="text"
                          value={customMetadata.statDirection ?? ''}
                          onChange={(e) => setCustomMetadata({ ...customMetadata, statDirection: e.target.value })}
                          className="w-full text-center border border-amber-300 rounded bg-amber-50/50 text-gray-800 font-bold"
                          placeholder={metrics.bearingArabic.text}
                        />
                      ) : (
                        <>{customMetadata.statDirection ? translateDirection(customMetadata.statDirection, reportLanguage) : metrics.bearingArabic.text}</>
                      )}
                    </div>
                    <div className="lab">
                      {T.direction} (
                      {isTableEditing ? (
                        <input
                          type="text"
                          value={customMetadata.statDirectionDeg ?? ''}
                          onChange={(e) => setCustomMetadata({ ...customMetadata, statDirectionDeg: e.target.value })}
                          className="w-8 text-center border border-amber-300 rounded bg-amber-50/50 text-gray-800"
                          placeholder={metrics.bearingArabic.degrees.toString()}
                        />
                      ) : (
                        <>{customMetadata.statDirectionDeg || metrics.bearingArabic.degrees}</>
                      )}
                      °)
                    </div>
                  </div>

                  {/* Card 3: Distance from Camp */}
                  <div className="trk-stat">
                    <div className="val brown" dir="ltr">
                      {isTableEditing ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={customMetadata.statDistToCamp ?? ''}
                            onChange={(e) => setCustomMetadata({ ...customMetadata, statDistToCamp: e.target.value })}
                            className="w-16 text-center border border-amber-300 rounded bg-amber-50/50 text-gray-800 font-bold"
                            placeholder={metrics.distToCampKm.toString()}
                          />
                          <span>km</span>
                        </div>
                      ) : (
                        <>{customMetadata.statDistToCamp || metrics.distToCampKm} km</>
                      )}
                    </div>
                    <div className="lab">
                      {T.distToCamp}
                    </div>
                  </div>

                  {/* Card 4: Tracking Duration (Leftmost in RTL) */}
                  <div className="trk-stat">
                    <div className="val" dir={reportLanguage === 'ar' ? 'rtl' : 'ltr'}>
                      {isTableEditing ? (
                        <div className="flex items-center gap-1 justify-center">
                          <input
                            type="text"
                            value={customMetadata.statDuration ?? ''}
                            onChange={(e) => setCustomMetadata({ ...customMetadata, statDuration: e.target.value })}
                            className="w-12 text-center border border-amber-300 rounded bg-amber-50/50 text-gray-800 font-bold"
                            placeholder={metrics.durationDays.toString()}
                          />
                          <span>{T.days}</span>
                        </div>
                      ) : (
                        <span>{`${customMetadata.statDuration || metrics.durationDays} ${T.days}`}</span>
                      )}
                    </div>
                    <div className="lab">
                      {T.followUp}
                    </div>
                  </div>
                </div>
              )}

              {/* 7-Day Min/Max Temperature Chart */}
              {sectionVisibility.tempChart && (
                <SevenDayTempChart
                  lat={metrics.lLat}
                  lon={metrics.lLon}
                  language={reportLanguage}
                  isEditing={isTableEditing}
                />
              )}

            </aside>

            {/* ─── COLUMN 2 (LEFT in RTL): MAP WINDOW & LEGEND (1fr) ───── */}
            <div className="flex flex-col space-y-2.5" style={{ direction: 'ltr', minWidth: 0 }}>
              
              {/* Map Viewport Frame */}
              <div 
                ref={mapViewportRef}
                className="trk-map relative border border-[#d9dbe1] rounded-[10px] overflow-hidden bg-[#ece8de] h-[465px] shadow-xs flex items-center justify-center"
                style={{ direction: 'ltr', textAlign: 'left' }}
              >
                
                {/* 1. SCREENED PHOTO FROM LIVE TRACK OR UPLOADED QGIS MAP */}
                {mapDisplayMode === 'snapshot' && mapSnapshotUrl ? (
                  <div className="rpt-snapshot relative w-full h-full overflow-hidden bg-[#ece8de] flex items-center justify-center group">
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
                    <div className="rpt-toolbar no-export-snapshot no-print no-export absolute top-2 right-2 flex items-center gap-1.5 bg-black/80 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg text-xs shadow-lg opacity-85 hover:opacity-100 transition-opacity z-[1000]">
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
                        onClick={() => setMapImageFit(prev => prev === 'cover' ? 'contain' : 'cover')}
                        className="hover:text-sky-300 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-mono"
                        title="تبديل وضع ملاءمة العرض: Fill (تغطية) / Letterbox (احتواء)"
                      >
                        {mapImageFit === 'cover' ? 'Fit: Fill' : 'Fit: Letterbox'}
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
                  /* 2. CLEAN DYNAMIC MAP WITH APPLIED FILTERS (PER-BIRD INTERACTIVE MODE) */
                  <div className="relative w-full h-full">
                    {/* Quick Button to Upload QGIS Map right from the interactive map view */}
                    <div className="rpt-toolbar no-export-snapshot no-print no-export absolute top-2 left-2 z-[400] flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => mapImageInputRef.current?.click()}
                        className="px-2.5 py-1 bg-white/95 dark:bg-slate-800/95 hover:bg-white text-gray-800 dark:text-gray-200 rounded-md shadow-md border border-gray-300 dark:border-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all backdrop-blur-xs"
                        title="رفع خريطة PNG معدلة ببرنامج QGIS وتثبيتها مكان الخريطة التفاعلية"
                      >
                        <Upload size={12} className="text-sky-600" />
                        <span>رفع خريطة QGIS</span>
                      </button>
                      {mapSnapshotUrl && (
                        <button
                          type="button"
                          onClick={() => setMapDisplayMode('snapshot')}
                          className="px-2.5 py-1 bg-white/95 dark:bg-slate-800/95 hover:bg-white text-blue-800 dark:text-blue-300 rounded-md shadow-md border border-gray-300 dark:border-slate-600 text-xs font-bold flex items-center gap-1.5 transition-all backdrop-blur-xs"
                          title="عرض الصورة الملتقطة"
                        >
                          <Camera size={12} className="text-blue-600" />
                          <span>صورة ملتقطة</span>
                        </button>
                      )}
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
                      preferCanvas={true}
                      className={`w-full h-full ${isMeasuring ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
                      style={{ direction: 'ltr', width: '100%', height: '100%' }}
                    >
                      <MapInstanceBinder onMapInstance={setMapInstance} />
                      <MapGraticuleListener onUpdate={setGraticuleData} />

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

                      {/* Dynamic GIS Graphic Scale Bar (Matching Model 25km Two-Segment Bar) */}
                      {sectionVisibility.scaleBar && <CustomGraphicScaleControl />}

                      {/* Real History Flight Trajectory */}
                      {showFlightTrack && allHistoryPoints.length > 1 && (
                        <Polyline
                          positions={allHistoryPoints}
                          pathOptions={{
                            color: themeColors.trackLine,
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
                        const pillPos: [number, number] = customCampDistPositions[campId] || [midLat, midLon];

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
                              position={pillPos}
                              icon={createDistancePillIcon(`${distKm} km`, '#d97706')}
                              zIndexOffset={1600}
                              interactive={true}
                              draggable={true}
                              eventHandlers={{
                                dragend: (e) => {
                                  const marker = e.target;
                                  if (marker && marker.getLatLng) {
                                    const latLng = marker.getLatLng();
                                    setCustomCampDistPositions(prev => ({
                                      ...prev,
                                      [campId]: [latLng.lat, latLng.lng]
                                    }));
                                  }
                                }
                              }}
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
                              color: themeColors.trackLine,
                              weight: 2.5,
                              dashArray: '6, 6',
                              opacity: 0.95
                            }}
                          />
                          <Marker
                            position={customReleaseDistPos || metrics.releaseToLastMid}
                            icon={createDistancePillIcon(
                              `${metrics.distFromReleaseKm} km`, 
                              themeColors.trackLine,
                              [Math.max(70, `${metrics.distFromReleaseKm} km`.length * 7.5 + 16) + 16, 12]
                            )}
                            zIndexOffset={1500}
                            interactive={true}
                            draggable={true}
                            eventHandlers={{
                              dragend: (e) => {
                                const marker = e.target;
                                if (marker && marker.getLatLng) {
                                  const latLng = marker.getLatLng();
                                  setCustomReleaseDistPos([latLng.lat, latLng.lng]);
                                }
                              }
                            }}
                          />
                        </>
                      )}

                      {/* Release Location Marker (Requested Filter) */}
                      {showReleaseMarker && metrics.rLat !== 0 && metrics.rLon !== 0 && (
                        <>
                          <Marker
                            position={[metrics.rLat, metrics.rLon]}
                            icon={createLiveTrackingPinIcon(themeColors.releasePin)}
                            zIndexOffset={1800}
                            interactive={false}
                          />
                          <Marker
                            position={customReleaseMarkerPos || [metrics.rLat, metrics.rLon]}
                            icon={createLiveTrackingLabelIcon({
                              number: displayTransmitterLabel,
                              ringId: customMetadata.birdRing,
                              borderColorHex: themeColors.releasePin,
                              labelTitle: reportLanguage === 'en' ? 'Release' : T.installHead,
                              position: 'right'
                            })}
                            zIndexOffset={1801}
                            draggable={true}
                            eventHandlers={{
                              dragend: (e) => {
                                const marker = e.target;
                                if (marker && marker.getLatLng) {
                                  const latLng = marker.getLatLng();
                                  setCustomReleaseMarkerPos([latLng.lat, latLng.lng]);
                                }
                              }
                            }}
                          />
                        </>
                      )}

                      {/* Current/Latest Active Transmitter Marker (With Ring fallback if NA) */}
                      {metrics.lLat !== 0 && metrics.lLon !== 0 && (
                        <>
                          <Marker
                            position={[metrics.lLat, metrics.lLon]}
                            icon={createLiveTrackingPinIcon(themeColors.latestGreen)}
                            zIndexOffset={2000}
                            interactive={false}
                          />
                          <Marker
                            position={customLastPosMarkerPos || [metrics.lLat, metrics.lLon]}
                            icon={createLiveTrackingLabelIcon({
                              number: displayTransmitterLabel,
                              ringId: customMetadata.birdRing,
                              borderColorHex: themeColors.latestGreen,
                              labelTitle: reportLanguage === 'en' ? 'Latest Location' : T.lastHead,
                              position: 'top'
                            })}
                            zIndexOffset={2001}
                            draggable={true}
                            eventHandlers={{
                              dragend: (e) => {
                                const marker = e.target;
                                if (marker && marker.getLatLng) {
                                  const latLng = marker.getLatLng();
                                  setCustomLastPosMarkerPos([latLng.lat, latLng.lng]);
                                }
                              }
                            }}
                          />
                        </>
                      )}

                      {/* Field Camps - Filtered one by one (Requested Filter) */}
                      {FIXED_FIELD_CAMPS.filter(camp => visibleCampIds.includes(camp.id)).map(camp => {
                        const labelPos: [number, number] = customCampLabelPositions[camp.id] || [camp.lat, camp.lon];
                        return (
                          <React.Fragment key={camp.id}>
                            <Marker
                              position={[camp.lat, camp.lon]}
                              icon={createLiveTrackingCampPinIcon(themeColors.campPin)}
                              zIndexOffset={1000}
                              interactive={false}
                            />
                            <Marker
                              key={`camp-label-${camp.id}`}
                              position={labelPos}
                              icon={createLiveTrackingCampLabelIcon(translateValue(camp.name))}
                              zIndexOffset={1001}
                              draggable={true}
                              eventHandlers={{
                                dragend: (e) => {
                                  const marker = e.target;
                                  if (marker && marker.getLatLng) {
                                    const latLng = marker.getLatLng();
                                    setCustomCampLabelPositions(prev => ({
                                      ...prev,
                                      [camp.id]: [latLng.lat, latLng.lng]
                                    }));
                                  }
                                }
                              }}
                            />
                          </React.Fragment>
                        );
                      })}

                      {/* Custom Map Annotations */}
                      {annotations.map(ann => (
                        <Marker
                          key={ann.id}
                          position={[ann.lat, ann.lon]}
                          icon={createCustomAnnotationDivIcon(ann)}
                          zIndexOffset={1800}
                          interactive={true}
                          draggable={isDragEnabled}
                          eventHandlers={{
                            dragend: (e) => {
                              const marker = e.target;
                              if (marker && marker.getLatLng) {
                                const latLng = marker.getLatLng();
                                setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, lat: latLng.lat, lon: latLng.lng } : a));
                              }
                            }
                          }}
                        />
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
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] no-export-snapshot no-print no-export flex items-center gap-2 bg-slate-900/95 backdrop-blur text-white px-3.5 py-1.5 rounded-full shadow-2xl border border-slate-700 text-xs select-none animate-in fade-in slide-in-from-bottom-2"
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

                    {/* Floating Map Controls for Interactive Live Tracking feel (Hidden on Print & Export) */}
                    <div 
                      className="no-print no-export-snapshot no-export absolute bottom-2 left-2 z-[1000] flex items-center gap-1 bg-slate-900/85 backdrop-blur-md px-1.5 py-1 rounded-lg border border-white/20 shadow-lg text-white select-none"
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
                          handleRecenterMap();
                        }}
                        className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/20 rounded text-[11px] font-medium transition-colors text-white"
                        title="إعادة ضبط الموقع ليتناسب مع النقاط"
                      >
                        <Crosshair size={13} />
                        <span>توسيط</span>
                      </button>
                      {(customReleaseMarkerPos || customLastPosMarkerPos || customReleaseDistPos || Object.keys(customCampDistPositions).length > 0 || Object.keys(customCampLabelPositions).length > 0) && (
                        <>
                          <div className="w-px h-3.5 bg-white/25 mx-0.5" />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomCampLabelPositions({});
                              setCustomCampDistPositions({});
                              setCustomReleaseMarkerPos(null);
                              setCustomLastPosMarkerPos(null);
                              setCustomReleaseDistPos(null);
                            }}
                            className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/20 rounded text-[11px] font-medium transition-colors text-amber-300 hover:text-amber-200"
                            title={reportLanguage === 'en' ? 'Reset dragged label positions' : 'إعادة ضبط مواضع التسميات المسحوبة'}
                          >
                            <RotateCcw size={12} />
                            <span>{reportLanguage === 'en' ? 'Reset Labels' : 'إعادة التسميات'}</span>
                          </button>
                        </>
                      )}
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
                            onClick={(e) => e.stopPropagation()}
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
                        {/* Red Location Point & Transmitter ID Callout Badge */}
                        {(() => {
                          const pttLabel = displayTransmitterLabel || String(selectedPttId).replace(/^trans-/, '');
                          const labelW = Math.max(28, pttLabel.length * 5.2 + 6);
                          const labelH = 10;
                          const badgeX = Math.max(labelW / 2 + 2, Math.min(140 - labelW / 2 - 2, insetMapData.birdPoint.x));
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
                                fill="#881337" 
                              />

                              {/* Transmitter ID Badge */}
                              <rect 
                                x={badgeX - labelW / 2} 
                                y={badgeY} 
                                width={labelW} 
                                height={labelH} 
                                rx="2" 
                                fill="#ffffff" 
                                stroke="#881337" 
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
                                fill="#881337"
                              >
                                {pttLabel}
                              </text>

                              {/* Red GPS Point with halo */}
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
                      <div className="text-[10px] text-gray-500 font-bold">{insetMapData.countryNameAr || 'كازاخستان'}</div>
                    )}
                  </div>
                </div>

                {/* Top-Right: GIS North Arrow Symbol */}
                {sectionVisibility.northArrow && (
                  <div className="absolute top-2.5 right-3 z-[1000] flex flex-col items-center pointer-events-none drop-shadow">
                    <svg width="18" height="26" viewBox="0 0 20 30" fill="none">
                      <polygon points="10,0 0,26 10,20" fill="#ffffff" stroke="#000000" strokeWidth="1" />
                      <polygon points="10,0 20,26 10,20" fill="#111827" stroke="#000000" strokeWidth="1" />
                    </svg>
                    <span className="text-[11px] font-black text-white font-mono leading-none mt-0.5">N</span>
                  </div>
                )}

                {/* Dynamic GIS Graticule Grid Lines & Perimeter Coordinate Labels (Move smoothly with map pan/zoom) */}
                {showGraticule && mapDisplayMode !== 'snapshot' && (
                  <>
                    {/* Graticule Grid Lines (Thin, elegant, semi-transparent dashed lines across map) */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-[450]" style={{ display: 'block' }}>
                      {/* Horizontal Latitude Lines */}
                      {graticuleData.latLines.map(l => (
                        <line
                          key={`grat-line-lat-${l.lat}`}
                          x1="0"
                          y1={l.y}
                          x2="100%"
                          y2={l.y}
                          stroke="rgba(255, 255, 255, 0.4)"
                          strokeWidth="1"
                          strokeDasharray="4 6"
                        />
                      ))}
                      {/* Vertical Longitude Lines */}
                      {graticuleData.lonLines.map(l => (
                        <line
                          key={`grat-line-lon-${l.lon}`}
                          x1={l.x}
                          y1="0"
                          x2={l.x}
                          y2="100%"
                          stroke="rgba(255, 255, 255, 0.4)"
                          strokeWidth="1"
                          strokeDasharray="4 6"
                        />
                      ))}
                    </svg>

                    {/* Top Longitude Labels (Follow vertical meridian lines across the top frame) */}
                    {graticuleData.lonLines.length > 0 ? (
                      graticuleData.lonLines.map(l => {
                        // Prevent overlap with top-left locator map (w=138px + margin = 145px) and top-right north arrow
                        if (l.x < 145 || l.x > (graticuleData.width || 750) - 45) return null;
                        return (
                          <div
                            key={`grat-lbl-lon-${l.lon}`}
                            className="absolute top-1 z-[900] pointer-events-none select-none transition-none"
                            style={{ left: `${l.x - 40}px` }}
                          >
                            <svg width="80" height="16" viewBox="0 0 80 16" style={{ display: 'block' }}>
                              <rect x="0" y="0" width="80" height="16" rx="4" fill="rgba(0, 0, 0, 0.65)" />
                              <text x="40" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8" fontWeight="bold" fontFamily="monospace">
                                {l.label}
                              </text>
                            </svg>
                          </div>
                        );
                      })
                    ) : (
                      <div className="absolute top-1 left-38 z-[900] pointer-events-none select-none">
                        <svg width="80" height="16" viewBox="0 0 80 16" style={{ display: 'block' }}>
                          <rect x="0" y="0" width="80" height="16" rx="4" fill="rgba(0, 0, 0, 0.65)" />
                          <text x="40" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8" fontWeight="bold" fontFamily="monospace">
                            {graticuleLonLabel}
                          </text>
                        </svg>
                      </div>
                    )}

                    {/* Left Latitude Labels (Follow horizontal parallel lines down the left frame) */}
                    {graticuleData.latLines.length > 0 ? (
                      graticuleData.latLines.map(l => {
                        // Prevent labels from clipping off top or bottom frame
                        if (l.y < 22 || l.y > (graticuleData.height || 465) - 22) return null;
                        return (
                          <div
                            key={`grat-lbl-lat-${l.lat}`}
                            className="absolute left-1 z-[900] pointer-events-none select-none transition-none"
                            style={{ top: `${l.y - 8}px` }}
                          >
                            <svg width="74" height="16" viewBox="0 0 74 16" style={{ display: 'block' }}>
                              <rect x="0" y="0" width="74" height="16" rx="4" fill="rgba(0, 0, 0, 0.65)" />
                              <text x="37" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                                {l.label}
                              </text>
                            </svg>
                          </div>
                        );
                      })
                    ) : (
                      <>
                        <div className="absolute top-1/2 -translate-y-1/2 left-1 z-[900] pointer-events-none select-none">
                          <svg width="74" height="16" viewBox="0 0 74 16" style={{ display: 'block' }}>
                            <rect x="0" y="0" width="74" height="16" rx="4" fill="rgba(0, 0, 0, 0.65)" />
                            <text x="37" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                              {metrics.lLat ? `${Math.floor(metrics.lLat)}° 00.0000'N` : "47° 00.0000'N"}
                            </text>
                          </svg>
                        </div>
                        <div className="absolute bottom-10 left-1 z-[900] pointer-events-none select-none">
                          <svg width="74" height="16" viewBox="0 0 74 16" style={{ display: 'block' }}>
                            <rect x="0" y="0" width="74" height="16" rx="4" fill="rgba(0, 0, 0, 0.65)" />
                            <text x="37" y="8.5" textAnchor="middle" dy="0.3em" fill="#ffffff" fontSize="8.5" fontWeight="bold" fontFamily="monospace">
                              {metrics.lLat ? `${Math.floor(metrics.lLat) - 1}° 45.0000'N` : "46° 45.0000'N"}
                            </text>
                          </svg>
                        </div>
                      </>
                    )}
                  </>
                )}

              </div>

              {/* Map Legend Bar */}
              {sectionVisibility.legend && (
                <div 
                  id="custom-map-legend-bar"
                className="trk-legend relative group select-none transition-all"
                style={{ direction: reportLanguage === 'ar' ? 'rtl' : 'ltr', margin: '4px 0 0 0', width: '100%' }}
              >
                {/* Hover Quick Edit Button (when not in table edit mode) */}
                {!isTableEditing && (
                  <div className="no-export-snapshot no-print no-export absolute -top-3 left-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
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
                  <div className="no-export-snapshot no-print no-export mb-2 pb-1.5 border-b border-gray-200 flex items-center justify-between text-xs w-full">
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
                  <div 
                    className="trk-legend flex flex-row items-center flex-wrap gap-x-4 gap-y-1.5 w-full px-2 py-0.5 text-[11px] font-bold text-gray-800"
                    style={{ direction: reportLanguage === 'ar' ? 'rtl' : 'ltr', minWidth: 0 }}
                  >
                    {legendItems.filter(item => item.visible).map(item => {
                      let lbl = item.label;
                      if (reportLanguage === 'en') {
                        if (lbl === 'طريق رئيسي' || item.id === 'main_road') lbl = 'Main Road';
                        else if (lbl === 'المسافة إلى المخيم' || lbl === 'البعد عنه' || item.id === 'camp_dist') lbl = 'Distance to Camp';
                        else if (lbl === 'مخيم' || lbl === 'المخيم' || item.id === 'camps') lbl = 'Camp';
                        else if (lbl.includes('آخر موقع') || item.id === 'last_pos') lbl = 'Latest Location';
                        else if (lbl === 'موقع تركيب الجهاز' || item.id === 'release_pos') lbl = 'Release Location';
                        else lbl = translateValue(lbl);
                      } else {
                        if (lbl === 'Main Road' || item.id === 'main_road') lbl = 'طريق رئيسي';
                        else if (lbl === 'Distance to Camp' || item.id === 'camp_dist') lbl = 'المسافة إلى المخيم';
                        else if (lbl === 'Camp' || item.id === 'camps') lbl = 'مخيم';
                        else if (lbl === 'Latest Location' || item.id === 'last_pos') lbl = 'آخر موقع';
                        else if (lbl === 'Release Location' || item.id === 'release_pos') lbl = 'موقع تركيب الجهاز';
                      }

                      return (
                        <div key={item.id} className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
                          {renderLegendSymbol(item.symbol, item.color)}
                          <span>{lbl}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              )}

            </div>

          </div>

          {/* 3. REPORT FOOTER (MODIFIABLE AND PERSONALIZED) */}
          {sectionVisibility.footer && showFooter && (
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
          )}

        </div>

      </div>

      {/* Telegram & WhatsApp Bot Bridge Modal */}
      <BotReportBridgeModal
        isOpen={isBotModalOpen}
        onClose={() => setIsBotModalOpen(false)}
        onApplyCommand={handleApplyBotCommand}
        onGeneratePdfBlob={handleGeneratePdfBlob}
      />

    </div>
  );
};
