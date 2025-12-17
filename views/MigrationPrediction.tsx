import React, { useState, useEffect } from "react";
import { useAppStore } from "../store/appStore";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import { Loader2 } from "lucide-react";
import L from "leaflet";
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

// Mock Historical Corridors
const HISTORICAL_CORRIDORS = [
  {
    name: "Central Asian Flyway (Historical)",
    color: "#10b981", 
    positions: [
      [52.0, 55.0], [48.0, 53.0], [42.0, 50.0], [35.0, 48.0], [28.0, 48.0], [24.0, 51.0], 
      [24.0, 56.0], [30.0, 58.0], [38.0, 62.0], [45.0, 65.0], [52.0, 70.0], [55.0, 60.0]
    ] as [number, number][]
  },
  {
    name: "Eastern Flyway (Historical)",
    color: "#f59e0b", 
    positions: [
      [50.0, 75.0], [42.0, 72.0], [35.0, 68.0], [28.0, 62.0], 
      [28.0, 68.0], [35.0, 75.0], [45.0, 80.0], [50.0, 82.0]
    ] as [number, number][]
  }
];

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

export const MigrationPrediction = () => {
  const { transmitters, positions, timeZone } = useAppStore();
  
  // State
  const [isPredicting, setIsPredicting] = useState(false);

  // Get latest position for each active transmitter
  const activePositions = transmitters
    .filter(t => t.status === 'active')
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
