import React, { useState, useEffect } from "react";
import { useAppStore } from "../store/appStore";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, Tooltip } from "react-leaflet";
import { Loader2 } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatDateTime } from "../utils/formatting";

// Custom icons
const currentIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// 3 Major Asian Houbara Migration Corridors
const HISTORICAL_CORRIDORS = [
  {
    name: "Central Asian Flyway (Wintering in Arabia/Iran)",
    color: "#10b981", // Emerald Green
    positions: [
      [48.0, 60.0], [45.0, 58.0], [42.0, 56.0], [38.0, 54.0], [34.0, 52.0], [30.0, 48.0], [25.0, 45.0]
    ] as [number, number][]
  },
  {
    name: "South Asian Flyway (Wintering in Pakistan/India)",
    color: "#f59e0b", // Amber Orange
    positions: [
      [47.0, 70.0], [43.0, 68.0], [39.0, 66.0], [35.0, 64.0], [31.0, 66.0], [28.0, 68.0]
    ] as [number, number][]
  },
  {
    name: "East Asian Flyway (Wintering in NW India/Tibet)",
    color: "#3b82f6", // Blue
    positions: [
      [46.0, 85.0], [42.0, 82.0], [38.0, 78.0], [34.0, 75.0], [30.0, 72.0]
    ] as [number, number][]
  }
];

// Helper to fix Leaflet map grey area bug when container resizes
const MapResizer = () => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
};

// Helper to fit bounds
const MapBounds = ({ positions }: { positions: [number, number][] }) => {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [positions, map]);
  return null;
};

export const MigrationPrediction = ({ selectedTransmitterId }: { selectedTransmitterId?: string }) => {
  const { transmitters, positions, timeZone } = useAppStore();
  
  // State
  const [isPredicting, setIsPredicting] = useState(false);

  // Get latest position for each active transmitter, optionally filtered
  const activePositions = transmitters
    .filter(t => t.status === 'active' && (!selectedTransmitterId || t.platform_id === selectedTransmitterId))
    .map(t => {
      const pos = positions
        .filter(p => p.transmitter_id === t.platform_id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      return pos ? { ...pos, transmitter: t } : null;
    })
    .filter(p => p !== null) as any[];

  return (
    <div className="relative w-full h-full">
        {/* Loading Overlay */}
        {isPredicting && (
          <div className="absolute inset-0 z-[1000] bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center">
             <Loader2 className="animate-spin text-brand-600 mb-2" size={48} />
             <p className="text-brand-800 dark:text-brand-200 font-bold animate-pulse">Running AI Prediction Model...</p>
             <p className="text-xs text-gray-500">Analyzing wind patterns & historical corridors</p>
          </div>
        )}

        <MapContainer 
            center={[35.0, 60.0]} 
            zoom={4} 
            className="w-full h-full z-0"
        >
            <MapResizer />
            <TileLayer 
                url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                attribution="&copy; Google"
            />
            
            {/* Historical Corridors */}
            {HISTORICAL_CORRIDORS.map((corridor, idx) => (
                <Polyline 
                    key={idx}
                    positions={corridor.positions}
                    pathOptions={{ 
                        color: corridor.color, 
                        weight: 20, 
                        opacity: 0.2, 
                        lineCap: 'round', 
                        lineJoin: 'round' 
                    }}
                >
                    <Popup>{corridor.name}</Popup>
                </Polyline>
            ))}

            {/* Current Positions */}
            {activePositions.map((pos) => (
                <Marker 
                    key={pos.id}
                    position={[pos.lat, pos.lon]}
                    icon={currentIcon}
                >
                    <Tooltip 
                        permanent 
                        direction="top" 
                        offset={[0, -38]} 
                        className="!bg-transparent !border-0 !shadow-none !p-0 before:!hidden"
                    >
                        <div 
                            className="bg-white text-gray-800 px-2 py-0 rounded-full shadow-md border border-gray-200 text-sm font-bold"
                            style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                        >
                            {pos.transmitter_id}
                        </div>
                    </Tooltip>
                    <Popup>
                        <div className="text-sm font-bold">PTT {pos.transmitter_id}</div>
                        <div className="text-xs">{formatDateTime(pos.timestamp, timeZone)}</div>
                        <div className="text-xs text-gray-500">Lat: {pos.lat.toFixed(3)}, Lon: {pos.lon.toFixed(3)}</div>
                    </Popup>
                </Marker>
            ))}

            {activePositions.length > 0 && (
                <MapBounds positions={activePositions.map(p => [p.lat, p.lon])} />
            )}
        </MapContainer>
    </div>
  );
};
