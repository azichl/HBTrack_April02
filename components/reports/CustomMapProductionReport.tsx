import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Download, RefreshCw, Compass, MapPin, 
  Calendar, ChevronDown, Check, Search, SlidersHorizontal, 
  Layers, Info, FileDown, CheckCircle2,
  Plus, Minus, Crosshair, Maximize2, Minimize2,
  Edit3, Trash2, History, Camera, Image as ImageIcon, Sparkles,
  Move, RotateCcw, GripHorizontal, Eye, EyeOff, Ruler, Building2
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
  getProductionTileLayer
} from './QGISMapProductionReport';

// ─── LEAFLET ICONS ────────────────────────────────────────────────────────────

const createLiveTrackingMarkerIcon = ({
  number,
  ringId,
  pinColorHex,
  borderColorHex,
  labelTitle
}: {
  number: string;
  ringId?: string;
  pinColorHex: string;
  borderColorHex: string;
  labelTitle?: string;
}) => {
  const rawId = String(number || '').trim().replace(/^trans-/, '');
  const isNA = !rawId || rawId.toUpperCase() === 'NA' || rawId.toUpperCase() === 'N/A' || rawId.toUpperCase() === 'NONE';
  const cleanId = isNA ? (String(ringId || 'NA').trim() || 'NA') : rawId;
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
          <text 
            x="${totalW / 2}" 
            y="12" 
            text-anchor="middle" 
            dominant-baseline="middle"
            font-family="'Segoe UI', Tahoma, Geneva, Verdana, 'Noto Kufi Arabic', sans-serif" 
            font-size="11" 
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
          font-family="monospace, 'Segoe UI', Arial" 
          font-size="11.5" 
          font-weight="800" 
          fill="#0f172a"
        >
          ${cleanId}
        </text>
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

const createLiveTrackingCampIcon = (campName: string) => {
  const totalW = 140;
  const totalH = 54;
  const badgeSize = 30;

  return L.divIcon({
    className: 'bg-transparent',
    html: `
      <svg width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible; pointer-events: none; display: block;">
        <text 
          x="${totalW / 2}" 
          y="12" 
          text-anchor="middle" 
          dominant-baseline="middle"
          font-family="'Segoe UI', Tahoma, Geneva, Verdana, 'Noto Kufi Arabic', sans-serif" 
          font-size="11.5" 
          font-weight="800" 
          fill="#ffffff" 
          stroke="#000000" 
          stroke-width="2.6" 
          stroke-linejoin="round" 
          paint-order="stroke fill"
        >
          ${campName}
        </text>
        <g transform="translate(${(totalW - badgeSize) / 2}, 20)">
          <circle cx="${badgeSize / 2}" cy="${badgeSize / 2}" r="${badgeSize / 2 - 1}" fill="#10b981" stroke="#ffffff" stroke-width="2"/>
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

const createDistancePillIcon = (
  text: string, 
  borderColor: string, 
  anchorOffset: [number, number] = [37, 12]
) => {
  const pillW = Math.max(74, text.length * 8 + 14);
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
  className: 'bg-transparent',
  html: `<div style="width: 12px; height: 12px; background-color: #ffffff; border-radius: 9999px; border: 2.5px solid #f59e0b; box-shadow: 0 1px 4px rgba(0,0,0,0.5);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const measureEndIcon = L.divIcon({
  className: 'bg-transparent',
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
    footerRight: 'المركز القطري لتكاثر الحبارى والصقور – كازاخستان',
    footerLeft: 'HBTrack Custom Map Report • Live Tracking View'
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
      releaseToLastMid: [
        (rLat + lLat) / 2,
        (rLon + lLon) / 2
      ] as [number, number]
    };
  }, [telemetryData, activeCamp]);

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

  // Re-capture current interactive map view as snapshot photo
  // IMPORTANT: Hide any "التقاط كصورة" button or controls so it NEVER appears in the snapshot!
  const handleCaptureInteractiveMap = async () => {
    if (!mapViewportRef.current) return;
    const snapBtn = document.getElementById('custom-map-quick-snap-btn');
    if (snapBtn) snapBtn.style.display = 'none';

    try {
      const canvas = await html2canvas(mapViewportRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        ignoreElements: (el: Element) => {
          return el.id === 'custom-map-quick-snap-btn' ||
                 el.classList?.contains('no-export-snapshot') ||
                 el.classList?.contains('no-print') ||
                 el.classList?.contains('leaflet-control-zoom') ||
                 el.classList?.contains('leaflet-control-attribution');
        }
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setMapSnapshotUrl(dataUrl);
      setMapDisplayMode('snapshot');
    } catch (e) {
      console.warn('Could not capture map view:', e);
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
      await new Promise(r => setTimeout(r, 400));
      const element = reportContainerRef.current;
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2.5,
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
          el.classList?.contains('leaflet-control-attribution')
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
      pdf.save(`Custom_Report_${displayTransmitterLabel}_${customMetadata.issueDate}.pdf`);
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
      await new Promise(r => setTimeout(r, 400));
      const element = reportContainerRef.current;
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2.5,
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
          el.classList?.contains('leaflet-control-attribution')
      });

      const link = document.createElement('a');
      link.download = `Custom_Report_${displayTransmitterLabel}_${customMetadata.issueDate}.png`;
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
      
      {/* ─── PRINT STYLES ─────────────────────────────────────────────────── */}
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
          className="bg-white text-gray-900 w-[1080px] min-w-[1080px] p-7 shadow-2xl rounded-sm border border-gray-300 relative select-none"
          style={{
            direction: 'ltr',
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, 'Noto Kufi Arabic', sans-serif",
            letterSpacing: 'normal'
          }}
        >

          {/* 1. REPORT HEADER */}
          <div className="flex items-center justify-between pb-3.5 border-b border-gray-200 mb-4" style={{ direction: 'ltr' }}>
            
            {/* Top-Left Header Logo */}
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

            {/* Center Header: Title & Subtitle */}
            <div className="text-center flex-1 px-2" style={{ direction: 'rtl' }}>
              {isTableEditing ? (
                <input
                  type="text"
                  value={customMetadata.reportTitle}
                  onChange={(e) => setCustomMetadata({ ...customMetadata, reportTitle: e.target.value })}
                  className="w-full text-center text-[21px] font-black text-gray-900 border border-amber-300 rounded px-2 py-0.5 bg-amber-50/40 mb-1"
                />
              ) : (
                <h1 
                  className="text-[21px] font-black text-gray-900 leading-tight mb-1"
                  style={{ letterSpacing: 'normal', fontFeatureSettings: '"liga" 1' }}
                >
                  {customMetadata.reportTitle || 'تقرير متابعة طائر حبارى مزود بجهاز تتبع'}
                </h1>
              )}

              <div className="text-[12.5px] font-bold text-gray-700 flex items-center justify-center gap-2">
                <span>
                  {isPttNA ? 'رقم الحجل ' : 'جهاز التتبع '}
                  <span className="font-mono text-[#701a2b] font-black">
                    {displayTransmitterLabel}
                  </span>
                </span>
                <span>•</span>
                <span>منطقة {activeCamp.name.replace('مخيم ', '')} – {customMetadata.regionName || 'كازاخستان'}</span>
                <span>•</span>
                <span>تاريخ الإصدار {formatDateDDMMYYYY(customMetadata.issueDate) || customMetadata.issueDate}</span>
              </div>
            </div>

            {/* Top-Right Header Logo */}
            <div className="flex items-center justify-end w-[350px]">
              <img 
                src="/external-reserves-office-logo.png" 
                alt="مكتب محميات الدولة الخارجية" 
                className="h-[48px] w-auto max-w-[270px] object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>

          </div>

          {/* 2. MAIN REPORT BODY */}
          <div className="flex gap-4 items-start" style={{ direction: 'ltr' }}>
            
            {/* ─── COLUMN 1 (LEFT): MAP WINDOW (approx 58% width) ───── */}
            <div className="w-[58%] flex flex-col space-y-2" style={{ direction: 'ltr' }}>
              
              {/* Map Viewport Frame */}
              <div 
                ref={mapViewportRef}
                className="relative border-2 border-gray-800 rounded-sm overflow-hidden bg-stone-900 h-[435px] shadow-sm flex items-center justify-center"
                style={{ direction: 'ltr', textAlign: 'left' }}
              >
                
                {/* 1. SCREENED PHOTO FROM LIVE TRACK */}
                {mapDisplayMode === 'snapshot' && mapSnapshotUrl ? (
                  <div className="relative w-full h-full overflow-hidden bg-slate-900 flex items-center justify-center">
                    <img 
                      src={mapSnapshotUrl} 
                      alt="منظور التتبع المباشر" 
                      className="w-full h-full object-cover select-none pointer-events-none"
                      style={{ display: 'block', width: '100%', height: '100%' }}
                    />
                  </div>
                ) : (
                  /* 2. CLEAN DYNAMIC MAP WITH APPLIED FILTERS */
                  <div className="relative w-full h-full">
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
                            interactive={false}
                          />
                        </>
                      )}

                      {/* Release Location Marker (Requested Filter) */}
                      {showReleaseMarker && metrics.rLat !== 0 && metrics.rLon !== 0 && (
                        <Marker
                          position={[metrics.rLat, metrics.rLon]}
                          icon={createLiveTrackingMarkerIcon({
                            number: displayTransmitterLabel,
                            ringId: customMetadata.birdRing,
                            pinColorHex: '#701a2b',
                            borderColorHex: '#701a2b',
                            labelTitle: 'موقع التركيب'
                          })}
                          zIndexOffset={1800}
                        />
                      )}

                      {/* Current/Latest Active Transmitter Marker (With Ring fallback if NA) */}
                      {metrics.lLat !== 0 && metrics.lLon !== 0 && (
                        <Marker
                          position={[metrics.lLat, metrics.lLon]}
                          icon={createLiveTrackingMarkerIcon({
                            number: displayTransmitterLabel,
                            ringId: customMetadata.birdRing,
                            pinColorHex: '#22c55e',
                            borderColorHex: '#22c55e'
                          })}
                          zIndexOffset={2000}
                        />
                      )}

                      {/* Field Camps - Filtered one by one (Requested Filter) */}
                      {FIXED_FIELD_CAMPS.filter(camp => visibleCampIds.includes(camp.id)).map(camp => (
                        <Marker
                          key={camp.id}
                          position={[camp.lat, camp.lon]}
                          icon={createLiveTrackingCampIcon(camp.name)}
                          zIndexOffset={1000}
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
                              interactive={false}
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

                    {/* Quick Floating Ruler Activation Button in Map Top-Left */}
                    <div className="absolute top-2.5 left-2.5 z-[1000] no-export-snapshot no-print flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIsMeasuring(!isMeasuring)}
                        className={`p-1.5 rounded-lg shadow-md transition-all flex items-center gap-1 text-[11px] font-bold ${
                          isMeasuring 
                            ? 'bg-amber-500 text-white ring-2 ring-amber-300 shadow-amber-500/20' 
                            : 'bg-white/95 text-gray-700 hover:bg-gray-100 hover:text-amber-600 border border-gray-200'
                        }`}
                        title="أداة قياس المسافة على الخريطة"
                      >
                        <Ruler size={14} className={isMeasuring ? 'animate-pulse' : ''} />
                        <span>{isMeasuring ? 'إنهاء القياس' : 'مسطرة'}</span>
                      </button>
                    </div>

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

                    {/* North Arrow Symbol */}
                    <div className="absolute top-2.5 right-3 z-[1000] flex flex-col items-center pointer-events-none drop-shadow">
                      <svg width="18" height="26" viewBox="0 0 20 30" fill="none">
                        <polygon points="10,0 0,26 10,20" fill="#ffffff" stroke="#000000" strokeWidth="1" />
                        <polygon points="10,0 20,26 10,20" fill="#111827" stroke="#000000" strokeWidth="1" />
                      </svg>
                      <span className="text-[11px] font-black text-white font-mono leading-none mt-0.5">N</span>
                    </div>

                  </div>
                )}

              </div>

              {/* Map Legend Bar */}
              <div 
                className="border border-gray-300 rounded-sm bg-white py-1.5 px-3 shadow-xs select-none"
                style={{ direction: 'rtl' }}
              >
                <table id="custom-map-legend-bar" style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl', margin: 0, padding: 0 }}>
                  <tbody>
                    <tr>
                      {/* 1. آخر موقع تم رصده */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 5px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                            <circle cx="5" cy="5" r="4.2" fill="#22c55e" stroke="#ffffff" strokeWidth="1" />
                          </svg>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap' }}>
                            آخر موقع ({telemetryData.lastGpsPos.dateStr})
                          </span>
                        </div>
                      </td>

                      {/* 2. موقع التركيب (إذا كان مفعلاً) */}
                      {showReleaseMarker && (
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 5px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                            <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                              <circle cx="5" cy="5" r="4.2" fill="#701a2b" stroke="#ffffff" strokeWidth="1" />
                            </svg>
                            <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap' }}>
                              موقع التركيب
                            </span>
                          </div>
                        </td>
                      )}

                      {/* 3. مسار الهجرة */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 5px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <svg width="18" height="10" viewBox="0 0 18 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                            <line x1="0" y1="5" x2="18" y2="5" stroke="#6366f1" strokeWidth="2.5" />
                          </svg>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap' }}>
                            مسار الرحلة
                          </span>
                        </div>
                      </td>

                      {/* 4. مخيمات الميدان (إذا كانت مفعلة) */}
                      {visibleCampIds.length > 0 && (
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 5px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                              <path d="M19 20 10 4 1 20h18Z" fill="#10b981" fillOpacity="0.35"/>
                              <path d="M10 4 23 20"/>
                              <path d="m10 4 4.5 16"/>
                            </svg>
                            <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap' }}>
                              مخيمات الميدان ({visibleCampIds.length})
                            </span>
                          </div>
                        </td>
                      )}

                      {/* 5. المسافة بين المخيمات */}
                      {showCampDistance && visibleCampIds.length >= 2 && (
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 5px' }}>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10px', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                            بين المخيمات: {campDistanceKm} km
                          </span>
                        </td>
                      )}

                      {/* 6. خط قياس المسافة المرسوم (إن وجد) */}
                      {measurePoints.length > 1 && (
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 5px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', verticalAlign: 'middle', height: '18px' }}>
                            <svg width="14" height="8" viewBox="0 0 14 8">
                              <line x1="0" y1="4" x2="14" y2="4" stroke="#eab308" strokeWidth="2.5" strokeDasharray="3,2" />
                            </svg>
                            <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10px', fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>
                              مسافة مقاسة: {totalMeasureDistanceKm} km
                            </span>
                          </div>
                        </td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>

            {/* ─── COLUMN 2 (RIGHT): CHANGEABLE DATA TABLES (approx 42% width) ── */}
            <div className="w-[42%] flex flex-col space-y-3" style={{ direction: 'rtl' }} key={dragResetKey}>
              
              {/* TABLE 1: BIRD DATA (بيانات الطائر) */}
              {(tableMode === 'standard' || tableMode === 'both') && (
                <div className={`border border-gray-300 rounded-sm overflow-hidden shadow-xs relative ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1' : ''}`}>
                  {isDragEnabled && (
                    <div className="drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print">
                      <span className="flex items-center gap-1"><GripHorizontal size={12} /> اسحب لنقل جدول بيانات الطائر</span>
                      <span>⋮⋮</span>
                    </div>
                  )}

                  <div 
                    className="w-full bg-[#701a2b] text-white py-1.5 px-3 text-center text-[13.5px] font-bold flex items-center justify-between"
                    style={{ lineHeight: '22px' }}
                  >
                    <span className="flex-1 text-center font-bold">بيانات الطائر</span>
                    {isTableEditing && (
                      <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white font-normal">
                        تعديل مباشر
                      </span>
                    )}
                  </div>
                  <table id="custom-bird-data-table" className="w-full text-[12px] text-center border-collapse">
                    <tbody>
                      <tr className="border-b border-gray-200 bg-white">
                        <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-center">
                          رقم جهاز التتبع
                        </td>
                        <td className="py-1.5 px-3 text-center w-1/2 border-r border-gray-200">
                          {isTableEditing ? (
                            <input
                              type="text"
                              value={selectedPttId}
                              onChange={(e) => setSelectedPttId(e.target.value)}
                              className="w-full text-center font-mono font-black text-[#701a2b] text-[13px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            />
                          ) : (
                            <span className="font-mono font-black text-[#701a2b] text-[13px]">
                              {displayTransmitterLabel}
                              {isPttNA && <span className="text-[10px] text-gray-400 font-sans mr-1">(حجل)</span>}
                            </span>
                          )}
                        </td>
                      </tr>

                      <tr className="border-b border-gray-200 bg-white">
                        <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-center">
                          رقم الحجل
                        </td>
                        <td className="py-1.5 px-3 text-center w-1/2 border-r border-gray-200">
                          {isTableEditing ? (
                            <input
                              type="text"
                              value={customMetadata.birdRing}
                              onChange={(e) => setCustomMetadata({ ...customMetadata, birdRing: e.target.value })}
                              className="w-full text-center font-mono font-bold text-gray-800 text-[12px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            />
                          ) : (
                            <div className="inline-block px-3 py-0.5 bg-gray-100 rounded-full font-mono font-bold text-gray-700 text-[11.5px]">
                              {customMetadata.birdRing || 'NA'}
                            </div>
                          )}
                        </td>
                      </tr>

                      <tr className="border-b border-gray-200 bg-white">
                        <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-center">
                          النوعية
                        </td>
                        <td className="py-1.5 px-3 font-semibold text-gray-800 text-center w-1/2 border-r border-gray-200">
                          {isTableEditing ? (
                            <input
                              type="text"
                              value={customMetadata.species}
                              onChange={(e) => setCustomMetadata({ ...customMetadata, species: e.target.value })}
                              className="w-full text-center font-semibold text-gray-800 text-[12px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            />
                          ) : (
                            <span>{customMetadata.species || 'وحش'}</span>
                          )}
                        </td>
                      </tr>

                      <tr className="border-b border-gray-200 bg-white">
                        <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-center">
                          الجنس
                        </td>
                        <td className="py-1.5 px-3 font-semibold text-gray-800 text-center w-1/2 border-r border-gray-200">
                          {isTableEditing ? (
                            <select
                              value={customMetadata.gender}
                              onChange={(e) => setCustomMetadata({ ...customMetadata, gender: e.target.value })}
                              className="w-full text-center font-semibold text-gray-800 text-[12px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            >
                              <option value="ذكر">ذكر</option>
                              <option value="أنثى">أنثى</option>
                              <option value="غير محدد">غير محدد</option>
                            </select>
                          ) : (
                            <span>{customMetadata.gender || 'ذكر'}</span>
                          )}
                        </td>
                      </tr>

                      <tr className="bg-white">
                        <td className="py-1.5 px-3 font-bold text-gray-700 w-1/2 bg-gray-50/70 text-center">
                          حالة الطائر
                        </td>
                        <td className="py-1.5 px-3 text-center w-1/2 border-r border-gray-200">
                          {isTableEditing ? (
                            <input
                              type="text"
                              value={customMetadata.birdStatus}
                              onChange={(e) => setCustomMetadata({ ...customMetadata, birdStatus: e.target.value })}
                              className="w-full text-center font-bold text-emerald-700 text-[12px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            />
                          ) : (
                            <div className="inline-block px-3 py-0.5 bg-emerald-50 rounded-full font-bold text-emerald-700 text-[11.5px]">
                              {customMetadata.birdStatus || 'حي'}
                            </div>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* TABLE 2: MOVEMENT & COORDINATES COMPARISON TABLE */}
              {(tableMode === 'standard' || tableMode === 'both') && (
                <div className={`border border-gray-300 rounded-sm overflow-hidden shadow-xs relative ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1' : ''}`}>
                  {isDragEnabled && (
                    <div className="drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print">
                      <span className="flex items-center gap-1"><GripHorizontal size={12} /> اسحب لنقل جدول مقارنة الإحداثيات</span>
                      <span>⋮⋮</span>
                    </div>
                  )}

                  <table 
                    id="custom-table2-coordinates"
                    className="w-full text-[12px] text-center"
                    style={{ borderCollapse: 'separate', borderSpacing: 0, direction: 'rtl' }}
                  >
                    <thead>
                      <tr>
                        <th style={{ width: '22%', backgroundColor: '#f9fafb', borderBottom: '1px solid #d1d5db', padding: '6px 8px', textAlign: 'center' }}>
                        </th>
                        <th style={{ width: '39%', backgroundColor: '#701a2b', color: '#ffffff', borderRight: '1px solid #ffffff', borderBottom: '1px solid #d1d5db', padding: '6px 8px', fontSize: '12px', fontWeight: 700, textAlign: 'center' }}>
                          تركيب الجهاز
                        </th>
                        <th style={{ width: '39%', backgroundColor: '#0f766e', color: '#ffffff', borderRight: '1px solid #ffffff', borderBottom: '1px solid #d1d5db', padding: '6px 8px', fontSize: '12px', fontWeight: 700, textAlign: 'center' }}>
                          آخر موقع
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white">
                        <td style={{ backgroundColor: '#f9fafb', color: '#374151', fontWeight: 700, padding: '6px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                          التاريخ
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '11.5px', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center' }}>
                          {isTableEditing ? (
                            <input
                              type="text"
                              value={telemetryData.releasePos.dateStr}
                              onChange={(e) => setTelemetryData({ ...telemetryData, releasePos: { ...telemetryData.releasePos, dateStr: e.target.value } })}
                              className="w-full text-center font-mono font-bold text-[11px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            />
                          ) : (
                            <span dir="ltr">{telemetryData.releasePos.dateStr}</span>
                          )}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '11.5px', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center' }}>
                          {isTableEditing ? (
                            <input
                              type="text"
                              value={telemetryData.lastGpsPos.dateStr}
                              onChange={(e) => setTelemetryData({ ...telemetryData, lastGpsPos: { ...telemetryData.lastGpsPos, dateStr: e.target.value } })}
                              className="w-full text-center font-mono font-bold text-[11px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            />
                          ) : (
                            <span dir="ltr">{telemetryData.lastGpsPos.dateStr}</span>
                          )}
                        </td>
                      </tr>

                      <tr className="bg-white">
                        <td style={{ backgroundColor: '#f9fafb', color: '#374151', fontWeight: 700, fontSize: '11px', padding: '6px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                          خط العرض (N)
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '12px', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center' }}>
                          {isTableEditing ? (
                            <input
                              type="number"
                              step="0.0001"
                              value={telemetryData.releasePos.lat}
                              onChange={(e) => setTelemetryData({ ...telemetryData, releasePos: { ...telemetryData.releasePos, lat: parseFloat(e.target.value) || 0 } })}
                              className="w-full text-center font-mono font-bold text-[11px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            />
                          ) : (
                            <span dir="ltr">{metrics.releaseLatDMM}</span>
                          )}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '12px', borderRight: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center' }}>
                          {isTableEditing ? (
                            <input
                              type="number"
                              step="0.0001"
                              value={telemetryData.lastGpsPos.lat}
                              onChange={(e) => setTelemetryData({ ...telemetryData, lastGpsPos: { ...telemetryData.lastGpsPos, lat: parseFloat(e.target.value) || 0 } })}
                              className="w-full text-center font-mono font-bold text-[11px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            />
                          ) : (
                            <span dir="ltr">{metrics.lastGpsLatDMM}</span>
                          )}
                        </td>
                      </tr>

                      <tr className="bg-white">
                        <td style={{ backgroundColor: '#f9fafb', color: '#374151', fontWeight: 700, fontSize: '11px', padding: '6px 8px', textAlign: 'center' }}>
                          خط الطول (E)
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '12px', borderRight: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center' }}>
                          {isTableEditing ? (
                            <input
                              type="number"
                              step="0.0001"
                              value={telemetryData.releasePos.lon}
                              onChange={(e) => setTelemetryData({ ...telemetryData, releasePos: { ...telemetryData.releasePos, lon: parseFloat(e.target.value) || 0 } })}
                              className="w-full text-center font-mono font-bold text-[11px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            />
                          ) : (
                            <span dir="ltr">{metrics.releaseLonDMM}</span>
                          )}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827', fontSize: '12px', borderRight: '1px solid #e5e7eb', padding: '6px 8px', textAlign: 'center' }}>
                          {isTableEditing ? (
                            <input
                              type="number"
                              step="0.0001"
                              value={telemetryData.lastGpsPos.lon}
                              onChange={(e) => setTelemetryData({ ...telemetryData, lastGpsPos: { ...telemetryData.lastGpsPos, lon: parseFloat(e.target.value) || 0 } })}
                              className="w-full text-center font-mono font-bold text-[11px] border border-amber-300 rounded px-1 py-0.5 bg-amber-50/50"
                            />
                          ) : (
                            <span dir="ltr">{metrics.lastGpsLonDMM}</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* TABLE 3: DETAILED HISTORY TRAJECTORY TABLE */}
              {(tableMode === 'history_list' || tableMode === 'both') && (
                <div className={`border border-gray-300 rounded-sm overflow-hidden shadow-xs relative ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1' : ''}`}>
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

              {/* 4 KPI METRIC CARDS */}
              <div className={`grid grid-cols-4 gap-2 pt-1 relative ${isDragEnabled ? 'ring-2 ring-purple-400 ring-offset-1 p-1 rounded' : ''}`} style={{ direction: 'rtl' }}>
                {isDragEnabled && (
                  <div className="col-span-4 drag-handle bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 flex items-center justify-between cursor-move select-none no-print rounded-t">
                    <span className="flex items-center gap-1"><GripHorizontal size={12} /> اسحب لنقل بطاقات المؤشرات</span>
                    <span>⋮⋮</span>
                  </div>
                )}

                <div className="border border-gray-300 rounded-sm bg-gray-50/70 p-2 text-center shadow-xs">
                  <div className="text-[14px] font-black text-[#991b1b] font-mono leading-tight mb-0.5" dir="ltr">
                    {metrics.distFromReleaseKm} km
                  </div>
                  <div className="text-[9.5px] font-bold text-gray-600 leading-tight">
                    المسافة من موقع التركيب
                  </div>
                </div>

                <div className="border border-gray-300 rounded-sm bg-gray-50/70 p-2 text-center shadow-xs">
                  <div className="text-[13.5px] font-black text-gray-900 leading-tight mb-0.5">
                    {metrics.bearingArabic.text}
                  </div>
                  <div className="text-[9.5px] font-bold text-gray-600 leading-tight">
                    الاتجاه ({metrics.bearingArabic.degrees}°)
                  </div>
                </div>

                <div className="border border-gray-300 rounded-sm bg-gray-50/70 p-2 text-center shadow-xs">
                  <div className="text-[14px] font-black text-gray-900 font-mono leading-tight mb-0.5" dir="ltr">
                    {metrics.distToCampKm} km
                  </div>
                  <div className="text-[9.5px] font-bold text-gray-600 leading-tight">
                    البعد عن المخيم
                  </div>
                </div>

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

          {/* 3. REPORT FOOTER (MODIFIABLE AND PERSONALIZED) */}
          <div className="mt-5 pt-2.5 border-t border-gray-200 text-center text-[11.5px] font-semibold text-gray-500 flex items-center justify-between" style={{ direction: 'rtl' }}>
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
              <span>{customMetadata.footerRight || 'المركز القطري لتكاثر الحبارى والصقور – كازاخستان'}</span>
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
              />
            ) : (
              <span className="text-[10px] text-gray-400 font-mono" dir="ltr">
                {customMetadata.footerLeft || 'HBTrack Custom Map Report • Live Tracking View'}
              </span>
            )}
          </div>

        </div>

      </div>

    </div>
  );
};
