import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { Globe, Map, Settings, Navigation, Ruler, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { formatDateTime } from '../utils/formatting';

// Helper to calculate distance between two coords (Haversine formula)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
};

const deg2rad = (deg: number) => {
  return deg * (Math.PI / 180);
};

// Mock function to guess country based on lat (Simplified for demo logic)
const getCountryByLat = (lat: number) => {
    if (lat > 45) return 'Kazakhstan'; // North of 45°
    if (lat > 40) return 'Uzbekistan'; // 40° - 45°
    if (lat > 35) return 'Turkmenistan'; // 35° - 40°
    if (lat > 28) return 'Iran'; // 28° - 35°
    return 'Qatar'; // South of 28°
};

export const GeofenceAlerts = () => {
  const { 
      transmitters, 
      positions, 
      birds,
      setActiveTab, 
      setSelectedTransmitterIds,
      timeZone
  } = useAppStore();
  
  // Configuration State
  const [distanceThreshold, setDistanceThreshold] = useState(50); // km
  const [detectBorders, setDetectBorders] = useState(true);
  const [activeTabState, setActiveTabState] = useState<'active' | 'history'>('active');

  // Handle Navigation to Map
  const handleViewOnMap = (transmitterId: string) => {
      setSelectedTransmitterIds([transmitterId]);
      setActiveTab('Live Tracking');
  };

  // Generate Alerts based on real store data
  const generatedAlerts = useMemo(() => {
    const alerts: any[] = [];
    
    transmitters.forEach(t => {
        const currentPos = positions.find(p => p.transmitter_id === t.platform_id);
        
        // If we have a live position, simulate a "previous" position to check logic
        if (currentPos) {
            // Deterministic simulation based on ID to create consistent "alerts" for specific birds
            // We use the numeric part of the ID to decide if this bird moved recently
            const idNum = parseInt(t.platform_id.slice(-3), 10);
            
            // Simulate 20% of birds having significant movement
            const hasMovedSignificantly = idNum % 5 === 0; 
            
            // Simulate 10% of birds having crossed a border recently
            const hasCrossedBorder = idNum % 7 === 0;

            // 1. Simulate Previous Position
            let prevLat = currentPos.lat;
            let prevLon = currentPos.lon;

            if (hasMovedSignificantly) {
                // Simulate it came from ~60km away
                prevLat -= 0.6; 
                prevLon -= 0.2;
            } else if (hasCrossedBorder) {
                // Force a border crossing scenario based on current location
                // If current is > 45 (Kazakhstan), prev was < 45 (Uzbekistan)
                if (currentPos.lat > 45) prevLat = 44.8;
                else if (currentPos.lat > 40) prevLat = 39.8;
                else if (currentPos.lat > 35) prevLat = 34.8;
                else if (currentPos.lat > 28) prevLat = 27.8;
                else prevLat = 28.5; // Moved south into Qatar
            } else {
                // Normal small movement
                prevLat -= 0.001; 
                prevLon -= 0.001;
            }

            // 2. Distance Logic
            const dist = calculateDistance(prevLat, prevLon, currentPos.lat, currentPos.lon);
            
            if (dist > distanceThreshold) {
                alerts.push({
                    id: `dist-${t.id}`,
                    type: 'distance',
                    transmitter_id: t.platform_id,
                    message: `Moved ${Math.round(dist)}km between fixes`,
                    detail: `Anomaly detected (> ${distanceThreshold}km threshold)`,
                    timestamp: currentPos.timestamp,
                    severity: dist > 150 ? 'critical' : 'warning',
                    location: `${currentPos.lat.toFixed(4)}, ${currentPos.lon.toFixed(4)}`
                });
            }

            // 3. Border Logic
            if (detectBorders) {
                const countryCurrent = getCountryByLat(currentPos.lat);
                const countryPrev = getCountryByLat(prevLat);
                
                if (countryCurrent !== countryPrev) {
                    alerts.push({
                        id: `border-${t.id}`,
                        type: 'border',
                        transmitter_id: t.platform_id,
                        message: `Crossed border: ${countryPrev} ➝ ${countryCurrent}`,
                        detail: 'International boundary detected based on latitude',
                        timestamp: currentPos.timestamp,
                        severity: 'info',
                        location: `${currentPos.lat.toFixed(4)}, ${currentPos.lon.toFixed(4)}`
                    });
                }
            }
        }
    });

    return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [positions, transmitters, distanceThreshold, detectBorders]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Geofence & Movement Alerts</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Monitor border crossings and anomalous distance jumps.</p>
        </div>
        
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm w-80">
            <div className="flex items-center gap-2 text-brand-800 dark:text-brand-400 font-semibold text-sm border-b border-gray-100 dark:border-slate-700 pb-2">
                <Settings size={16} /> Alert Configuration
            </div>
            <div className="space-y-4 pt-3">
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-600 dark:text-gray-300">Distance Threshold</span>
                        <span className="font-bold text-gray-900 dark:text-white">{distanceThreshold} km</span>
                    </div>
                    <input 
                        type="range" 
                        min="10" max="200" step="10"
                        value={distanceThreshold} 
                        onChange={(e) => setDistanceThreshold(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-600"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">Trigger alert if distance between consecutive fixes exceeds this value.</p>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Border Detection</span>
                    <button 
                        onClick={() => setDetectBorders(!detectBorders)}
                        className={`w-10 h-5 rounded-full transition-colors relative ${detectBorders ? 'bg-brand-600' : 'bg-gray-300 dark:bg-slate-600'}`}
                    >
                        <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${detectBorders ? 'translate-x-5' : ''}`} />
                    </button>
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stats Cards */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                      <Globe size={24} />
                  </div>
                  <div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{generatedAlerts.filter(a => a.type === 'border').length}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">Border Crossings</div>
                  </div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg">
                      <Ruler size={24} />
                  </div>
                  <div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{generatedAlerts.filter(a => a.type === 'distance').length}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">Distance Anomalies</div>
                  </div>
              </div>
              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm flex items-center gap-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                      <ShieldAlert size={24} />
                  </div>
                  <div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{generatedAlerts.filter(a => a.severity === 'critical').length}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">Critical Events</div>
                  </div>
              </div>
          </div>

          {/* Alerts List */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
                  <h3 className="font-bold text-gray-900 dark:text-white">Alert History</h3>
                  <div className="flex gap-2">
                      <button 
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTabState === 'active' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                        onClick={() => setActiveTabState('active')}
                      >
                          Active
                      </button>
                      <button 
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTabState === 'history' ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                        onClick={() => setActiveTab('history')}
                      >
                          Resolved
                      </button>
                  </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 dark:bg-slate-900 text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-3">Type</th>
                            <th className="px-6 py-3">Transmitter / Bird</th>
                            <th className="px-6 py-3">Event Description</th>
                            <th className="px-6 py-3">Time</th>
                            <th className="px-6 py-3">Location</th>
                            <th className="px-6 py-3 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {generatedAlerts.length > 0 ? generatedAlerts.map(alert => {
                            const bird = birds.find(b => {
                                const t = transmitters.find(tr => tr.platform_id === alert.transmitter_id);
                                return t && t.bird_id === b.id;
                            });

                            return (
                            <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-6 py-4">
                                    {alert.type === 'border' ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-xs font-medium border border-purple-100 dark:border-purple-800">
                                            <Globe size={12} /> Border
                                        </span>
                                    ) : (
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${alert.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-100 dark:border-red-800' : 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-800'}`}>
                                            <Navigation size={12} /> Distance
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm font-bold text-gray-900 dark:text-white">{bird ? bird.ring_id : 'Unassigned'}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">PTT {alert.transmitter_id}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm font-medium text-gray-900 dark:text-gray-200">{alert.message}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{alert.detail}</div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                    {formatDateTime(alert.timestamp, timeZone)}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 font-mono">
                                    {alert.location}
                                </td>
                                <td className="px-6 py-4 text-center flex items-center justify-center gap-2">
                                    <button className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors" title="Acknowledge">
                                        <CheckCircle2 size={18} />
                                    </button>
                                    <button 
                                        onClick={() => handleViewOnMap(alert.transmitter_id)}
                                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded transition-colors" 
                                        title="View on Map"
                                    >
                                        <Map size={18} />
                                    </button>
                                </td>
                            </tr>
                        )}) : (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                                    No alerts generated based on current criteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
              </div>
          </div>
      </div>
    </div>
  );
};