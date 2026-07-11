import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Layers, CircleDot, CheckCircle2, Check, ChevronDown, CloudSun, Search, Maximize, Minimize, Battery, Clock, Map as MapIcon, Wind, History, GripHorizontal, Cloud, X, Satellite, Calendar, ThermometerSun, Radio, Navigation, Globe, MapPin, ExternalLink, Loader2, Sparkles, BrainCircuit, Crosshair, Languages, Ruler, Trash2, Box } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, ScaleControl, useMapEvents, Tooltip, useMap, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { useAppStore } from '../store/appStore';
import ReactMarkdown from 'react-markdown';
import { formatDateTime, formatBattery } from '../utils/formatting';
import { getHistoricalPositions } from '../services/firestoreService';

// MapTiler API key (same key already used for the satellite tile layer below)
const MAPTILER_KEY = 'xdV9unEyhfAV4bVcpkzN';

// The MapTiler SDK is loaded globally via <script> in index.html (UMD build),
// so we access it off `window` rather than importing it as an ES module.
declare global {
  interface Window {
    maptilersdk?: any;
  }
}

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
const LSTPopupContent = ({ lat, lon, timestamp, pttId, color, type, timeZone, onOpen3DModal }: { lat: number, lon: number, timestamp: string, pttId: string, color: string, type?: string, timeZone: string, onOpen3DModal?: (lat: number, lon: number, pttId: string) => void }) => {
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
    <div className="text-center p-1 min-w-[170px]" style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}>
        <div className="flex items-center justify-center gap-1 mb-1">
             <div className="font-bold text-xs" style={{color: color}}>PTT {pttId}</div>
             {type && (
                 <span className={`text-[9px] px-1 rounded ${type === 'GPS' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
                     {type}
                 </span>
             )}
        </div>
        <div className="text-xs font-semibold text-gray-800 border-b border-gray-100 pb-2 mb-2">
            {formatDateTime(timestamp, data.timezone || timeZone)}
            {(data.timezone) && <div className="text-[9px] text-gray-400 font-normal mt-0.5">Local: {data.timezone.replace('_', ' ')}</div>}
        </div>
        
        <div className="flex items-center justify-between text-xs mb-2 bg-gray-50 p-1 rounded">
            <span className="text-gray-500">Location</span>
            <span className="font-mono text-[10px] text-gray-700">{lat?.toFixed(3)}, {lon?.toFixed(3)}</span>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-2.5 border border-orange-200">
            <div className="text-[10px] uppercase font-bold text-orange-800 mb-1 flex items-center justify-center gap-1">
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
                className="flex w-full items-center justify-center gap-1 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-[9px] font-semibold uppercase tracking-wide transition-colors border border-blue-200"
            >
                <Globe size={10} /> Earth
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
    onOpen3DModal: (lat: number, lon: number, pttId: string) => void;
}

// Extracted Marker Component to fix Popup data staleness issue
const TransmitterMarker: React.FC<TransmitterMarkerProps> = ({ 
    pos, 
    transmitter, 
    bird, 
    timeZone, 
    setSelectedTransmitterIds, 
    setShowHistory,
    onOpen3DModal
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
                popupopen: () => setIsOpen(true),
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
    onOpen3DModal: (lat: number, lon: number, pttId: string) => void;
}

// Extracted Component for Historical Points to handle lazy-loading
const HistoricalMarker: React.FC<HistoricalMarkerProps> = ({ 
    point,
    pttId, 
    color, 
    timeZone,
    onOpen3DModal
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
            <Popup closeButton={false}>
                {isOpen && (
                    <LSTPopupContent 
                        lat={point.lat} 
                        lon={point.lon} 
                        timestamp={point.timestamp} 
                        pttId={pttId} 
                        color={color}
                        type={point.type}
                        timeZone={timeZone}
                        onOpen3DModal={onOpen3DModal}
                    />
                )}
            </Popup>
        </CircleMarker>
    );
};

interface ThreeDTerrainModalProps {
    lat: number;
    lon: number;
    pttId?: string;
    onClose: () => void;
}

// Split-screen modal: flat satellite reference (left) + interactive MapTiler 3D terrain (right)
const ThreeDTerrainModal: React.FC<ThreeDTerrainModalProps> = ({ lat, lon, pttId, onClose }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        const sdk = window.maptilersdk;

        if (!sdk) {
            setLoadError(true);
            setIsLoading(false);
            return;
        }
        if (!mapContainerRef.current) return;

        sdk.config.apiKey = MAPTILER_KEY;

        const map = new sdk.Map({
            container: mapContainerRef.current,
            style: sdk.MapStyle.SATELLITE,
            center: [lon, lat],
            zoom: 12.5,
            pitch: 65,
            bearing: -20,
            terrain: true,
            terrainControl: true,
            terrainExaggeration: 1.4,
            navigationControl: true,
        });

        mapInstanceRef.current = map;

        map.on('load', () => {
            setIsLoading(false);
            try {
                new sdk.Marker({ color: '#ef4444' }).setLngLat([lon, lat]).addTo(map);
            } catch {
                // Marker is a non-critical enhancement; ignore if the SDK version differs.
            }
        });

        map.on('error', () => {
            setLoadError(true);
            setIsLoading(false);
        });

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, [lat, lon]);

    // Static 2D satellite image centered on the exact same point, for spatial context
    const staticMapUrl = `https://api.maptiler.com/maps/satellite/static/${lon},${lat},11/640x640.png?key=${MAPTILER_KEY}`;

    return (
        <div
            className="fixed inset-0 z-[2000] bg-black/70 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
                style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-brand-50">
                    <div className="flex items-center gap-2">
                        <Box size={18} className="text-indigo-600" />
                        <h3 className="font-bold text-slate-900 text-sm">
                            3D Terrain View{pttId ? ` — PTT ${pttId}` : ''}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Split-screen body */}
                <div className="relative flex-1 grid grid-cols-1 md:grid-cols-2 bg-slate-900">
                    {/* Left: flat satellite reference */}
                    <div className="relative hidden md:block border-r border-gray-800 overflow-hidden">
                        <img
                            src={staticMapUrl}
                            alt="Satellite reference view"
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-lg" />
                        </div>
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold uppercase tracking-wide">
                            2D Satellite
                        </div>
                    </div>

                    {/* Right: interactive 3D terrain */}
                    <div className="relative w-full h-full">
                        <div ref={mapContainerRef} className="absolute inset-0" />
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold uppercase tracking-wide pointer-events-none">
                            3D Terrain (drag to rotate/tilt)
                        </div>
                        {isLoading && !loadError && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                                <div className="flex flex-col items-center gap-2 text-white">
                                    <Loader2 className="animate-spin" size={28} />
                                    <span className="text-xs font-medium">Loading 3D terrain...</span>
                                </div>
                            </div>
                        )}
                        {loadError && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/90 p-4">
                                <div className="text-center text-white">
                                    <p className="text-sm font-semibold mb-1">3D view unavailable</p>
                                    <p className="text-xs text-gray-300">Couldn't load the MapTiler 3D SDK. Check your connection or API key.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-gray-100 flex justify-between items-center text-[11px] text-gray-400 bg-gray-50">
                    <span>Lat: {lat?.toFixed(5)}</span>
                    <span className="text-gray-300">Powered by MapTiler 3D Terrain</span>
                    <span>Lon: {lon?.toFixed(5)}</span>
                </div>
            </div>
        </div>
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

