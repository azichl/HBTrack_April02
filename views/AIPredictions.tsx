import React, { useMemo, useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { BrainCircuit, MapPin, TrendingUp, AlertTriangle, Calendar, Sparkles, Loader2, Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { MigrationPrediction } from './MigrationPrediction';
import { CustomSelect } from '../components/CustomSelect';

// Helper for bearing calculation
const getBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const toRad = (deg: number) => deg * Math.PI / 180;
    const toDeg = (rad: number) => rad * 180 / Math.PI;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

export const AIPredictions = () => {
  const { birds, transmitters, positions, selectedTransmitterIds } = useAppStore();
  
  // AI Predictive Analysis State
  const [selectedTransmitterId, setSelectedTransmitterId] = useState("");
  const [predictionType, setPredictionType] = useState("migration");
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [useThinkingMode, setUseThinkingMode] = useState(false);
  // Safe localStorage access wrapper
  const getSafeStorage = (key: string) => {
    try {
      return localStorage.getItem(key) || '';
    } catch (e) {
      console.warn("localStorage is blocked or unavailable:", e);
      return '';
    }
  };

  const setSafeStorage = (key: string, value: string) => {
    try {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn("localStorage is blocked or unavailable:", e);
    }
  };

  // Resolve Gemini API key from multiple possible env sources or local storage
  const [localApiKey, setLocalApiKey] = useState(() => getSafeStorage('gemini_api_key'));
  const envApiKey = ((import.meta as any).env?.VITE_GEMINI_API_KEY) || '';
  const geminiApiKey = envApiKey || localApiKey;

  const handleSaveApiKey = (key: string) => {
    setLocalApiKey(key);
    setSafeStorage('gemini_api_key', key);
  };

  // Sync with global selection
  useEffect(() => {
    if (selectedTransmitterIds.length > 0) {
        setSelectedTransmitterId(selectedTransmitterIds[0]);
    }
  }, [selectedTransmitterIds]);

  // 1. Filter Active Birds
  const activeAssets = useMemo(() => {
    return transmitters
      .filter(t => t.status === 'active')
      .map(t => {
        const bird = birds.find(b => b.id === t.bird_id);
        const lastPos = positions.find(p => p.transmitter_id === t.platform_id);
        return { transmitter: t, bird, lastPos };
      })
      .filter(item => item.bird && item.lastPos); // Only those with birds and positions
  }, [transmitters, birds, positions]);

  // --- Gemini Integration for Detailed Analysis ---
  const handleAnalyze = async () => {
    if (!selectedTransmitterId) {
      setAnalysisError('Please select a transmitter first.');
      return;
    }
    if (!geminiApiKey) {
      setAnalysisError('Gemini API key is not configured. Please add GEMINI_API_KEY to your environment variables.');
      return;
    }

    const transmitter = transmitters.find(t => t.platform_id === selectedTransmitterId);
    const bird = birds.find(b => b.id === transmitter?.bird_id);
    const recentPositions = positions
        .filter(p => p.transmitter_id === selectedTransmitterId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10); // Last 10 positions

    if (recentPositions.length === 0) {
        setAnalysisError('No position data available for this transmitter. Please ensure positions have been loaded.');
        return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisError(null);

    try {
      const species = bird?.species || 'Houbara Bustard';
      const currentPos = recentPositions[0];
      const currentLoc = `${currentPos.lat.toFixed(4)}, ${currentPos.lon.toFixed(4)}`;
      
      // 1. Fetch Real-time Weather Context
      let weatherInfo = "Weather data unavailable";
      try {
        const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${currentPos.lat}&longitude=${currentPos.lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m`);
        const wData = await wRes.json();
        if (wData.current) {
            weatherInfo = `Temperature: ${wData.current.temperature_2m}${wData.current_units?.temperature_2m || '°C'}, Wind Speed: ${wData.current.wind_speed_10m} km/h, Wind Direction: ${wData.current.wind_direction_10m}°`;
        }
      } catch (e) {
        console.warn("Failed to fetch weather data", e);
      }

      // 2. Calculate Historical Bearing & Trends
      let historyStats = "Insufficient history for trend analysis.";
      if (recentPositions.length > 1) {
        const first = recentPositions[recentPositions.length - 1]; // Oldest
        const last = recentPositions[0]; // Newest
        const bearing = getBearing(first.lat, first.lon, last.lat, last.lon);
        const avgSpeed = recentPositions.reduce((a, b) => a + b.speed_kmh, 0) / recentPositions.length;
        historyStats = `
- Net Movement Bearing (Last 10 fixes): ${bearing.toFixed(0)}° (General direction of travel)
- Average Speed: ${avgSpeed.toFixed(1)} km/h
        `;
      }

      let prompt = "";

      if (predictionType === "migration") {
        prompt = `Analyze the migration pattern for bird transmitter ${selectedTransmitterId} (${species}).
        
REAL-TIME ENVIRONMENTAL CONTEXT (Critical for Route Prediction):
- Current Location: ${currentLoc}
- Current Local Weather: ${weatherInfo}
  * Note: Houbara migration is heavily influenced by wind. Tailwind assistance increases speed/distance; headwind may cause stopovers.

HISTORICAL FLIGHT BEHAVIOR:
${historyStats}
- Recent Movement Log (Newest first):
${recentPositions.map(h => `  [${h.timestamp}] ${h.lat.toFixed(3)},${h.lon.toFixed(3)} (Speed: ${h.speed_kmh.toFixed(1)}km/h)`).join('\n')}

Based on Houbara Bustard migration patterns, current wind conditions, and historical bearing, predict:
1. **Likely Destination (Next 7-14 days)**: Specific region/area.
2. **Route Forecast**: How the current wind patterns (${weatherInfo}) will impact the trajectory.
3. **Estimated Arrival**: Timeline adjustment based on weather assistance/resistance.
4. **Key Stopovers**: Identify suitable resting spots matching current seasonal ecology.

Provide specific, data-backed predictions in concise markdown.`;
      } else if (predictionType === "behavior") {
        prompt = `Analyze the behavior patterns for bird transmitter ${selectedTransmitterId} (${species}).

Recent Activity Data:
${recentPositions.map(h => `- ${h.timestamp}: Speed ${h.speed_kmh.toFixed(1)} km/h at ${h.lat},${h.lon}`).join('\n')}

Analyze and predict:
1. Current behavior pattern (feeding, resting, migration)
2. Daily activity cycle based on timestamps
3. Expected behavior in next 48 hours
4. Any unusual patterns or anomalies
5. Health indicators based on activity levels`;
      } else if (predictionType === "health") {
        prompt = `Analyze the health and device status for transmitter ${selectedTransmitterId}.

Device Status:
- Battery: ${transmitter?.battery_voltage}V
- Last Fix: ${transmitter?.last_fix}
- Model: ${transmitter?.model}

Predict:
1. Expected battery life remaining
2. Battery degradation risks based on voltage history (assume standard 3.6V-4.2V range)
3. Maintenance requirements
4. Risk of signal loss
5. Recommended actions`;
      } else if (predictionType === "route") {
        prompt = `Predict the optimal migration route for transmitter ${selectedTransmitterId} (${species}).

Current Location: ${currentLoc}
Current Weather Factors: ${weatherInfo}

Based on:
- Historical Houbara migration corridors
- General geography of Central Asia / Middle East
- Current wind patterns

Predict:
1. Optimal route for next migration phase
2. Distance and duration estimate
3. Key waypoints and stopover sites
4. Potential obstacles or risks (cities, mountains)
5. Alternative routes if conditions change`;
      }

      const modelName = useThinkingMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;
      
      const payload: any = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      };

      if (useThinkingMode) {
        payload.generationConfig = {
            thinkingConfig: { thinkingBudget: 8192 }
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
         const errData = await res.json().catch(() => ({}));
         throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      setAnalysisResult(textResponse || "No analysis could be generated.");
    } catch (error: any) {
      console.error("Analysis failed", error);
      const msg = error?.message || 'Unknown error';
      if (msg.includes('Quota exceeded')) {
         setAnalysisError('API Quota Exceeded. The Pro model has strict limits on the free tier. Please uncheck "Enable Deep Analysis" to use the faster Flash model.');
      } else {
         setAnalysisError(`Analysis failed: ${msg.includes('API_KEY') || msg.includes('API key') ? 'Invalid or missing Gemini API key.' : msg}`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const predictionTypes = [
    { value: "migration", label: "Migration Pattern", icon: MapPin },
    { value: "behavior", label: "Behavior Analysis", icon: TrendingUp },
    { value: "health", label: "Health & Battery", icon: AlertTriangle },
    { value: "route", label: "Route Optimization", icon: Calendar },
  ];

  return (
    <div className="space-y-6 h-full flex flex-col overflow-hidden">
       {/* Header */}
       <div className="shrink-0">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BrainCircuit className="text-brand-600" /> AI Migration Forecast
          </h2>
          <p className="text-gray-500 text-sm">Predictive modeling for migration routes and arrival times.</p>
       </div>

       <div className="flex flex-col gap-6 flex-1 overflow-y-auto min-h-0 pb-6 pr-1">
          {/* Main Map Visualization */}
          <div className="w-full h-[400px] lg:h-[500px] shrink-0 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden relative">
             <div className="absolute top-4 right-4 z-[400] bg-white/90 dark:bg-slate-900/90 backdrop-blur p-2 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Historical Corridor
                    <div className="w-2 h-2 rounded-full bg-red-500 ml-2"></div> Live Position
                </div>
             </div>
             <MigrationPrediction selectedTransmitterId={selectedTransmitterId} />
          </div>

          {/* Analysis Panel (Options + Output) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
             {/* Options Sidebar */}
             <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6 flex flex-col">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                   <BrainCircuit size={18} className="text-brand-500" /> Analysis Configuration
                </h3>
                
                <div className="space-y-4 mb-6 flex-1">
                <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Transmitter</label>
                   <CustomSelect 
                     className="w-full mt-1 font-sans"
                     buttonClassName="p-2 border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900"
                     value={selectedTransmitterId}
                     onChange={(val) => setSelectedTransmitterId(val)}
                     options={[
                       { value: '', label: 'Select a PTT...' },
                       ...activeAssets.map(a => ({ 
                         value: a.transmitter.platform_id, 
                         label: `${a.transmitter.platform_id} (${a.bird?.ring_id})` 
                       }))
                     ]}
                   />
                </div>

                <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Analysis Type</label>
                   <div className="grid grid-cols-2 gap-2 mt-1">
                      {predictionTypes.map(type => (
                        <button
                          key={type.value}
                          onClick={() => setPredictionType(type.value)}
                          className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium transition-colors border ${
                             predictionType === type.value 
                             ? 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/30 dark:border-brand-800 dark:text-brand-300' 
                             : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-slate-900 dark:border-slate-700 dark:text-gray-400'
                          }`}
                        >
                           <type.icon size={14} /> {type.label}
                        </button>
                      ))}
                   </div>
                </div>

                <div className="flex items-center gap-2 mt-2">
                   <input 
                      type="checkbox" 
                      id="thinking" 
                      checked={useThinkingMode}
                      onChange={(e) => setUseThinkingMode(e.target.checked)}
                      className="rounded text-brand-600 focus:ring-brand-500"
                   />
                   <label htmlFor="thinking" className="text-xs text-gray-600 dark:text-gray-400">Enable Deep Analysis (Pro Model)</label>
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !selectedTransmitterId}
                  className={`w-full py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 transition-all ${
                     isAnalyzing || !selectedTransmitterId 
                     ? 'bg-gray-300 cursor-not-allowed dark:bg-slate-700' 
                     : 'bg-brand-600 hover:bg-brand-700 shadow-md'
                  }`}
                >
                   {isAnalyzing ? <Loader2 className="animate-spin" size={16} /> : <BrainCircuit size={16} />}
                   {isAnalyzing ? 'Analyzing...' : 'Generate Prediction'}
                </button>
             </div>

                {/* API key warning and input */}
                {!envApiKey && (
                  <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-2">
                      <AlertTriangle size={12} className={localApiKey ? "text-emerald-500" : "text-amber-500"}/> 
                      {localApiKey ? "API Key Configured" : "Gemini API Key Required"}
                    </p>
                    <input 
                      type="password" 
                      value={localApiKey}
                      onChange={(e) => handleSaveApiKey(e.target.value)}
                      placeholder="Paste your Gemini API Key here..."
                      className="w-full p-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded text-xs outline-none focus:ring-1 focus:ring-brand-500"
                    />
                    <p className="text-[9px] text-gray-500 mt-1">Stored locally in your browser. Get a key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">Google AI Studio</a>.</p>
                  </div>
                )}
             </div>

             {/* Output Area */}
             <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6 flex flex-col">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Sparkles size={18} className="text-brand-500" /> AI Insights
                </h3>
                <div className="flex-1 bg-gray-50 dark:bg-slate-900 rounded-xl p-6 overflow-y-auto min-h-[300px] border border-gray-200 dark:border-slate-700">
                   {analysisError ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-center p-4">
                         <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                           <AlertTriangle size={20} className="text-red-500" />
                         </div>
                         <p className="text-xs font-semibold text-red-600 dark:text-red-400">{analysisError}</p>
                         <button onClick={() => setAnalysisError(null)} className="text-[10px] text-gray-400 hover:text-gray-600 underline">Dismiss</button>
                      </div>
                   ) : analysisResult ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                         <ReactMarkdown>{analysisResult}</ReactMarkdown>
                      </div>
                   ) : (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                         <Brain size={48} className="mb-4 opacity-20" />
                         <p className="text-sm font-medium text-gray-500">Awaiting Analysis</p>
                         <p className="text-xs text-center mt-1 max-w-xs">Select a transmitter and run an analysis to view predictive insights powered by Gemini here.</p>
                      </div>
                   )}
                </div>
             </div>
          </div>
       </div>
    </div>
  );
};