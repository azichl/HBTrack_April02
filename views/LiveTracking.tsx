import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Layers, CircleDot, CheckCircle2, Check, ChevronDown, CloudSun, Search, Maximize, Minimize, Battery, Clock, Map as MapIcon, Wind, History, GripHorizontal, Cloud, X, Satellite, Calendar, ThermometerSun, Radio, Navigation, Globe, MapPin, ExternalLink, Loader2, Sparkles, BrainCircuit, Crosshair, Languages, Ruler, Trash2 } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, ScaleControl, useMapEvents, Tooltip, useMap, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { useAppStore } from '../store/appStore';
import ReactMarkdown from 'react-markdown';
import { formatDateTime, formatBattery } from '../utils/formatting';
import { getHistoricalPositions } from '../services/firestoreService';
import Draggable from 'react-draggable';
// Use standard colored markers (matching Migration view style)
const greenIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const orangeIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const blueIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Custom Target Icon (White circle with blue border and blue dot)
const targetIcon = L.divIcon({
  className: 'bg-transparent',
  html: `<div class="w-5 h-5 bg-white rounded-full border-2 border-blue-500 flex items-center justify-center shadow-md">
           <div class="w-2 h-2 bg-blue-600 rounded-full"></div>
         </div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

// Measurement Tool Icons
const measureDotIcon = L.divIcon({
    className: 'bg-transparent',
    html: `<div class="w-3 h-3 bg-white rounded-full border-2 border-yellow-500 shadow-sm"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
});

const measureEndIcon = L.divIcon({
    className: 'bg-transparent',
    html: `<div class="w-4 h-4 bg-yellow-500 rounded-full border-2 border-white shadow-md flex items-center justify-center">
             <div class="w-1 h-1 bg-white rounded-full"></div>
           </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

// Helper to select icon
const getStatusIcon = (status: string) => {
    if (status === 'active') return greenIcon;
    if (status === 'lost' || status === 'maintenance') return orangeIcon;
    return redIcon;
};

// Helper to parse various coordinate formats (HDD, HDMM, HDMS)
const parseFlexibleCoordinates = (input: string): { lat: number, lon: number } | null => {
    const s = input.trim().toUpperCase();
    
    // 1. Try Decimal pair (HDD) - strict pairs
    // Matches: "12.34, 56.78" or "12.34 56.78"
    const hddRegex = /^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/;
    const hddMatch = s.match(hddRegex);
    if (hddMatch) {
        const lat = parseFloat(hddMatch[1]);
        const lon = parseFloat(hddMatch[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }

    // 2. Try DMM/DMS with delimiters
    let parts: string[] = [];
    
    // Split by comma if present
    if (s.includes(',')) {
        parts = s.split(',');
    } else {
        // Split by N/S if present (Lat separator)
        // Matches " ... N ... "
        const match = s.match(/([NS])[\s,]*(.*)/);
        if (match) {
            const splitIdx = s.indexOf(match[1]) + 1;
            parts = [s.substring(0, splitIdx), s.substring(splitIdx)];
        }
    }

    if (parts.length !== 2) return null;

    const parsePart = (p: string) => {
        p = p.trim();
        let sign = 1;
        if (/[SW]/.test(p)) sign = -1;
        
        // Extract numbers
        const nums = p.match(/(\d+(?:\.\d+)?)/g);
        if (!nums) return NaN;
        
        const vals = nums.map(Number);
        let val = 0;
        
        if (vals.length === 3) {
            // DMS: D M S
            val = vals[0] + vals[1]/60 + vals[2]/3600;
        } else if (vals.length === 2) {
            // DMM: D M
            val = vals[0] + vals[1]/60;
        } else if (vals.length === 1) {
            // HDD with direction letter
            val = vals[0];
        } else {
            return NaN;
        }
        return val * sign;
    };

    const lat = parsePart(parts[0]);
    const lon = parsePart(parts[1]);

    if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        return { lat, lon };
    }

    return null;
};


const WEATHER_API_KEY = 'c748a0edae0f262b7a5405b65c42eac9';
const METEOBLUE_API_KEY = 'eMGFsQTKiUP31Yq0';

// Component to fly to selected bird or searched location
const MapController = ({ 
    selectedPos, 
    customFlyTo 
}: { 
    selectedPos: { lat: number, lon: number } | null, 
    customFlyTo: { lat: number, lon: number } | null 
}) => {
    const map = useMap();
    
    useEffect(() => {
        if (selectedPos) {
            map.flyTo([selectedPos.lat, selectedPos.lon], 9, { animate: true });
        }
    }, [selectedPos, map]);

    useEffect(() => {
        if (customFlyTo) {
            map.flyTo([customFlyTo.lat, customFlyTo.lon], 10, { animate: true });
        }
    }, [customFlyTo, map]);

    return null;
};

// Handles clicking on map to close dropdowns and handle left-click interactions
const MapEventsHandler = ({ 
    closeDropdowns, 
    onWeatherClick, 
    activeWeatherLayer,
    onMapClick,
    onContextMenu
}: { 
    closeDropdowns: () => void; 
    onWeatherClick: (e: L.LeafletMouseEvent) => void; 
    activeWeatherLayer: string;
    onMapClick: (e: L.LeafletMouseEvent) => void;
    onContextMenu: (e: L.LeafletMouseEvent) => void;
}) => {
    useMapEvents({
        click: (e) => {
            closeDropdowns();
            if (activeWeatherLayer === 'temp_new') {
                onWeatherClick(e);
            } else {
                onMapClick(e);
            }
        },
        contextmenu: (e) => {
            closeDropdowns();
            onContextMenu(e); 
        }
    });
    return null;
};

// Helper Component to fetch and display local time for a coordinate
const LocationTimestamp = ({ timestamp, lat, lon, fallbackTimeZone }: { timestamp: string, lat: number, lon: number, fallbackTimeZone: string }) => {
    const [timeData, setTimeData] = useState<{ formatted: string, tz: string } | null>(null);

    useEffect(() => {
        let mounted = true;
        const fetchLocalTime = async () => {
            try {
                // Fetch just the timezone info. We request 'temperature_2m' just to satisfy the API 'current' parameter requirement, 
                // but we really want '&timezone=auto' to get the detected timezone.
                const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`);
                const data = await response.json();
                
                if (mounted && data.timezone) {
                    setTimeData({
                        formatted: formatDateTime(timestamp, data.timezone),
                        tz: data.timezone
                    });
                }
            } catch (e) {
                // Fallback will be used
            }
        };
        
        fetchLocalTime();
        return () => { mounted = false; };
    }, [timestamp, lat, lon]);

    if (!timeData) {
        return (
            <div className="flex items-center">
                <span className="font-medium text-gray-800">{formatDateTime(timestamp, fallbackTimeZone)}</span>
                <span className="text-[9px] text-gray-400 ml-1 italic">(Loading local time...)</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-end leading-tight">
            <span className="font-medium text-gray-800">{timeData.formatted}</span>
            <span className="text-[9px] text-brand-600 font-medium tracking-tight">Local: {timeData.tz.replace('_', ' ')}</span>
        </div>
    );
};

