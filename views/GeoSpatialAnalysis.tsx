import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, ScaleControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import "leaflet/dist/leaflet.css";
import { CustomSelect } from '../components/CustomSelect';
import { 
  Globe, 
  Calendar, 
  Layers, 
  Loader2, 
  AlertTriangle, 
  CheckCircle, 
  Key, 
  Play, 
  MapPin, 
  Info,
  ThermometerSun,
  Leaf
} from 'lucide-react';
import { getAuth } from 'firebase/auth';

// Setup Map Center Updater helper component
const MapController = ({ center, zoom }: { center: [number, number], zoom: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

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

// Colors mapping for Leaflet Markers (matching Live Tracking & Dashboard)
const greenIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
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

const yellowIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png",
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

const getStatusIcon = (status: string) => {
    if (status === 'Active' || status === 'active') return greenIcon;
    if (status === 'Potential Mortality') return orangeIcon;
    if (status === 'Static test') return yellowIcon;
    if (status === 'Inactive') return redIcon;
    if (status === 'lost' || status === 'maintenance') return orangeIcon;
    return redIcon;
};

export const GeoSpatialAnalysis = () => {
    const { 
    transmitters, 
    birds, 
    positions, 
    selectedTransmitterIds,
    setGeeNdviTileUrl,
    setGeeLstTileUrl,
    setGeeSaviTileUrl,
    setActiveGeeLayer,
    generateLivePositions
  } = useAppStore();

  // Call simulation generator on mount
  useEffect(() => {
    generateLivePositions();
  }, [generateLivePositions]);

  // Controls State
  const [startDate, setStartDate] = useState(() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [analysisType, setAnalysisType] = useState<'ndvi' | 'lst' | 'savi'>('ndvi');
  const [selectedTransmitterId, setSelectedTransmitterId] = useState<string>('all');

  // GEE State
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // GEE Configuration Key State
  const [geeKeyExists, setGeeKeyExists] = useState<boolean | null>(null);
  const [geeKeyInput, setGeeKeyInput] = useState<string>('');
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number]>([24.0, 45.0]);
  const [mapZoom, setMapZoom] = useState<number>(5);

  // Load GEE Key configuration status
  useEffect(() => {
      const checkGeeKey = async () => {
          try {
              const docRef = doc(db, 'keys', 'gee');
              const docSnap = await getDoc(docRef);
              setGeeKeyExists(docSnap.exists());
          } catch (e) {
              console.error('Failed to check GEE credentials key:', e);
              setGeeKeyExists(false);
          }
      };
      checkGeeKey();
  }, []);

  // Sync with global selection
  useEffect(() => {
    if (selectedTransmitterIds.length > 0) {
        setSelectedTransmitterId(selectedTransmitterIds[0]);
    }
  }, [selectedTransmitterIds]);

  const activeAssets = useMemo(() => {
    return transmitters
      .map(t => {
        const bird = birds.find(b => b.id === t.bird_id);
        const lastPos = positions.find(p => p.transmitter_id === t.platform_id);
        const status = t.derived_status || t.status || 'Active';
        return { transmitter: t, bird, lastPos, status };
      })
      .filter(item => !!item.lastPos);
  }, [transmitters, birds, positions]);

  // Handle saving service account key
  const handleSaveGeeKey = async () => {
      if (!geeKeyInput.trim()) return;
      setIsSavingKey(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      try {
          // Parse to verify it is valid JSON
          const parsed = JSON.parse(geeKeyInput);
          if (!parsed.private_key || !parsed.client_email) {
              throw new Error("Invalid service account JSON: missing private_key or client_email.");
          }

          // Save to firestore doc keys/gee
          await setDoc(doc(db, 'keys', 'gee'), parsed);
          setGeeKeyExists(true);
          setSuccessMsg("Google Earth Engine key saved successfully!");
          setGeeKeyInput('');
          setShowKeyConfig(false);
      } catch (err: any) {
          console.error(err);
          setErrorMsg(err.message || "Failed to parse or save GEE credentials. Ensure it is valid JSON.");
      } finally {
          setIsSavingKey(false);
      }
  };

  // Run GEE Analysis Cloud Function
  const handleRunAnalysis = async () => {
      setErrorMsg(null);
      setTileUrl(null);
      
      // Calculate Bounding Box (ROI)
      let bbox: [number, number, number, number] = [0, 0, 0, 0]; // [minLon, minLat, maxLon, maxLat]
      let focalPositions: typeof positions = [];

      if (selectedTransmitterId === 'all') {
          focalPositions = activeAssets.map(a => a.lastPos).filter(Boolean) as typeof positions;
      } else {
          focalPositions = positions.filter(p => p.transmitter_id === selectedTransmitterId);
      }

      if (focalPositions.length === 0) {
          setErrorMsg("No position data available to compute Region of Interest.");
          return;
      }

      const lats = focalPositions.map(p => p.lat);
      const lons = focalPositions.map(p => p.lon);
      
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);

      // Add a padding border (~1.2 degrees)
      const latPadding = 1.2;
      const lonPadding = 1.2;
      
      bbox = [
          minLon - lonPadding,
          minLat - latPadding,
          maxLon + lonPadding,
          maxLat + latPadding
      ];

      // Update Map View center to focus on analyzed area
      const centerLat = (minLat + maxLat) / 2;
      const centerLon = (minLon + maxLon) / 2;
      setMapCenter([centerLat, centerLon]);
      setMapZoom(selectedTransmitterId === 'all' ? 6 : 8);

      setIsLoading(true);

      try {
          const authUser = getAuth().currentUser;
          if (!authUser) {
              throw new Error("User must be authenticated to call GEE processor.");
          }
          const idToken = await authUser.getIdToken();

          const response = await fetch(`${window.location.origin}/getGEETileUrl`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`
              },
              body: JSON.stringify({
                  startDate,
                  endDate,
                  type: analysisType,
                  bbox
              })
          });

          const data = await response.json();
          if (!response.ok) {
              if (data.error === "missing_gee_key") {
                  setShowKeyConfig(true);
              }
              throw new Error(data.message || `Server responded with status ${response.status}`);
          }

          if (data.tileUrl) {
              setTileUrl(data.tileUrl);
              
              // Store in global store for Live Tracking layers integration
              if (analysisType === 'ndvi') {
                  setGeeNdviTileUrl(data.tileUrl);
              } else if (analysisType === 'savi') {
                  setGeeSaviTileUrl(data.tileUrl);
              } else {
                  setGeeLstTileUrl(data.tileUrl);
              }
              setActiveGeeLayer(analysisType);

              setSuccessMsg(`Successfully processed ${analysisType.toUpperCase()} overlay for the selected range! The overlay is now also available on the Live Tracking map.`);
          } else {
              throw new Error("No tile URL returned from Google Earth Engine.");
          }
      } catch (err: any) {
          console.error(err);
          setErrorMsg(err.message || "Failed to complete GEE satellite analysis.");
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] w-full gap-4 p-4 overflow-hidden dark:bg-slate-900 bg-slate-50">
      
      {/* LEFT: Controls Panel */}
      <div className="w-full lg:w-96 flex flex-col gap-4 overflow-y-auto pr-2">
          
          {/* Header Card */}
          <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-1">
              <div className="flex items-center gap-2.5 text-brand-600 dark:text-brand-400">
                  <Globe size={24} className="animate-pulse" />
                  <h2 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">GEE Geospatial Analysis</h2>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  Run cloud-computed satellite observations directly via Google Earth Engine. Filter by date, analyze plant greenness (NDVI), or measure land temperature profiles (LST) around Houbara Bustard habitats.
              </p>
          </div>

          {/* Configuration Status Indicator */}
          <div className="bg-white dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                      <Key size={16} className="text-gray-500" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Earth Engine Configuration</span>
                  </div>
                  {geeKeyExists === null ? (
                      <Loader2 size={16} className="animate-spin text-slate-400" />
                  ) : geeKeyExists ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-900/50">
                          <CheckCircle size={12} /> Active
                      </span>
                  ) : (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 px-2 py-0.5 rounded-full border border-yellow-200 dark:border-yellow-900/50">
                          <AlertTriangle size={12} /> Key Required
                      </span>
                  )}
              </div>
              
              {!geeKeyExists && geeKeyExists !== null && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                      GEE computations require a Service Account JSON private key. Paste your credentials below to connect your project.
                  </p>
              )}

              <button
                  onClick={() => setShowKeyConfig(!showKeyConfig)}
                  className="w-full mt-3 py-1.5 px-3 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center gap-1"
              >
                  {showKeyConfig ? "Hide Key Configuration" : "Configure Earth Engine Key"}
              </button>

              {showKeyConfig && (
                  <div className="mt-4 border-t border-slate-100 dark:border-slate-800/80 pt-4 flex flex-col gap-3">
                      <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Service Account Credentials JSON</label>
                          <textarea
                              value={geeKeyInput}
                              onChange={(e) => setGeeKeyInput(e.target.value)}
                              placeholder='{ "type": "service_account", ... }'
                              className="w-full h-28 p-2 text-[11px] font-mono border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800 dark:text-slate-100"
                          />
                      </div>
                      <button
                          onClick={handleSaveGeeKey}
                          disabled={isSavingKey || !geeKeyInput.trim()}
                          className="w-full py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-750 dark:hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                          {isSavingKey ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                          <span>Save Configuration</span>
                      </button>
                  </div>
              )}
          </div>

          {/* Analysis Form Card */}
          <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={14} /> Analysis Settings
              </h3>

              {/* Analysis Type */}
              <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Observation Mode</label>
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-900 p-1 rounded-xl border border-slate-100 dark:border-slate-800">
                      <button
                          type="button"
                          onClick={() => setAnalysisType('ndvi')}
                          className={`py-2 px-3 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                              analysisType === 'ndvi' 
                                ? 'bg-white dark:bg-slate-800 text-green-700 dark:text-green-400 shadow-sm' 
                                : 'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                      >
                          <Leaf size={14} />
                          <span className="hidden sm:inline">NDVI (Greenness)</span>
                          <span className="sm:hidden">NDVI</span>
                      </button>
                      <button
                          type="button"
                          onClick={() => setAnalysisType('savi')}
                          className={`py-2 px-3 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                              analysisType === 'savi' 
                                ? 'bg-white dark:bg-slate-800 text-yellow-600 dark:text-yellow-400 shadow-sm' 
                                : 'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                      >
                          <Leaf size={14} />
                          <span className="hidden sm:inline">SAVI (Desert)</span>
                          <span className="sm:hidden">SAVI</span>
                      </button>
                      <button
                          type="button"
                          onClick={() => setAnalysisType('lst')}
                          className={`py-2 px-3 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                              analysisType === 'lst' 
                                ? 'bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 shadow-sm' 
                                : 'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                          }`}
                      >
                          <ThermometerSun size={14} />
                          <span className="hidden sm:inline">LST (Temperature)</span>
                          <span className="sm:hidden">LST</span>
                      </button>
                  </div>
              </div>

              {/* Focal Birds/PTT */}
              <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">Observation Subject (ROI)</label>
                  <CustomSelect
                      value={selectedTransmitterId}
                      onChange={(val) => setSelectedTransmitterId(val)}
                      className="w-full text-xs"
                      buttonClassName="py-2 px-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-xl"
                      options={[
                          { value: 'all', label: 'All Monitored Transmitters (Global BBox)' },
                          ...activeAssets.map(item => ({
                              value: item.transmitter.platform_id,
                              label: `[${item.status}] PTT ${item.transmitter.platform_id} (${item.bird?.name || item.bird?.ring_id || 'Unnamed'})`
                          }))
                      ]}
                  />
              </div>

              {/* Date Selectors */}
              <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <Calendar size={12} className="text-gray-400" /> Start Date
                      </label>
                      <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full py-2 px-3 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800 dark:text-slate-100"
                      />
                  </div>
                  <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <Calendar size={12} className="text-gray-400" /> End Date
                      </label>
                      <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full py-2 px-3 text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500 text-slate-800 dark:text-slate-100"
                      />
                  </div>
              </div>

              {/* Run Button */}
              <button
                  onClick={handleRunAnalysis}
                  disabled={isLoading || !geeKeyExists}
                  className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-bold shadow-md shadow-brand-100 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                  {isLoading ? (
                      <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Processing Satellite Data...</span>
                      </>
                  ) : (
                      <>
                          <Play size={16} fill="white" />
                          <span>Run GEE Analysis</span>
                      </>
                  )}
              </button>
          </div>

          {/* Feedback Messages */}
          {errorMsg && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-2xl p-4 flex gap-3 text-red-700 dark:text-red-400 text-xs">
                  <AlertTriangle className="flex-shrink-0" size={16} />
                  <div className="flex flex-col gap-1">
                      <span className="font-bold">Execution Failed</span>
                      <p className="leading-relaxed font-medium">{errorMsg}</p>
                  </div>
              </div>
          )}

          {successMsg && (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 rounded-2xl p-4 flex gap-3 text-green-700 dark:text-green-400 text-xs">
                  <CheckCircle className="flex-shrink-0" size={16} />
                  <div className="flex flex-col gap-1">
                      <span className="font-bold">Processing Complete</span>
                      <p className="leading-relaxed font-medium">{successMsg}</p>
                  </div>
              </div>
          )}

          {/* Visual Legend Map Overlay */}
          {tileUrl && (
              <div className="bg-white dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center gap-1.5">
                      <Info size={14} className="text-gray-400" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {analysisType === 'ndvi' ? 'NDVI Vegetation Color Index' : analysisType === 'savi' ? 'SAVI Desert Vegetation Index' : 'LST Temperature Color Index'}
                      </span>
                  </div>
                  
                  {analysisType === 'ndvi' || analysisType === 'savi' ? (
                      <div className="flex flex-col gap-1">
                          <div className="h-4 w-full rounded bg-gradient-to-r from-[#FFFFFF] via-[#FCD163] via-[#74A901] to-[#012E01] border border-slate-100 dark:border-slate-800" />
                          <div className="flex justify-between text-[10px] text-gray-500 font-bold px-0.5">
                              <span>0.0 (Bare soil / Desert)</span>
                              <span>0.6 (Dense plants)</span>
                          </div>
                      </div>
                  ) : (
                      <div className="flex flex-col gap-1">
                          <div className="h-4 w-full rounded bg-gradient-to-r from-[#0000FF] via-[#00FF00] via-[#FFFF00] to-[#FF0000] border border-slate-100 dark:border-slate-800" />
                          <div className="flex justify-between text-[10px] text-gray-500 font-bold px-0.5">
                              <span>10 °C (Cool Land)</span>
                              <span>45 °C (Hot Ground)</span>
                          </div>
                      </div>
                  )}
              </div>
          )}

      </div>

      {/* RIGHT: Map Area */}
      <div className="flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm relative z-0">
          <MapContainer
             center={mapCenter}
             zoom={mapZoom}
             zoomControl={false}
             className="w-full h-full"
          >
              <MapController center={mapCenter} zoom={mapZoom} />
              <MapResizer />

              {/* Satellite Layer */}
              <TileLayer
                  url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                  attribution="Google Satellite Hybrid"
              />

              {/* Google Earth Engine Dynamic Overlay Layer */}
              {tileUrl && (
                  <TileLayer
                      key={tileUrl}
                      url={tileUrl}
                      attribution="Google Earth Engine Observations"
                      zIndex={500}
                      opacity={0.85}
                  />
              )}

              <ZoomControl position="bottomright" />
              <ScaleControl position="bottomleft" />

              {/* Subject Markers connected to live transmitter status */}
              {activeAssets.map(item => {
                  const status = item.status;
                  return (
                      <Marker
                          key={item.transmitter.platform_id}
                          position={[item.lastPos.lat, item.lastPos.lon]}
                          icon={getStatusIcon(status)}
                          eventHandlers={{
                              click: () => {
                                  setSelectedTransmitterId(item.transmitter.platform_id);
                              }
                          }}
                      >
                          <Popup>
                              <div className="p-1.5 space-y-1 text-slate-800 min-w-[180px]">
                                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1">
                                      <h4 className="text-xs font-bold text-brand-600 m-0">PTT {item.transmitter.platform_id}</h4>
                                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                                          status === 'Active' ? 'bg-green-100 text-green-800 border border-green-300' :
                                          status === 'Potential Mortality' ? 'bg-amber-100 text-amber-900 border border-amber-400 font-extrabold' :
                                          status === 'Static test' ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' :
                                          'bg-red-100 text-red-800 border border-red-300'
                                      }`}>
                                          {status}
                                      </span>
                                  </div>
                                  <p className="text-[10px] m-0"><b>Subject:</b> {item.bird?.name || item.bird?.ring_id || 'Unnamed'}</p>
                                  <p className="text-[10px] m-0"><b>Region:</b> {item.transmitter.program_region || 'Central Asia'}</p>
                                  <p className="text-[10px] m-0"><b>Lat/Lon:</b> {item.lastPos.lat.toFixed(5)}, {item.lastPos.lon.toFixed(5)}</p>
                                  <p className="text-[9px] text-gray-500 m-0 pt-0.5 border-t border-slate-100">
                                      <b>Last Fix:</b> {new Date(item.lastPos.timestamp).toLocaleString()}
                                  </p>
                              </div>
                          </Popup>
                      </Marker>
                  );
              })}
          </MapContainer>
      </div>

    </div>
  );
};
