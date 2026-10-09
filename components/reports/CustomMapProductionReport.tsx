import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Download, RefreshCw, Compass, MapPin, 
  Calendar, ChevronDown, Check, Search, SlidersHorizontal, 
  Layers, Info, FileDown, CheckCircle2,
  Plus, Minus, Crosshair, Maximize2, Minimize2,
  Edit3, Trash2, History, Camera, Image as ImageIcon, Sparkles
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, useMap, ScaleControl } from 'react-leaflet';
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

// ─── LEAFLET ICONS (MATCHING LIVE TRACKING EXACTLY) ─────────────────────────

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

  // Editable Bird & Header Metadata
  const [customMetadata, setCustomMetadata] = useState<{
    birdRing: string;
    species: string;
    gender: string;
    birdStatus: string;
    issueDate: string;
    reportTitle: string;
    regionName: string;
  }>({
    birdRing: 'NA',
    species: 'وحش',
    gender: 'ذكر',
    birdStatus: 'حي',
    issueDate: formatDateYYYYMMDD(new Date()) || '2026-10-09',
    reportTitle: 'تقرير متابعة طائر حبارى مزود بجهاز تتبع',
    regionName: 'كازاخستان'
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

      // Filter GPS and valid coordinates
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
          birdRing: currentBird?.ring_id || 'NA',
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
    if (selectedCampId === 'zhezkazgan_camp') return FIXED_FIELD_CAMPS[0];
    if (selectedCampId === 'almaty_camp') return FIXED_FIELD_CAMPS[1];
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
      lastGpsLonDMM: formatDMM(lLon, false)
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
  const handleCaptureInteractiveMap = async () => {
    if (!mapViewportRef.current) return;
    try {
      const canvas = await html2canvas(mapViewportRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      setMapSnapshotUrl(dataUrl);
      setMapDisplayMode('snapshot');
    } catch (e) {
      console.warn('Could not capture map view:', e);
    }
  };

  // ─── EXPORT TO PDF & PNG ───────────────────────────────────────────────────
  const handleExportPdf = async () => {
    if (!reportContainerRef.current) return;
    setIsExportingPdf(true);

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
          el.classList?.contains('no-print') || 
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
      pdf.save(`Custom_Report_${selectedPttId}_${customMetadata.issueDate}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('حدث خطأ أثناء تصدير ملف PDF.');
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
          el.classList?.contains('no-print') || 
          el.classList?.contains('leaflet-control-zoom') || 
          el.classList?.contains('leaflet-control-attribution')
      });

      const link = document.createElement('a');
      link.download = `Custom_Report_${selectedPttId}_${customMetadata.issueDate}.png`;
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
          nav, header, aside, .no-print, .report-toolbar {
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
                  <span>منظور طبق الأصل من التتبع المباشر</span>
                </span>
                {mapDisplayMode === 'snapshot' && mapSnapshotUrl && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center gap-1">
                    <Camera size={12} />
                    <span>صورة ملتقطة من الخريطة</span>
                  </span>
                )}
                {isTableEditing && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 animate-pulse">
                    وضع تعديل الجدول مفعل
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                عرض الخريطة مستورد كصورة ملتقطة طبق الأصل من خريطة التتبع المباشر، والجدول قابل للتعديل والتحميل من سجل الجهاز.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Upload from History */}
            <button
              onClick={() => handleUploadFromHistory()}
              disabled={isLoadingTelemetry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-colors"
              title="جلب إحداثيات ومسار الجهاز من السجل التاريخي لقاعدة البيانات"
            >
              <History size={16} className={isLoadingTelemetry ? 'animate-spin' : ''} />
              <span>تحميل من سجل الجهاز</span>
            </button>

            {/* Toggle Table Edit Mode */}
            <button
              onClick={() => setIsTableEditing(!isTableEditing)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-colors ${
                isTableEditing 
                  ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-slate-700 dark:text-white'
              }`}
              title="تعديل نصوص وقيم خلايا الجدول مباشرة"
            >
              <Edit3 size={15} />
              <span>{isTableEditing ? 'حفظ التعديل' : 'تعديل محتوى الجدول'}</span>
            </button>

            {/* Export PDF */}
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-colors"
            >
              <FileDown size={16} />
              <span>{isExportingPdf ? 'جارِ التحميل...' : 'تصدير PDF'}</span>
            </button>

            {/* Export PNG */}
            <button
              onClick={handleExportPng}
              disabled={isExportingPng}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-colors"
            >
              <Download size={16} />
              <span>{isExportingPng ? 'جارِ التحميل...' : 'تصدير صورة'}</span>
            </button>

            {/* Fullscreen */}
            <button
              onClick={() => setIsReportFullscreen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-sm transition-colors"
              title="معاينة التقرير بملء الشاشة"
            >
              <Maximize2 size={16} />
              <span>ملء الشاشة</span>
            </button>

            {/* Customizer */}
            <button
              onClick={() => setShowCustomizer(!showCustomizer)}
              className={`p-2 rounded-xl border text-sm font-medium transition-colors ${
                showCustomizer 
                  ? 'bg-brand-50 text-brand-600 border-brand-200 dark:bg-brand-900/30' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-slate-700 dark:border-slate-600 dark:text-gray-300'
              }`}
              title="تخصيص البيانات الإضافية"
            >
              <SlidersHorizontal size={18} />
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

        {/* Inputs & Controls Row */}
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
                title="عرض خريطة تفاعلية نظيفة بدون القواعد القديمة"
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

          {/* 5. Telemetry Status */}
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
                    <span>سجل متوفر: {telemetryData.rawGpsCount} نقطة</span>
                  </>
                ) : (
                  <>
                    <Info size={14} className="text-brand-500" />
                    <span>النموذج الافتراضي</span>
                  </>
                )}
              </span>
            </div>

            {mapSnapshotUrl && (
              <button
                type="button"
                onClick={() => setMapDisplayMode(m => m === 'snapshot' ? 'interactive' : 'snapshot')}
                className="text-[10px] px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100 transition-colors"
                title="التبديل بين صورة الشاشة والخريطة"
              >
                {mapDisplayMode === 'snapshot' ? 'عرض كخريطة' : 'عرض كصورة'}
              </button>
            )}
          </div>

        </div>

        {/* ─── COLLAPSIBLE CUSTOMIZER PANEL ───────────────────────────────── */}
        {showCustomizer && (
          <div className="pt-3 border-t border-gray-100 dark:border-slate-700/60 space-y-3">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300">
              تخصيص الحقول والمعلومات المطبوعة:
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
                <label className="block text-[11px] text-gray-500 mb-1">المنطقة:</label>
                <input
                  type="text"
                  value={customMetadata.regionName}
                  onChange={(e) => setCustomMetadata({ ...customMetadata, regionName: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg outline-none"
                />
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
                <label className="block text-[11px] text-gray-500 mb-1">تاريخ الإصدار:</label>
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
              <h1 
                className="text-[21px] font-black text-gray-900 leading-tight mb-1"
                style={{ letterSpacing: 'normal', fontFeatureSettings: '"liga" 1' }}
              >
                {customMetadata.reportTitle || 'تقرير متابعة طائر حبارى مزود بجهاز تتبع'}
              </h1>
              <div className="text-[12.5px] font-bold text-gray-700 flex items-center justify-center gap-2">
                <span>جهاز التتبع <span className="font-mono text-[#701a2b] font-black">{selectedPttId}</span></span>
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
            {/* EXACT VIEW FROM LIVE TRACK AS A SCREENED PHOTO OR CLEAN INTERACTIVE MAP */}
            <div className="w-[58%] flex flex-col space-y-2" style={{ direction: 'ltr' }}>
              
              {/* Map Viewport Frame */}
              <div 
                ref={mapViewportRef}
                className="relative border-2 border-gray-800 rounded-sm overflow-hidden bg-stone-900 h-[435px] shadow-sm flex items-center justify-center"
                style={{ direction: 'ltr', textAlign: 'left' }}
              >
                
                {/* 1. SCREENED PHOTO FROM LIVE TRACK (EXACT VIEW EXPORTED) */}
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
                  /* 2. CLEAN DYNAMIC MAP WITHOUT THE OLD RULES */
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
                      className="w-full h-full cursor-grab active:cursor-grabbing"
                      style={{ direction: 'ltr', width: '100%', height: '100%' }}
                    >
                      <MapInstanceBinder onMapInstance={setMapInstance} />

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

                      {/* Real History Flight / Migration Trajectory (matching Live Tracking exactly) */}
                      {allHistoryPoints.length > 1 && (
                        <Polyline
                          positions={allHistoryPoints}
                          pathOptions={{
                            color: '#6366f1',
                            weight: 2.8,
                            opacity: 0.85
                          }}
                        />
                      )}

                      {/* Dots on trajectory points (matching Live Tracking) */}
                      {allHistoryPoints.map((pt, i) => (
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

                      {/* Current/Latest Active Transmitter Marker */}
                      {metrics.lLat !== 0 && metrics.lLon !== 0 && (
                        <Marker
                          position={[metrics.lLat, metrics.lLon]}
                          icon={createLiveTrackingMarkerIcon({
                            number: String(selectedPttId).replace(/^trans-/, ''),
                            pinColorHex: '#22c55e',
                            borderColorHex: '#22c55e'
                          })}
                          zIndexOffset={2000}
                        />
                      )}

                      {/* Field Camps (Zhezkazgan & Almaty) */}
                      {FIXED_FIELD_CAMPS.map(camp => (
                        <Marker
                          key={camp.id}
                          position={[camp.lat, camp.lon]}
                          icon={createLiveTrackingCampIcon(camp.name)}
                          zIndexOffset={1000}
                        />
                      ))}

                    </MapContainer>

                    {/* North Arrow Symbol */}
                    <div className="absolute top-2.5 right-3 z-[1000] flex flex-col items-center pointer-events-none drop-shadow">
                      <svg width="18" height="26" viewBox="0 0 20 30" fill="none">
                        <polygon points="10,0 0,26 10,20" fill="#ffffff" stroke="#000000" strokeWidth="1" />
                        <polygon points="10,0 20,26 10,20" fill="#111827" stroke="#000000" strokeWidth="1" />
                      </svg>
                      <span className="text-[11px] font-black text-white font-mono leading-none mt-0.5">N</span>
                    </div>

                    {/* Quick Snap Button */}
                    <div className="no-print absolute bottom-2 left-2 z-[1000] flex items-center gap-1 bg-slate-900/85 backdrop-blur-md px-2 py-1 rounded-lg border border-white/20 shadow-lg text-white select-none">
                      <button
                        type="button"
                        onClick={handleCaptureInteractiveMap}
                        className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300"
                        title="التقاط هذا المنظور وحفظه كصورة في التقرير"
                      >
                        <Camera size={13} />
                        <span>التقاط كصورة</span>
                      </button>
                    </div>

                  </div>
                )}

              </div>

              {/* Map Legend Bar Under Map (Matching the Real Live Track elements) */}
              <div 
                className="border border-gray-300 rounded-sm bg-white py-1.5 px-3 shadow-xs select-none"
                style={{ direction: 'rtl' }}
              >
                <table id="custom-map-legend-bar" style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl', margin: 0, padding: 0 }}>
                  <tbody>
                    <tr>
                      {/* 1. آخر موقع تم رصده */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 6px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                            <circle cx="5" cy="5" r="4.2" fill="#22c55e" stroke="#ffffff" strokeWidth="1" />
                          </svg>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap' }}>
                            آخر موقع تم رصده ({telemetryData.lastGpsPos.dateStr})
                          </span>
                        </div>
                      </td>

                      {/* 2. مسار الهجرة والرحلة */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 6px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <svg width="20" height="10" viewBox="0 0 20 10" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                            <line x1="0" y1="5" x2="20" y2="5" stroke="#6366f1" strokeWidth="2.5" />
                          </svg>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap' }}>
                            مسار الرحلة والهجرة (Flight Track)
                          </span>
                        </div>
                      </td>

                      {/* 3. نقاط الرصد والتسجيل */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 6px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ffffff', border: '1.5px solid #4f46e5' }} />
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap' }}>
                            نقاط التسجيل والرصد
                          </span>
                        </div>
                      </td>

                      {/* 4. مخيمات الميدان */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', padding: '0 6px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', verticalAlign: 'middle', height: '18px' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
                            <path d="M19 20 10 4 1 20h18Z" fill="#10b981" fillOpacity="0.35"/>
                            <path d="M10 4 23 20"/>
                            <path d="m10 4 4.5 16"/>
                          </svg>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle', fontSize: '10.5px', fontWeight: 700, color: '#1f2937', whiteSpace: 'nowrap' }}>
                            مخيمات الميدان (Field Camps)
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>

            {/* ─── COLUMN 2 (RIGHT): CHANGEABLE DATA TABLES (approx 42% width) ── */}
            <div className="w-[42%] flex flex-col space-y-3" style={{ direction: 'rtl' }}>
              
              {/* TABLE 1: BIRD DATA (بيانات الطائر) */}
              {(tableMode === 'standard' || tableMode === 'both') && (
                <div className="border border-gray-300 rounded-sm overflow-hidden shadow-xs">
                  <div 
                    className="w-full bg-[#701a2b] text-white py-1.5 px-3 text-center text-[13.5px] font-bold flex items-center justify-between"
                    style={{ lineHeight: '22px' }}
                  >
                    <span className="flex-1 text-center font-bold">بيانات الطائر</span>
                    {isTableEditing && (
                      <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white font-normal">
                        قابل للتعديل
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
                              {String(selectedPttId).replace(/^trans-/, '')}
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
                <div className="border border-gray-300 rounded-sm overflow-hidden shadow-xs">
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
                        <td style={{ backgroundColor: '#f9fafb', color: '#374151', fontWeight: 700, fontSize: '11px', padding: '6px 8px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
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
                <div className="border border-gray-300 rounded-sm overflow-hidden shadow-xs">
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
              <div className="grid grid-cols-4 gap-2 pt-1" style={{ direction: 'rtl' }}>
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

          {/* 3. REPORT FOOTER */}
          <div className="mt-5 pt-2.5 border-t border-gray-200 text-center text-[11.5px] font-semibold text-gray-500 flex items-center justify-between" style={{ direction: 'rtl' }}>
            <span>المركز القطري لتكاثر الحبارى والصقور – كازاخستان</span>
            <span className="text-[10px] text-gray-400 font-mono">
              HBTrack Custom Map Report • Live Tracking View
            </span>
          </div>

        </div>

      </div>

    </div>
  );
};