// Component for Popup with LST Data Fetching
const LSTPopupContent = ({ lat, lon, timestamp, pttId, color, type, timeZone }: { lat: number, lon: number, timestamp: string, pttId: string, color: string, type?: string, timeZone: string }) => {
  const [data, setData] = useState<{ temp: number | null, loading: boolean, source?: string, timezone?: string }>({ temp: null, loading: true });

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const date = new Date(timestamp);
        const dateStr = date.toISOString().split('T')[0];
        const hour = date.getUTCHours(); 
        
        // Added timezone=auto to get the local time zone of the point
        let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=soil_temperature_0cm&timezone=auto`;
        
        let res = await fetch(url);
        let json = await res.json();
        let source = 'Forecast API';
        
        if (json.error) {
             // Fallback to archive
             url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=soil_temperature_0cm&timezone=auto`;
             res = await fetch(url);
             json = await res.json();
             source = 'Archive API';
        }

        if (isMounted && json.hourly && json.hourly.soil_temperature_0cm) {
          const temp = json.hourly.soil_temperature_0cm[hour] !== undefined 
            ? json.hourly.soil_temperature_0cm[hour] 
            : json.hourly.soil_temperature_0cm[0];
          
          setData({ temp, loading: false, source, timezone: json.timezone });
        } else {
          if(isMounted) setData({ temp: null, loading: false });
        }
      } catch (e) {
        if(isMounted) setData({ temp: null, loading: false });
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [lat, lon, timestamp]);

  return (
    <div className="text-center p-1 min-w-[200px]" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>
        <div className="flex items-center justify-center gap-1 mb-1">
             <div className="font-bold text-[14px]" style={{color: color}}>PTT {pttId}</div>
             {type && (
                 <span className={`text-[10px] px-1 rounded ${type === 'GPS' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                     {type}
                 </span>
             )}
        </div>
        <div className="text-[12px] font-semibold text-gray-800 border-b border-gray-100 pb-2 mb-2">
            {formatDateTime(timestamp, data.timezone || timeZone)}
            {(data.timezone) && <div className="text-[10px] text-gray-400 font-normal mt-0.5">Local: {data.timezone.replace('_', ' ')}</div>}
        </div>
        
        <div className="flex items-center justify-between text-[12px] mb-2 bg-gray-50 p-1 rounded">
            <span className="text-gray-500">Location</span>
            <span className="font-mono text-[11px] text-gray-700">Lat: {lat?.toFixed(3)}, Lon: {lon?.toFixed(3)}</span>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-2.5 border border-orange-200">
            <div className="text-[11px] uppercase font-bold text-orange-800 mb-1 flex items-center justify-center gap-1">
                 <ThermometerSun size={12} />
                 Land Surface Temp (LST)
            </div>
            {data.loading ? (
                <div className="flex items-center justify-center gap-2 py-2">
                     <div className="w-3 h-3 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin"></div>
                     <span className="text-xs text-orange-600 font-medium">Loading Data...</span>
                </div>
            ) : data.temp !== null ? (
                <div>
                  <div className="text-2xl font-black text-orange-600 tracking-tight">
                      {data.temp}°C
                  </div>
                  <div className="text-[9px] text-orange-400 mt-1 opacity-70">
                    Source: Open-Meteo
                  </div>
                </div>
            ) : (
                <div className="text-xs text-gray-400 py-1">Data Unavailable</div>
            )}
        </div>

        <div className="mt-2">
            <a
                href={`https://earth.google.com/web/search/${lat},${lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-1.5 bg-blue-50 text-blue-700 font-semibold rounded hover:bg-blue-100 transition-colors text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 border border-blue-200"
            >
                <Globe size={12} /> Earth
            </a>
        </div>
    </div>
  );
};

interface TransmitterMarkerProps {
    pos: any;
    transmitter: any;
    bird: any;
    timeZone: string;
    setSelectedTransmitterIds: (ids: string[]) => void;
    setShowHistory: (show: boolean) => void;
    setNavTarget?: (target: {id: string, lat: number, lon: number} | null) => void;
    isTrackingUser?: boolean;
}

// Extracted Marker Component to fix Popup data staleness issue
const TransmitterMarker: React.FC<TransmitterMarkerProps> = ({ 
    pos, 
    transmitter, 
    bird, 
    timeZone, 
    setSelectedTransmitterIds, 
    setShowHistory,
    setNavTarget,
    isTrackingUser
}) => {
    const { setActiveTab } = useAppStore();
    const [isOpen, setIsOpen] = useState(false);

    // Props are now passed directly to ensure reactivity
    const status = transmitter?.status || 'inactive';
    
    let badgeColorClass = 'bg-red-100 text-red-700'; 
    if (status === 'active') badgeColorClass = 'bg-green-100 text-green-700';
    if (status === 'lost' || status === 'maintenance') badgeColorClass = 'bg-orange-100 text-orange-700';

    let ticketClass = 'bg-white text-slate-900 border-2 border-red-500';
    if (status === 'active') ticketClass = 'bg-white text-slate-900 border-2 border-green-500';
    if (status === 'lost' || status === 'maintenance') ticketClass = 'bg-white text-slate-900 border-2 border-orange-500';

    const handleAIAnalysis = () => {
        setSelectedTransmitterIds([pos.transmitter_id]);
        setActiveTab('AI Predictions');
    };

    return (
        <Marker 
            position={[pos.lat, pos.lon]}
            icon={getStatusIcon(status)}
            eventHandlers={{
                popupopen: () => {
                    setIsOpen(true);
                    if (setNavTarget) {
                        setNavTarget({id: pos.transmitter_id, lat: pos.lat, lon: pos.lon});
                    }
                },
                popupclose: () => setIsOpen(false)
            }}
        >
            <Tooltip 
                permanent 
                direction="top" 
                offset={[0, -38]} 
                className="!bg-transparent !border-0 !shadow-none !p-0 before:!hidden"
            >
                <div 
                    className={`px-2 py-0 rounded-full shadow-sm text-xs font-bold ${ticketClass}`}
                    style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                >
                    {pos.transmitter_id}
                </div>
            </Tooltip>

            <Popup className="custom-popup">
                {isOpen && (
                    <div className="p-1 min-w-[200px]" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                            <h3 className="font-bold text-brand-900 text-base">PTT {pos.transmitter_id}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${badgeColorClass}`}>
                                {status}
                            </span>
                        </div>
                        
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 flex items-center gap-1"><CircleDot size={12}/> Bird</span>
                                <span className="font-medium text-gray-800">{bird?.ring_id || 'Unassigned'}</span>
                            </div>
                            <div className="flex justify-between items-start">
                                <span className="text-gray-500 flex items-center gap-1 mt-0.5"><Clock size={12}/> Last Fix</span>
                                <LocationTimestamp timestamp={pos.timestamp} lat={pos.lat} lon={pos.lon} fallbackTimeZone={timeZone} />
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 flex items-center gap-1"><Battery size={12}/> Battery</span>
                                <span className={`font-medium ${
                                    (transmitter?.battery_voltage || 0) < 3.5 && (transmitter?.battery_voltage || 0) > 0 
                                    ? 'text-red-600' : 'text-green-600'
                                }`}>
                                    {formatBattery(transmitter?.battery_voltage)}
                                </span>
                            </div>
                            {pos.locationType && (
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-500 flex items-center gap-1"><Navigation size={12}/> Type</span>
                                    <span className="font-medium text-blue-600">
                                        {pos.locationType}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between text-xs text-gray-400">
                            <span>Lat: {pos.lat?.toFixed(4)}</span>
                            <span>Lon: {pos.lon?.toFixed(4)}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 mt-3">
                            <button 
                                onClick={() => {
                                    setSelectedTransmitterIds([pos.transmitter_id]);
                                    setShowHistory(true);
                                }}
                                className="py-1.5 bg-brand-50 text-brand-700 font-semibold rounded hover:bg-brand-100 transition-colors text-[10px] uppercase tracking-wide flex items-center justify-center gap-1"
                            >
                                <History size={12} /> Focus & History
                            </button>
                            <button 
                                onClick={handleAIAnalysis}
                                className="py-1.5 bg-purple-50 text-purple-700 font-semibold rounded hover:bg-purple-100 transition-colors text-[10px] uppercase tracking-wide flex items-center justify-center gap-1"
                            >
                                <BrainCircuit size={12} /> AI Forecast
                            </button>
                        </div>

                        <div className="mt-2">
                            <a
                                href={`https://earth.google.com/web/search/${pos.lat},${pos.lon}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full py-1.5 bg-blue-50 text-blue-700 font-semibold rounded hover:bg-blue-100 transition-colors text-[10px] uppercase tracking-wide flex items-center justify-center gap-1 border border-blue-200"
                            >
                                <Globe size={12} /> Google Earth
                            </a>
                        </div>
                    </div>
                )}
            </Popup>
        </Marker>
    );
};

interface HistoricalMarkerProps {
    point: { lat: number, lon: number, timestamp: string, type?: string };
    pttId: string;
    color: string;
    timeZone: string;
}

// Extracted Component for Historical Points to handle lazy-loading
const HistoricalMarker: React.FC<HistoricalMarkerProps> = ({ 
    point, 
    pttId, 
    color, 
    timeZone 
}) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <CircleMarker
            center={[point.lat, point.lon]}
            radius={4}
            pathOptions={{ color: color, fillColor: 'white', fillOpacity: 1, weight: 2 }}
            eventHandlers={{
                popupopen: () => setIsOpen(true),
                popupclose: () => setIsOpen(false)
            }}
        >
            <Popup closeButton={false} minWidth={200}>
                {isOpen && (
                    <LSTPopupContent 
                        lat={point.lat} 
                        lon={point.lon} 
                        timestamp={point.timestamp} 
                        pttId={pttId} 
                        color={color}
                        type={point.type}
                        timeZone={timeZone}
                    />
                )}
            </Popup>
        </CircleMarker>
    );
};

// Coordinate formatting helper
const formatCoordinateSystems = (lat: number, lon: number) => {
    const formatDM = (val: number, isLat: boolean) => {
        const abs = Math.abs(val || 0);
        const deg = Math.floor(abs);
        const min = (abs - deg) * 60;
        const dir = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
        return `${deg}° ${min.toFixed(3)}' ${dir}`;
    };

    const formatDMS = (val: number, isLat: boolean) => {
        const abs = Math.abs(val || 0);
        const deg = Math.floor(abs);
        const min = Math.floor((abs - deg) * 60);
        const sec = ((abs - deg) * 60 - min) * 60;
        const dir = isLat ? (val >= 0 ? "N" : "S") : (val >= 0 ? "E" : "W");
        return `${deg}° ${min}' ${sec.toFixed(1)}" ${dir}`;
    };

    return {
        HDD: `${lat?.toFixed(5)}, ${lon?.toFixed(5)}`,
        HDMM: `${formatDM(lat, true)}  ${formatDM(lon, false)}`,
        HDMS: `${formatDMS(lat, true)}  ${formatDMS(lon, false)}`
    };
};

export const LiveTracking = () => {
  const { 
      transmitters, 
      birds, 
      positions, 
      generateLivePositions, 
      selectedTransmitterIds, 
      setSelectedTransmitterIds,
      timeZone,
      activeGeeLayer,
      setActiveGeeLayer,
      geeNdviTileUrl,
      geeLstTileUrl,
      geeSaviTileUrl
  } = useAppStore();
  
  // View Mode State
  const [viewMode, setViewMode] = useState<'tracking' | 'weather' | 'weather2'>('tracking');

  // Tracking Map State
  const [layerOpen, setLayerOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false); // New History Dropdown State
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [activeLayer, setActiveLayer] = useState('google_hybrid');
  const [activeWeatherLayer, setActiveWeatherLayer] = useState('none');
  const [showLabels, setShowLabels] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Measurement Tool State
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);
  const [measureToolOffset, setMeasureToolOffset] = useState({ x: 0, y: 0 });
  const [isDraggingMeasureTool, setIsDraggingMeasureTool] = useState(false);
  const measureToolDragStartRef = useRef({ x: 0, y: 0 });
  const measureToolInitialOffsetRef = useRef({ x: 0, y: 0 });

  // History Popup drag state
  const [historyPopupPos, setHistoryPopupPos] = useState({ x: 0, y: 0 });
  const isDraggingHistoryRef = useRef(false);
  const historyDragStartRef = useRef({ x: 0, y: 0 });
  const historyInitialPosRef = useRef({ x: 0, y: 0 });

  const handleHistoryMouseDown = (e: React.MouseEvent) => {
    // Only drag from the header, not from interactive children
    if ((e.target as HTMLElement).closest('button, input, select, label')) return;
    isDraggingHistoryRef.current = true;
    historyDragStartRef.current = { x: e.clientX, y: e.clientY };
    historyInitialPosRef.current = { ...historyPopupPos };
    e.preventDefault();
    const onMove = (me: MouseEvent) => {
      if (!isDraggingHistoryRef.current) return;
      setHistoryPopupPos({
        x: historyInitialPosRef.current.x + me.clientX - historyDragStartRef.current.x,
        y: historyInitialPosRef.current.y + me.clientY - historyDragStartRef.current.y,
      });
    };
    const onUp = () => {
      isDraggingHistoryRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // History State
  const [showHistory, setShowHistory] = useState(false);
  const [historyMode, setHistoryMode] = useState<'preset' | 'custom'>('preset');
  const [historyPreset, setHistoryPreset] = useState<'24h' | '7d' | '30d' | '1y' | '2y'>('24h');
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyFixType, setHistoryFixType] = useState<'All' | 'GPS' | 'Doppler'>('All');
  const [customDates, setCustomDates] = useState({
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
  });
  
  const [historyPaths, setHistoryPaths] = useState<Array<{
    id: string, 
    path: Array<{lat: number, lon: number, timestamp: string, type?: string}>, 
    color: string
  }>>([]);

  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Geo Search & Real-Time Info State
  const [geoQuery, setGeoQuery] = useState("");
  const [isGeoSearching, setIsGeoSearching] = useState(false);
  const [customFlyTo, setCustomFlyTo] = useState<{lat: number, lon: number} | null>(null);
  const [searchMarkerPos, setSearchMarkerPos] = useState<{lat: number, lon: number, label: string} | null>(null);
  const searchMarkerRef = useRef<L.Marker>(null);

  // Click Coordinates State
  const [clickedPos, setClickedPos] = useState<{lat: number, lon: number} | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null); // For AI name fetching
  const clickMarkerRef = useRef<L.Marker>(null);

  // Weather Map State
  const [weatherType, setWeatherType] = useState("temp");
  const [searchLocation, setSearchLocation] = useState("");

  // Shared State
  const [tempPopup, setTempPopup] = useState<{lat: number, lon: number, temp: number, description: string} | null>(null);

  // Legend Dragging State
  const [legendOffset, setLegendOffset] = useState({ x: 0, y: 0 });
  const [isDraggingLegend, setIsDraggingLegend] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialOffsetRef = useRef({ x: 0, y: 0 });

  // Click Popup Dragging State
  const [clickPopupOffset, setClickPopupOffset] = useState({ x: 0, y: 0 });
  const [isDraggingClickPopup, setIsDraggingClickPopup] = useState(false);
  const clickPopupStartRef = useRef({ x: 0, y: 0 });
  const clickPopupInitialOffsetRef = useRef({ x: 0, y: 0 });


  // Fullscreen State
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Ensure positions are generated (if simulated, otherwise real data stays)
  useEffect(() => {
    generateLivePositions();
  }, [generateLivePositions]);

  // Ensure history is shown when component mounts if transmitters are already selected
  useEffect(() => {
    if (selectedTransmitterIds.length > 0) {
      setShowHistory(true);
    }
  }, []);

  // Open popup when search marker is placed
  useEffect(() => {
    if (searchMarkerPos && searchMarkerRef.current) {
        // Slight delay to ensure marker is rendered
        setTimeout(() => {
            searchMarkerRef.current?.openPopup();
        }, 100);
    }
  }, [searchMarkerPos]);

  // Compute LATEST positions for markers (Strictly one per transmitter based on timestamp)
  const latestPositions = useMemo(() => {
    // 1. Identify relevant transmitters based on status filter
    const relevantTransmitters = transmitters.filter(t => {
       if (selectedStatus === 'all') return true;
       if (selectedStatus === 'active') return t.status === 'active';
       if (selectedStatus === 'inactive') return t.status === 'inactive';
       if (selectedStatus === 'maintenance') return t.status === 'maintenance' || (t.status as any) === 'lost'; 
       if (selectedStatus === 'lost') return (t.status as any) === 'lost';
       return true;
    });
    
    const relevantIds = new Set(relevantTransmitters.map(t => String(t.platform_id)));
    
    // 2. Map to store latest position per ID
    const latestMap = new Map<string, typeof positions[0]>();
    
    positions.forEach(p => {
        // Filter by transmitter status validity
        if (!relevantIds.has(p.transmitter_id)) return;

        // Filter by selection (if any selection is active in search)
        if (selectedTransmitterIds.length > 0 && !selectedTransmitterIds.includes(p.transmitter_id)) {
            return;
        }

        // Filter invalid coordinates for marker display
        if (p.lat === 0 && p.lon === 0) return;

        // Filter by historyFixType (Location Type)
        if (historyFixType !== 'All' && p.locationType !== historyFixType) return;

        const currentTs = new Date(p.timestamp).getTime();
        // Skip invalid dates
        if (isNaN(currentTs)) return;

        const existing = latestMap.get(p.transmitter_id);
        
        // Strict Time Comparison: Keep the one with greater timestamp
        if (!existing) {
            latestMap.set(p.transmitter_id, p);
        } else {
             const existingTs = new Date(existing.timestamp).getTime();
             if (currentTs > existingTs) {
                 latestMap.set(p.transmitter_id, p);
             }
        }
    });

    // OVERRIDE WITH HISTORY IF ACTIVE
    if (showHistory && historyPaths.length > 0) {
        historyPaths.forEach(hp => {
            if (hp.path.length > 0) {
                // The history path is sorted ASC, so the last point is the most recent
                const lastPoint = hp.path[hp.path.length - 1];
                const existingPos = latestMap.get(hp.id);
                
                const overridePos = {
                    ...(existingPos || {}),
                    id: existingPos?.id || `history-latest-${hp.id}`,
                    transmitter_id: hp.id,
                    lat: lastPoint.lat,
                    lon: lastPoint.lon,
                    timestamp: lastPoint.timestamp,
                    locationType: lastPoint.type || (historyFixType !== 'All' ? historyFixType : 'Unknown')
                };
                
                latestMap.set(hp.id, overridePos as any);
            } else {
                // If history is active but no points match the filter, hide the green marker
                latestMap.delete(hp.id);
            }
        });
    }

    return Array.from(latestMap.values());
  }, [positions, selectedTransmitterIds, selectedStatus, transmitters, historyFixType, showHistory, historyPaths]);
  
  // Generate Historical Path (Fetching REAL data from Firestore directly)
  useEffect(() => {
    if (!showHistory || selectedTransmitterIds.length === 0) {
        setHistoryPaths([]);
        return;
    }

    const loadHistory = async () => {
        setIsHistoryLoading(true);
        
        let startDate = new Date();
        let endDate = new Date();
        const now = new Date();

        if (historyMode === 'preset') {
            if (historyPreset === '24h') startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            else if (historyPreset === '7d') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            else if (historyPreset === '30d') startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            else if (historyPreset === '1y') startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            else if (historyPreset === '2y') startDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
            else startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        } else {
             startDate = new Date(customDates.start);
             endDate = new Date(customDates.end);
             endDate.setHours(23,59,59);
        }

        const rawPositions = await getHistoricalPositions(selectedTransmitterIds, startDate, endDate);
        
        const newPaths: Array<{id: string, path: Array<{lat: number, lon: number, timestamp: string, type?: string}>, color: string}> = [];
        const colors = ['#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#10b981', '#3b82f6'];

        selectedTransmitterIds.forEach((pttId, index) => {
            let track = rawPositions.filter(p => p.transmitter_id === pttId);

            track = track.filter(p => {
                const validCoords = (p.lat !== 0 || p.lon !== 0) && !isNaN(p.lat) && !isNaN(p.lon);
                const validType = historyFixType === 'All' || p.locationType === historyFixType;
                return validCoords && validType;
            });

            if (track.length > 0) {
                 newPaths.push({
                     id: pttId,
                     path: track.map(p => ({ lat: p.lat, lon: p.lon, timestamp: p.timestamp, type: p.locationType })),
                     color: colors[index % colors.length]
                 });
            }
        });
        
        setHistoryPaths(newPaths);
        setIsHistoryLoading(false);
    };

    loadHistory();
  }, [showHistory, historyMode, historyPreset, customDates, historyFixType, selectedTransmitterIds]);

  // Filter transmitters for search suggestion
  const searchResults = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    return transmitters.filter(t => 
        String(t.platform_id || '').toLowerCase().includes(lowerQuery)
    );
  }, [searchQuery, transmitters]);

  const handleSearchToggle = (pttId: string) => {
      if (selectedTransmitterIds.includes(pttId)) {
          setSelectedTransmitterIds(selectedTransmitterIds.filter(id => id !== pttId));
      } else {
          setSelectedTransmitterIds([...selectedTransmitterIds, pttId]);
          setShowHistory(true); // Auto-show history when selecting via search
      }
  };

  const clearSelection = () => {
      setSelectedTransmitterIds([]);
      setSearchQuery("");
      setShowHistory(false); 
  };
  
  const selectAllFiltered = () => {
      const ids = searchResults.map(t => String(t.platform_id));
      const newSelection = Array.from(new Set([...selectedTransmitterIds, ...ids]));
      setSelectedTransmitterIds(newSelection);
      setShowHistory(true);
  };

  const handleGeoSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!geoQuery.trim()) return;

    // Fast client-side parsing for all coordinate formats
    const coords = parseFlexibleCoordinates(geoQuery);
    if (coords) {
         setCustomFlyTo(coords);
         setSearchMarkerPos({ lat: coords.lat, lon: coords.lon, label: `Coordinates: ${coords.lat.toFixed(5)}, ${coords.lon.toFixed(5)}` });
         closeAllDropdowns();
         return;
    }
    
    setIsGeoSearching(true);
    setSearchMarkerPos(null);
    closeAllDropdowns(); // Close other UI elements

    try {
        const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
        if (!apiKey) {
           console.warn("No Gemini API key available for search.");
           return;
        }

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: `User Query: "${geoQuery}"\nFind the coordinates for this location using Google Search.\nReturn ONLY the latitude and longitude in this format: [COORDS: lat, lon]` }]
                }]
            })
        });

        if (!res.ok) throw new Error("Gemini API request failed");
        
        const data = await res.json();
        const fullText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        // Extract Coords
        const aiCoordMatch = fullText.match(/\[COORDS:\s*(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)\]/);
        if (aiCoordMatch) {
            const lat = parseFloat(aiCoordMatch[1]);
            const lon = parseFloat(aiCoordMatch[3]);
            setCustomFlyTo({ lat, lon });
            setSearchMarkerPos({ lat, lon, label: geoQuery });
        } else {
            console.warn("No coordinates found for query");
        }

    } catch (err) {
        console.error(err);
    } finally {
        setIsGeoSearching(false);
    }
  };
  
  // Right-Click Context Menu Logic
  const handleContextMenu = async (e: L.LeafletMouseEvent) => {
      // If measuring, right click does nothing or cancels last point (optional, but preventing default here)
      if (isMeasuring) return;

      if (clickedPos) {
          // Toggle OFF if a marker is already there
          setClickedPos(null);
          setLocationName(null);
      } else {
          // Toggle ON
          setClickedPos({ lat: e.latlng.lat, lon: e.latlng.lng });
          setClickPopupOffset({ x: 0, y: 0 }); // Reset drag position
          setSearchMarkerPos(null); // Clear other markers
          
          // Auto-fetch name
          setLocationName("Fetching location name...");
          try {
             const apiKey = process.env.API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
             if (!apiKey) {
                setLocationName("API Key Missing");
                return;
             }
             const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     contents: [{
                         parts: [{ text: `What is the name of the place at coordinates ${e.latlng.lat}, ${e.latlng.lng}? Return ONLY the location name (City, Country or Region).` }]
                     }]
                 })
             });
             const data = await res.json();
             const fullText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
             setLocationName(fullText.trim() || 'Unknown Location');
          } catch(err) {
              setLocationName("Unknown Location");
          }
      }
  };

  const handleMapClick = (e: L.LeafletMouseEvent) => {
    if (isMeasuring) {
        setMeasurePoints(prev => [...prev, e.latlng]);
    } else {
        // Normal click logic (optional: clear marker on normal click if desired, but user asked for right-click toggle)
        // setClickedPos({ lat: e.latlng.lat, lon: e.latlng.lng });
        setSearchMarkerPos(null);
    }
  };

  // Measurement distance calculation
  const calculateTotalDistance = useMemo(() => {
      if (measurePoints.length < 2) return 0;
      let totalDist = 0;
      for (let i = 0; i < measurePoints.length - 1; i++) {
          totalDist += measurePoints[i].distanceTo(measurePoints[i+1]);
      }
      return totalDist;
  }, [measurePoints]);
  
  const formatDistance = (meters: number) => {
      if (meters < 1000) return `${Math.round(meters)} m`;
      return `${(meters / 1000).toFixed(2)} km`;
  };

  // Find position to fly to
  const flyToPos = useMemo(() => {
      // Only fly if exactly one is selected
      if (selectedTransmitterIds.length === 1) {
          const pos = latestPositions.find(p => p.transmitter_id === selectedTransmitterIds[0]);
          if (pos) return pos;
      }
      return null;
  }, [selectedTransmitterIds, latestPositions]);

  // Drag Event Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Handle Legend Drag
      if (isDraggingLegend) {
          const dx = e.clientX - dragStartRef.current.x;
          const dy = e.clientY - dragStartRef.current.y;
          setLegendOffset({
            x: initialOffsetRef.current.x + dx,
            y: initialOffsetRef.current.y + dy
          });
      }
      
      // Handle Click Popup Drag
      if (isDraggingClickPopup) {
          const dx = e.clientX - clickPopupStartRef.current.x;
          const dy = e.clientY - clickPopupStartRef.current.y;
          setClickPopupOffset({
            x: clickPopupInitialOffsetRef.current.x + dx,
            y: clickPopupInitialOffsetRef.current.y + dy
          });
      }

      // Handle Measure Tool Drag
      if (isDraggingMeasureTool) {
          const dx = e.clientX - measureToolDragStartRef.current.x;
          const dy = e.clientY - measureToolDragStartRef.current.y;
          setMeasureToolOffset({
            x: measureToolInitialOffsetRef.current.x + dx,
            y: measureToolInitialOffsetRef.current.y + dy
          });
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLegend(false);
      setIsDraggingClickPopup(false);
      setIsDraggingMeasureTool(false);
    };

    if (isDraggingLegend || isDraggingClickPopup || isDraggingMeasureTool) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLegend, isDraggingClickPopup, isDraggingMeasureTool]);

  // Fullscreen Event Listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      // Force Leaflet to recalculate size after entering/exiting fullscreen
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleLegendMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); 
    e.stopPropagation();
    setIsDraggingLegend(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialOffsetRef.current = { ...legendOffset };
  };
  
  const handleClickPopupMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); 
    e.stopPropagation();
    setIsDraggingClickPopup(true);
    clickPopupStartRef.current = { x: e.clientX, y: e.clientY };
    clickPopupInitialOffsetRef.current = { ...clickPopupOffset };
  };

  const handleMeasureToolMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); 
    e.stopPropagation();
    setIsDraggingMeasureTool(true);
    measureToolDragStartRef.current = { x: e.clientX, y: e.clientY };
    measureToolInitialOffsetRef.current = { ...measureToolOffset };
  };

  const closeAllDropdowns = () => {
    setLayerOpen(false);
    setWeatherOpen(false);
    setStatusDropdownOpen(false);
    setHistoryOpen(false);
    setTempPopup(null); 
    setIsSearchFocused(false);
  };

  const handleWeatherClick = async (e: L.LeafletMouseEvent) => {
      // If measuring, don't allow weather clicks
      if (isMeasuring) return;

      try {
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${e.latlng.lat}&lon=${e.latlng.lng}&units=metric&appid=${WEATHER_API_KEY}`
        );
        const data = await response.json();
        if (data.main) {
          setTempPopup({
            lat: e.latlng.lat,
            lon: e.latlng.lng,
            temp: data.main.temp,
            description: data.weather[0]?.description || 'Unknown'
          });
        }
      } catch (error) {
        console.error("Error fetching weather:", error);
      }
  };

  const getTileLayer = (layerId: string) => {
    switch(layerId) {
      case 'roadmap': return <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />;
      case 'google_roadmap': return <TileLayer url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" attribution='&copy; Google' />;
      case 'google_hybrid': return <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution='&copy; Google' />;
      case 'scienceterrain': return <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution='&copy; Esri' />;
      case 'maptiler_outdoor': return <TileLayer url="https://api.maptiler.com/maps/satellite/{z}/{x}/{y}.jpg?key=wSEj7Jfw4drYYrF3X294" attribution='&copy; MapTiler' />;
      default: return <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution='&copy; Google' />;
    }
  };

  const layers = [
    { id: 'google_roadmap', name: 'Google Maps' },
    { id: 'google_hybrid', name: 'Google Satellite' },
    { id: 'maptiler_outdoor', name: 'MapTiler Outdoor' },
    { id: 'roadmap', name: 'OpenStreetMap' },
    { id: 'scienceterrain', name: 'Satellite Imagery' },
  ];
  
  const weatherLayers = [
    { id: 'none', name: 'None' },
    { id: 'clouds_new', name: 'Clouds' },
    { id: 'precipitation_new', name: 'Precipitation' },
    { id: 'temp_new', name: 'Temperature' },
    { id: 'wind_new', name: 'Wind Speed' },
  ];

  const weatherOptions = [
    { value: "temp", label: "Temperature", layerId: "temp_new" },
    { value: "wind", label: "Wind", layerId: "wind_new" },
    { value: "clouds", label: "Clouds", layerId: "clouds_new" },
    { value: "rain", label: "Precipitation", layerId: "precipitation_new" },
    { value: "pressure", label: "Pressure", layerId: "pressure_new" },
  ];

  const renderTrackingMap = () => (
    <div className="relative w-full h-full" style={{ height: '100%', width: '100%', minHeight: '400px' }}>
        <MapContainer 
            center={[36.0, 59.0]} 
            zoom={4} 
            minZoom={3}
            maxBounds={[[-90, -180], [90, 180]]}
            className={`w-full h-full z-0 ${isMeasuring ? 'cursor-crosshair' : ''}`}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
        >
            <MapController selectedPos={flyToPos} customFlyTo={customFlyTo} />
            
            <MapEventsHandler 
                closeDropdowns={closeAllDropdowns} 
                onWeatherClick={handleWeatherClick}
                activeWeatherLayer={activeWeatherLayer}
                onMapClick={handleMapClick}
                onContextMenu={handleContextMenu}
            />
            
            {getTileLayer(activeLayer)}
            
            {showLabels && (
                 <TileLayer 
                    url="https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}" 
                    attribution="&copy; Google"
                    zIndex={500}
                 />
            )}

            {activeWeatherLayer !== 'none' && (
                <TileLayer
                    url={`https://tile.openweathermap.org/map/${activeWeatherLayer}/{z}/{x}/{y}.png?appid=${WEATHER_API_KEY}`}
                    attribution='&copy; OpenWeatherMap'
                    zIndex={600}
                    className="filter contrast-150 saturate-[3] brightness-110"
                />
            )}

            {/* GEE Satellite Layers */}
            {activeGeeLayer === 'ndvi' && geeNdviTileUrl && (
                <TileLayer url={geeNdviTileUrl} zIndex={400} />
            )}
            {activeGeeLayer === 'savi' && geeSaviTileUrl && (
                <TileLayer url={geeSaviTileUrl} zIndex={400} />
            )}
            {activeGeeLayer === 'lst' && geeLstTileUrl && (
                <TileLayer url={geeLstTileUrl} zIndex={400} />
            )}
            
            {/* Historical Tracks */}
            {showHistory && historyPaths.map((hp) => (
                <React.Fragment key={hp.id}>
                    {/* The line connecting all points */}
                    <Polyline 
                        positions={hp.path.map(p => [p.lat, p.lon])} 
                        pathOptions={{ color: hp.color, weight: 3, opacity: 0.6 }} 
                    />
                    
                    {/* Dots for every historical fix */}
                    {hp.path.map((point, idx) => (
                         <HistoricalMarker
                            key={`${hp.id}-${idx}`}
                            point={point}
                            pttId={hp.id}
                            color={hp.color}
                            timeZone={timeZone}
                         />
                    ))}
                </React.Fragment>
            ))}
            
            <ZoomControl position="bottomright" />
            <ScaleControl position="bottomleft" />

            {/* Bird Markers (LATEST POSITIONS ONLY) */}
            {latestPositions.map((pos) => {
                const transmitter = transmitters.find(t => String(t.platform_id) === String(pos.transmitter_id));
                const bird = birds.find(b => b.id === transmitter?.bird_id);
                
                return (
                    <TransmitterMarker 
                        key={pos.id} 
                        pos={pos}
                        transmitter={transmitter}
                        bird={bird}
                        timeZone={timeZone}
                        setSelectedTransmitterIds={setSelectedTransmitterIds}
                        setShowHistory={setShowHistory}
                        setNavTarget={setNavTarget}
                        isTrackingUser={isTrackingUser}
                    />
                );
            })}


            {/* User GPS Location & Navigation Line */}
            {userLocation && (
                <>
                    <Marker 
                        position={[userLocation.lat, userLocation.lon]}
                        icon={L.divIcon({
                            className: 'bg-transparent',
                            html: `<div class="w-5 h-5 bg-blue-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-pulse">
                                     <div class="w-2 h-2 bg-white rounded-full"></div>
                                   </div>`,
                            iconSize: [20, 20],
                            iconAnchor: [10, 10]
                        })}
                        zIndexOffset={2000}
                    >
                        <Popup>Your Location</Popup>
                    </Marker>
                    {userLocation.accuracy && (
                        <CircleMarker 
                            center={[userLocation.lat, userLocation.lon]} 
                            radius={Math.min(userLocation.accuracy / 2, 100)} 
                            pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1 }} 
                        />
                    )}
                    {navTarget && (
                        <>
                            <Polyline 
                                positions={[[userLocation.lat, userLocation.lon], [navTarget.lat, navTarget.lon]]}
                                pathOptions={{ color: '#10b981', weight: 3, dashArray: '10, 10', opacity: 0.8 }}
                            />
                            <Marker 
                                position={[(userLocation.lat + navTarget.lat)/2, (userLocation.lon + navTarget.lon)/2]}
                                icon={L.divIcon({ className: 'bg-transparent', html: '<div></div>' })}
                            >
                                <Tooltip permanent direction="center" className="!bg-emerald-600 !text-white !border-0 !rounded-lg !px-2 !py-1 !font-bold !shadow-lg">
                                    {formatDistance((() => {
                                        const p1 = L.latLng(userLocation.lat, userLocation.lon);
                                        const p2 = L.latLng(navTarget.lat, navTarget.lon);
                                        return p1.distanceTo(p2);
                                    })())}
                                </Tooltip>
                            </Marker>
                        </>
                    )}
                </>
            )}

            {/* Measurement Tool Drawing */}
            {isMeasuring && measurePoints.length > 0 && (
                <>
                    <Polyline 
                        positions={measurePoints}
                        pathOptions={{ color: '#eab308', weight: 3, dashArray: '8, 8', opacity: 0.8 }}
                    />
                    {measurePoints.map((point, idx) => (
                        <Marker 
                            key={`measure-${idx}`}
                            position={point}
                            icon={idx === measurePoints.length - 1 ? measureEndIcon : measureDotIcon}
                            zIndexOffset={1000}
                        >
                            {idx === measurePoints.length - 1 && measurePoints.length > 1 && (
                                <Tooltip permanent direction="right" offset={[10, 0]} className="!bg-slate-900 !text-white !border-0 !rounded-md !px-2 !py-1 !font-bold !shadow-md">
                                    {formatDistance(calculateTotalDistance)}
                                </Tooltip>
                            )}
                        </Marker>
                    ))}
                </>
            )}

            {/* Search Result Marker */}
            {searchMarkerPos && (
                <Marker 
                    ref={searchMarkerRef}
                    position={[searchMarkerPos.lat, searchMarkerPos.lon]}
                    icon={blueIcon}
                    zIndexOffset={1000} // Ensure it's on top
                >
                    <Popup>
                        <div className="p-1 text-center" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>
                            <div className="font-bold text-blue-700 text-sm mb-1">{searchMarkerPos.label}</div>
                            <div className="text-xs text-gray-500">{searchMarkerPos.lat?.toFixed(5)}, {searchMarkerPos.lon?.toFixed(5)}</div>
                        </div>
                    </Popup>
                </Marker>
            )}

            {/* User Click Marker (Without internal Popup) */}
            {clickedPos && !isMeasuring && (
                <Marker
                    ref={clickMarkerRef}
                    position={[clickedPos.lat, clickedPos.lon]}
                    icon={targetIcon}
                    zIndexOffset={999}
                />
            )}

            {/* Weather Popup */}
            {tempPopup && (
                <Popup position={[tempPopup.lat, tempPopup.lon]}>
                    <div 
                        onClick={(e) => {
                            e.stopPropagation(); 
                            setTempPopup(null);
                        }}
                        className="text-center cursor-pointer hover:bg-gray-50 transition-colors rounded p-1" 
                        title="Click to close"
                        style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                    >
                        <div className="text-xs text-gray-500 font-medium uppercase mb-1">{tempPopup.description}</div>
                        <div className={`text-3xl font-bold ${
                            tempPopup.temp > 30 ? 'text-red-500' : 
                            tempPopup.temp > 20 ? 'text-orange-500' : 
                            tempPopup.temp > 10 ? 'text-brand-500' : 'text-blue-500'
                        }`}>
                            {Math.round(tempPopup.temp)}°C
                        </div>
                    </div>
                </Popup>
            )}
        </MapContainer>

        {/* Custom Draggable Bottom Popup for Right-Click Selection */}
        {clickedPos && !isMeasuring && (
             <div 
                className="absolute z-[500] bottom-10 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden flex flex-col min-w-[280px]"
                style={{ 
                    transform: `translate(calc(-50% + ${clickPopupOffset.x}px), ${clickPopupOffset.y}px)`,
                    cursor: isDraggingClickPopup ? 'grabbing' : 'default'
                }}
             >
                 <div 
                    className="p-2 bg-blue-50 border-b border-blue-100 flex justify-between items-center cursor-grab active:cursor-grabbing select-none"
                    onMouseDown={handleClickPopupMouseDown}
                 >
                     <div className="flex items-center gap-2">
                         <Crosshair size={14} className="text-blue-600" />
                         <span className="text-xs font-bold text-blue-900 uppercase">Selected Location</span>
                     </div>
                     <div className="flex items-center gap-2">
                         <GripHorizontal size={14} className="text-blue-300" />
                         <button onClick={() => setClickedPos(null)} className="text-blue-400 hover:text-blue-600">
                             <X size={14} />
                         </button>
                     </div>
                 </div>
                 
                 <div className="p-3 bg-white space-y-3">
                     {/* Location Name */}
                     <div className="text-center border-b border-gray-50 pb-2">
                         <h3 className="font-bold text-gray-800 text-sm leading-tight" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>
                            {locationName || "Unidentified Location"}
                         </h3>
                         {locationName === "Fetching location name..." && <Loader2 size={12} className="animate-spin inline-block ml-1 text-blue-500" />}
                     </div>

                     {/* Coordinates */}
                     {(() => {
                        const coords = formatCoordinateSystems(clickedPos.lat, clickedPos.lon);
                        return (
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center bg-gray-50 px-2 py-1 rounded">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">HDD</span>
                                    <span className="text-[13px] font-bold text-slate-700 tracking-wide" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{coords.HDD}</span>
                                </div>
                                <div className="flex justify-between items-center bg-gray-50 px-2 py-1 rounded">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">HDMM</span>
                                    <span className="text-[13px] font-bold text-slate-700 tracking-wide" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{coords.HDMM}</span>
                                </div>
                                <div className="flex justify-between items-center bg-gray-50 px-2 py-1 rounded">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase">HDMS</span>
                                    <span className="text-[13px] font-bold text-slate-700 tracking-wide" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>{coords.HDMS}</span>
                                </div>
                            </div>
                        );
                     })()}
                 </div>
             </div>
        )}

        {/* Measurement Tool Overlay Controls */}
        {isMeasuring && (
            <div 
                className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-3 bg-slate-900/90 backdrop-blur text-white px-4 py-2 rounded-full shadow-xl border border-slate-700 cursor-grab active:cursor-grabbing select-none animate-in fade-in slide-in-from-bottom-4"
                style={{ 
                    transform: `translate(calc(-50% + ${measureToolOffset.x}px), ${measureToolOffset.y}px)`
                }}
                onMouseDown={handleMeasureToolMouseDown}
            >
                 <div className="flex items-center gap-2 text-yellow-400">
                      <Ruler size={18} />
                      <span className="text-sm font-bold whitespace-nowrap">Measurement Mode</span>
                 </div>
                 
                 <div className="h-5 w-px bg-slate-600 mx-1"></div>
                 
                 <div className="text-sm font-mono font-bold min-w-[60px] text-center">
                      {formatDistance(calculateTotalDistance)}
                 </div>

                 <div className="h-5 w-px bg-slate-600 mx-1"></div>

                 <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                      <button 
                        onClick={() => setMeasurePoints([])}
                        className="p-1.5 hover:bg-slate-700 rounded-full text-gray-400 hover:text-white transition-colors"
                        title="Clear Points"
                        disabled={measurePoints.length === 0}
                      >
                         <Trash2 size={16} />
                      </button>
                      <button 
                        onClick={() => { setIsMeasuring(false); setMeasurePoints([]); }}
                        className="p-1.5 hover:bg-red-900/50 rounded-full text-red-400 hover:text-red-300 transition-colors"
                        title="Exit Measurement Mode"
                      >
                         <X size={18} />
                      </button>
                 </div>
            </div>
        )}

        {/* Smart Geo-Search Bar (Top Center) */}
        {!isMeasuring && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[400] flex flex-col items-center">
             <div className="relative group shadow-lg rounded-xl">
                 <form 
                    onSubmit={handleGeoSearch}
                    className="flex items-center bg-white rounded-xl border border-gray-200 transition-all duration-200 w-80 focus-within:w-96 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent overflow-hidden"
                 >
                     <Globe className="ml-3 text-blue-500 flex-shrink-0" size={18} />
                     <input 
                         type="text" 
                         value={geoQuery}
                         onChange={(e) => setGeoQuery(e.target.value)}
                         placeholder="Search Google Maps & Info..."
                         className="w-full py-2.5 px-3 text-sm bg-transparent border-none focus:ring-0 outline-none text-gray-800 placeholder-gray-400"
                     />
                     <button 
                         type="submit"
                         disabled={isGeoSearching || !geoQuery.trim()}
                         className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 transition-colors disabled:bg-gray-300"
                     >
                        {isGeoSearching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
                     </button>
                 </form>
             </div>
        </div>
        )}

        {/* Map Controls (Left) */}
        <div className="absolute top-4 left-4 flex flex-col gap-2 z-[500]">
            {/* Layer Control */}
            <div className="relative">
                <button 
                    onClick={(e) => { e.stopPropagation(); closeAllDropdowns(); setLayerOpen(!layerOpen); }}
                    className={`p-2.5 bg-white rounded-lg shadow-md hover:bg-brand-50 transition-colors ${layerOpen ? 'text-brand-600 bg-brand-50' : 'text-gray-700'}`}
                    title="Map Layers"
                >
                    <Layers size={20} />
                </button>
                {layerOpen && (
                    <Draggable cancel="button, input, select, label">
                    <div className="absolute top-0 left-14 bg-white p-4 rounded-xl shadow-xl w-56 border border-gray-100 animate-in fade-in slide-in-from-left-2 cursor-move" onClick={(e) => e.stopPropagation()} style={{ zIndex: 1000, pointerEvents: 'auto' }}>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1"><GripHorizontal size={14} className="text-gray-300"/> Map Layers</h4>
                        <div className="space-y-1 mb-4">
                            {layers.map(layer => (
                                <button
                                    key={layer.id}
                                    onClick={() => { setActiveLayer(layer.id); }}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between ${
                                        activeLayer === layer.id 
                                            ? 'bg-brand-50 text-brand-700 font-medium' 
                                            : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {layer.name}
                                    {activeLayer === layer.id && <CheckCircle2 size={14} className="text-brand-500" />}
                                </button>
                            ))}
                        </div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 pt-3 border-t border-gray-100">Overlays</h4>
                        <div className="space-y-2">
                             <label className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-50 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={showLabels}
                                    onChange={(e) => setShowLabels(e.target.checked)}
                                    className="rounded text-brand-500 focus:ring-brand-500" 
                                />
                                <span className="text-sm text-gray-700">Google Labels</span>
                            </label>
                        </div>

                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 pt-3 border-t border-gray-100">GEE Satellite Layers</h4>
                        <div className="flex gap-2">
                            {(['ndvi', 'savi', 'lst'] as const).map(layer => (
                                <button
                                    key={layer}
                                    onClick={() => {
                                        if (activeGeeLayer === layer) {
                                            setActiveGeeLayer(null);
                                        } else {
                                            setActiveGeeLayer(layer);
                                        }
                                    }}
                                    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wide rounded-md border transition-all flex items-center justify-center gap-1 ${
                                        activeGeeLayer === layer
                                        ? 'bg-brand-50 text-brand-700 border-brand-300'
                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    {layer === 'ndvi' && <Satellite size={12} />}
                                    {layer === 'savi' && <Satellite size={12} />}
                                    {layer === 'lst' && <ThermometerSun size={12} />}
                                    {layer.toUpperCase()}
                                </button>
                            ))}
                        </div>
                     </div>
                    </Draggable>
                )}
            </div>

            {/* Weather Control */}
            <div className="relative">
                <button 
                    onClick={(e) => { e.stopPropagation(); closeAllDropdowns(); setWeatherOpen(!weatherOpen); }}
                    className={`p-2.5 bg-white rounded-lg shadow-md hover:bg-brand-50 transition-colors ${weatherOpen ? 'text-brand-600 bg-brand-50' : 'text-gray-700'}`}
                    title="Weather Overlays"
                >
                    <CloudSun size={20} />
                </button>
                 {weatherOpen && (
                    <Draggable cancel="button, input, select, label">
                    <div className="absolute top-0 left-14 bg-white p-4 rounded-xl shadow-xl w-56 border border-gray-100 animate-in fade-in slide-in-from-left-2 cursor-move" onClick={(e) => e.stopPropagation()} style={{ zIndex: 1000, pointerEvents: 'auto' }}>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1"><GripHorizontal size={14} className="text-gray-300"/> Weather Layers</h4>
                         <div className="space-y-1">
                            {weatherLayers.map(layer => (
                                <button
                                    key={layer.id}
                                    onClick={() => setActiveWeatherLayer(layer.id)}
                                    className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between ${
                                        activeWeatherLayer === layer.id 
                                            ? 'bg-brand-50 text-brand-700 font-medium' 
                                            : 'text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    {layer.name}
                                    {activeWeatherLayer === layer.id && <CheckCircle2 size={14} className="text-brand-500" />}
                                </button>
                            ))}
                        </div>
                     </div>
                    </Draggable>
                 )}
            </div>

            {/* History Control */}
            <div className="relative">
                <button 
                    onClick={(e) => { e.stopPropagation(); closeAllDropdowns(); setHistoryOpen(!historyOpen); }}
                    className={`p-2.5 bg-white rounded-lg shadow-md hover:bg-brand-50 transition-colors ${historyOpen ? 'text-brand-600 bg-brand-50' : 'text-gray-700'}`}
                    title="Historical Tracks"
                >
                    <History size={20} />
                </button>
                 {historyOpen && (
                    <div
                      className="absolute bg-white rounded-xl shadow-xl w-72 border border-gray-100 animate-in fade-in slide-in-from-left-2 flex flex-col overflow-hidden"
                      style={{ zIndex: 1000, pointerEvents: 'auto', top: historyPopupPos.y, left: 56 + historyPopupPos.x }}
                      onClick={(e) => e.stopPropagation()}
                    >
                        {/* Drag Handle Header */}
                        <div
                          className="flex items-center justify-between p-4 pb-3 bg-white border-b border-gray-50 cursor-move flex-shrink-0 select-none"
                          onMouseDown={handleHistoryMouseDown}
                        >
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1"><GripHorizontal size={14} className="text-gray-300"/> Track History</h4>
                            {isHistoryLoading && <Loader2 size={14} className="text-brand-500 animate-spin" />}
                        </div>
                        
                        {/* Scrollable Content */}
                        <div className="p-4 pt-3 overflow-y-auto custom-scrollbar max-h-[60vh]">
                        {selectedTransmitterIds.length === 0 ? (
                            <p className="text-xs text-gray-500 italic">Please select a PTT to view history.</p>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
                                    <span className="text-xs font-semibold text-gray-700">Show Tracks</span>
                                    <button 
                                        onClick={() => setShowHistory(!showHistory)}
                                        className={`w-9 h-5 rounded-full transition-colors relative ${showHistory ? 'bg-brand-600' : 'bg-gray-300'}`}
                                    >
                                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${showHistory ? 'translate-x-4' : ''}`} />
                                    </button>
                                </div>
                                
                                {showHistory && (
                                    <div className="space-y-3 pt-2">
                                        <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                            <button 
                                                onClick={() => setHistoryMode('preset')}
                                                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${historyMode === 'preset' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500'}`}
                                            >
                                                Preset
                                            </button>
                                            <button 
                                                onClick={() => setHistoryMode('custom')}
                                                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${historyMode === 'custom' ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500'}`}
                                            >
                                                Custom Date
                                            </button>
                                        </div>

                                        {historyMode === 'preset' ? (
                                            <div className="space-y-1">
                                                {['24h', '7d', '30d', '1y', '2y'].map(range => (
                                                    <button
                                                        key={range}
                                                        onClick={() => setHistoryPreset(range as any)}
                                                        className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between ${
                                                            historyPreset === range 
                                                                ? 'bg-brand-50 text-brand-700 font-medium' 
                                                                : 'text-gray-600 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {range === '24h' ? 'Last 24 Hours' : range === '7d' ? 'Last 7 Days' : range === '30d' ? 'Last 30 Days' : range === '1y' ? 'Last 1 Year' : 'Last 2 Years'}
                                                        {historyPreset === range && <CheckCircle2 size={14} className="text-brand-500" />}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="space-y-3 p-2 bg-gray-50 rounded-lg">
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Start Date</label>
                                                    <input 
                                                        type="date"
                                                        value={customDates.start}
                                                        onChange={(e) => setCustomDates({...customDates, start: e.target.value})}
                                                        className="w-full text-xs p-2 border border-gray-200 rounded outline-none focus:border-brand-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">End Date</label>
                                                    <input 
                                                        type="date"
                                                        value={customDates.end}
                                                        onChange={(e) => setCustomDates({...customDates, end: e.target.value})}
                                                        className="w-full text-xs p-2 border border-gray-200 rounded outline-none focus:border-brand-500"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* GPS / Doppler Filter */}
                                        <div className="pt-2 border-t border-gray-100">
                                            <label className="text-[10px] uppercase font-bold text-gray-400 mb-2 block">Location Type</label>
                                            <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                                {['All', 'GPS', 'Doppler'].map(type => (
                                                    <button 
                                                        key={type}
                                                        onClick={() => setHistoryFixType(type as any)}
                                                        className={`flex-1 text-[10px] font-bold py-1.5 rounded-md transition-all uppercase ${historyFixType === type ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500'}`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        </div>
                    </div>
                 )}
            </div>

            {/* Measurement Tool Toggle */}
            <div className="relative">
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        closeAllDropdowns();
                        setIsMeasuring(!isMeasuring);
                        if (!isMeasuring) setMeasurePoints([]); // Clear points when starting new
                    }}
                    className={`p-2.5 bg-white rounded-lg shadow-md hover:bg-brand-50 transition-colors ${isMeasuring ? 'text-yellow-600 bg-yellow-50 ring-2 ring-yellow-500' : 'text-gray-700'}`}
                    title="Distance Measurement Tool"
                >
                    <Ruler size={20} />
                </button>
            </div>

            {/* GPS Navigation Toggle */}
            <div className="relative">
                <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        closeAllDropdowns();
                        toggleUserTracking();
                    }}
                    className={`p-2.5 bg-white rounded-lg shadow-md hover:bg-brand-50 transition-colors ${isTrackingUser ? 'text-blue-600 bg-blue-50 ring-2 ring-blue-500' : 'text-gray-700'}`}
                    title="Toggle My GPS Position & Navigation"
                >
                    <Crosshair size={20} />
                </button>
            </div>

            <button 
                onClick={toggleFullscreen}
                className={`p-2.5 bg-white rounded-lg shadow-md hover:bg-brand-50 transition-colors ${isFullscreen ? 'text-brand-600' : 'text-gray-700'}`}
                title={isFullscreen ? "Exit Fullscreen" : "Maximize Map"}
            >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
        </div>

        {/* Search Bar */}
        <div className="absolute top-4 left-16 z-[400]">
            <div className="relative group">
                <div className={`flex items-center bg-white rounded-lg shadow-md border border-gray-200 transition-all duration-200 ${isSearchFocused || searchQuery ? 'w-64 ring-2 ring-brand-500 border-transparent' : 'w-56'}`}>
                    <Search size={18} className="ml-3 text-gray-400 flex-shrink-0" />
                    <input 
                        type="text" 
                        placeholder={selectedTransmitterIds.length > 0 ? `${selectedTransmitterIds.length} PTTs Selected` : "Search PTT ID..."}
                        value={searchQuery}
                        onFocus={() => setIsSearchFocused(true)}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full py-2.5 px-2 text-sm bg-transparent border-none focus:ring-0 outline-none text-gray-700 placeholder-gray-400"
                    />
                    {selectedTransmitterIds.length > 0 && (
                        <button 
                            onClick={clearSelection}
                            className="mr-2 text-gray-400 hover:text-red-500 flex-shrink-0"
                            title="Clear All Selections"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>

                {isSearchFocused && (
                    <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 max-h-[400px] overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2">
                        <div className="p-2 border-b border-gray-100 flex gap-2 bg-gray-50">
                            <button 
                                onClick={selectAllFiltered}
                                className="flex-1 px-2 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded transition-colors"
                            >
                                Select All Filtered
                            </button>
                            <button 
                                onClick={clearSelection}
                                className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 rounded transition-colors"
                            >
                                Clear Selection
                            </button>
                             <button 
                                onClick={() => setIsSearchFocused(false)}
                                className="px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 rounded transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="overflow-y-auto flex-1">
                            {searchResults.length > 0 ? (
                                searchResults.map(t => {
                                    const bird = birds.find(b => b.id === t.bird_id);
                                    const isSelected = selectedTransmitterIds.includes(String(t.platform_id || ''));
                                    return (
                                        <div
                                            key={t.id}
                                            onClick={() => handleSearchToggle(String(t.platform_id || ''))}
                                            className={`w-full text-left px-4 py-3 border-b border-gray-50 last:border-none flex items-center justify-between cursor-pointer transition-colors ${isSelected ? 'bg-brand-50/50' : 'hover:bg-gray-50'}`}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-brand-500 border-brand-500' : 'border-gray-300 bg-white'}`}>
                                                    {isSelected && <Check size={12} className="text-white" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-bold text-gray-900 truncate">PTT {t.platform_id}</div>
                                                    <div className="text-xs text-gray-500 truncate">{bird?.ring_id || 'Unassigned'}</div>
                                                </div>
                                            </div>
                                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.status === 'active' ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="px-4 py-8 text-sm text-gray-500 text-center italic">No transmitters found</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Status Filter Dropdown */}
        <div className="absolute top-4 right-4 z-[400]">
             <div className="relative">
                <button
                    onClick={(e) => { e.stopPropagation(); closeAllDropdowns(); setStatusDropdownOpen(!statusDropdownOpen); }}
                    className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-md hover:bg-gray-50 border border-gray-200 transition-colors"
                >
                    <div className={`w-2.5 h-2.5 rounded-full ${
                        selectedStatus === 'active' ? 'bg-green-500' : 
                        selectedStatus === 'inactive' ? 'bg-red-500' : 
                        selectedStatus === 'maintenance' ? 'bg-orange-500' : 
                        selectedStatus === 'lost' ? 'bg-orange-500' : 'bg-gray-900'
                    }`} />
                    <span className="text-sm font-medium text-gray-700">
                        {selectedStatus === 'all' ? 'All Statuses' : selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1)}
                    </span>
                    <ChevronDown size={16} className="text-gray-400" />
                </button>
                
                {statusDropdownOpen && (
                    <div 
                        className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-2" 
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                    >
                        {[
                            { id: 'all', label: 'All Statuses', color: 'bg-gray-900' },
                            { id: 'active', label: 'Active', color: 'bg-green-500' },
                            { id: 'maintenance', label: 'Lost/Maint.', color: 'bg-orange-500' },
                            { id: 'inactive', label: 'Inactive', color: 'bg-red-500' },
                            { id: 'lost', label: 'Lost', color: 'bg-orange-500' }
                        ].map(option => (
                            <button
                                key={option.id}
                                onClick={() => {
                                    setSelectedStatus(option.id);
                                    setStatusDropdownOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 ${selectedStatus === option.id ? 'bg-brand-50 text-brand-900 font-medium' : 'text-gray-600'}`}
                            >
                                <div className={`w-2 h-2 rounded-full ${option.color}`} />
                                {option.label}
                            </button>
                        ))}
                    </div>
                )}
             </div>
        </div>

        {/* Legend */}
        {activeWeatherLayer === 'temp_new' && (
             <div 
                className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur rounded-xl shadow-xl border border-gray-200 z-[400] w-96 select-none"
                style={{ 
                    transform: `translate(calc(-50% + ${legendOffset.x}px), ${legendOffset.y}px)`,
                    cursor: isDraggingLegend ? 'grabbing' : 'grab'
                }}
                onMouseDown={handleLegendMouseDown}
             >
                 <div className="px-4 py-2 flex items-center justify-between border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
                     <div className="flex items-center gap-2 text-xs font-bold text-gray-600">
                        <GripHorizontal size={14} className="text-gray-400" />
                        Temperature (°C)
                     </div>
                 </div>
                 <div className="p-4">
                    <div className="h-6 rounded-md w-full mb-1 shadow-inner border border-gray-100 relative" 
                        style={{ 
                            background: 'linear-gradient(to right, #30123b, #466be3, #28bceb, #32f298, #a4fc3c, #eecf3a, #fb7e21, #d02f05, #7a0403)' 
                        }} 
                    >
                        {/* Ticks for every 5 degrees assuming range -40 to 40 for simplicity mapping to gradient */}
                        {Array.from({length: 17}).map((_, i) => (
                             <div 
                                key={i} 
                                className="absolute bottom-0 h-2 w-px bg-white/50" 
                                style={{ left: `${(i / 16) * 100}%` }}
                             />
                        ))}
                    </div>
                    <div className="flex justify-between text-[10px] font-medium text-gray-500 px-0.5 mt-1">
                        <span>-40</span>
                        <span>-30</span>
                        <span>-20</span>
                        <span>-10</span>
                        <span>0</span>
                        <span>10</span>
                        <span>20</span>
                        <span>30</span>
                        <span>40</span>
                    </div>
                 </div>
             </div>
        )}
    </div>
  );
  
  const renderWeatherMap = () => {
    const centerLat = latestPositions.length > 0 ? latestPositions[0].lat : 24.4539;
    const centerLon = latestPositions.length > 0 ? latestPositions[0].lon : 54.3773;
    const getTransmitterUrl = () => {
      if (latestPositions.length === 0) return '';
      return latestPositions.map(p => `${p.lat},${p.lon}`).join(';');
    };
    const transmitterCoords = getTransmitterUrl();
    const windyUrl = `https://embed.windy.com/embed2.html?lat=${centerLat}&lon=${centerLon}&detailLat=${centerLat}&detailLon=${centerLon}&width=100%&height=100%&zoom=6&level=surface&overlay=${weatherType}&product=ecmwf&menu=&message=&marker=${transmitterCoords || 'true'}&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;

    return (
        <div className="relative w-full h-full">
            <div className="absolute top-0 left-0 right-0 z-[500] bg-white border-b border-gray-200 p-4 flex items-center justify-between shadow-sm">
                 <div className="flex items-center gap-4">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Cloud className="text-brand-500" size={20} />
                        Weather Analysis
                    </h3>
                    <div className="h-6 w-px bg-gray-200" />
                    <div className="flex gap-2">
                         {weatherOptions.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    setWeatherType(opt.value);
                                    setActiveWeatherLayer(opt.layerId);
                                }}
                                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                    weatherType === opt.value 
                                    ? 'bg-brand-500 text-white shadow-md shadow-brand-100' 
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                {opt.label}
                            </button>
                         ))}
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                        <input 
                            type="text" 
                            placeholder="Search location..." 
                            value={searchLocation}
                            onChange={(e) => setSearchLocation(e.target.value)}
                            className="pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-sm w-64 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                        />
                    </div>
                    <button 
                        onClick={toggleFullscreen}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
                    >
                         {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                 </div>
            </div>

            <div className="w-full h-full pt-16 bg-slate-900">
                <iframe
                    src={windyUrl}
                    className="w-full h-full border-none"
                    title="Windy Weather Map"
                />
            </div>
        </div>
    );
  };

  const renderWeatherMap2 = () => {
    const centerLat = latestPositions.length > 0 ? latestPositions[0].lat : 36.0;
    const centerLon = latestPositions.length > 0 ? latestPositions[0].lon : 59.0;
    const meteoblueUrl = `https://www.meteoblue.com/en/weather/maps/widget?apikey=${METEOBLUE_API_KEY}#coords=5/${centerLat}/${centerLon}&map=windAnimation~rainbow~auto~10%20m%20above%20gnd~none`;

    return (
        <div className="relative w-full h-full">
            <div className="absolute top-0 left-0 right-0 z-[500] bg-white border-b border-gray-200 p-4 flex items-center justify-between shadow-sm">
                 <div className="flex items-center gap-4">
                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                        <Satellite className="text-brand-500" size={20} />
                        Satellite Weather (Meteoblue)
                    </h3>
                 </div>
                 <button 
                    onClick={toggleFullscreen}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
                 >
                      {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                 </button>
            </div>
            <div className="w-full h-full pt-16 bg-slate-900">
                <iframe
                    src={meteoblueUrl}
                    className="w-full h-full border-none"
                    title="Meteoblue Weather Map"
                    sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                />
            </div>
        </div>
    );
  };

  return (
    <div className="flex flex-col h-full space-y-4">
        {/* Tab Switcher */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
            <button
                onClick={() => setViewMode('tracking')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                    viewMode === 'tracking' 
                    ? 'bg-white text-brand-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                <MapIcon size={16} className={viewMode === 'tracking' ? 'text-brand-500' : 'text-gray-400'} />
                Live Tracking
            </button>
            <button
                onClick={() => setViewMode('weather')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                    viewMode === 'weather' 
                    ? 'bg-white text-brand-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                <Wind size={16} className={viewMode === 'weather' ? 'text-brand-500' : 'text-gray-400'} />
                Weather Map (Windy)
            </button>
            <button
                onClick={() => setViewMode('weather2')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                    viewMode === 'weather2' 
                    ? 'bg-white text-brand-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                <Satellite size={16} className={viewMode === 'weather2' ? 'text-brand-500' : 'text-gray-400'} />
                Weather Map 2 (Meteoblue)
            </button>
        </div>

        {/* Main Map Area */}
        <div 
            ref={containerRef} 
            className={`flex-1 rounded-xl border border-gray-200 shadow-sm overflow-hidden bg-gray-50 relative group ${isFullscreen ? 'p-0 rounded-none border-none' : ''}`}
        >
            {viewMode === 'tracking' ? renderTrackingMap() : 
             viewMode === 'weather' ? renderWeatherMap() : 
             renderWeatherMap2()}
        </div>
    </div>
  );
};
