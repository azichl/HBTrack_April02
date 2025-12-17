import React, { useMemo, useState, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { BrainCircuit, MapPin, TrendingUp, AlertTriangle, Calendar, Sparkles, Loader2, Brain } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { MigrationPrediction } from './MigrationPrediction';

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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [useThinkingMode, setUseThinkingMode] = useState(true); // Default to True for Gemini 3 Pro

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
      alert('Please select a transmitter');
      return;
    }

    const transmitter = transmitters.find(t => t.platform_id === selectedTransmitterId);
    const bird = birds.find(b => b.id === transmitter?.bird_id);
    const recentPositions = positions
        .filter(p => p.transmitter_id === selectedTransmitterId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10); // Last 10 positions

    if (recentPositions.length === 0) {
        alert("No position data available for analysis.");
        return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
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

      let response;
      
      if (useThinkingMode) {
          response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 32768 }
            }
          });
      } else {
          response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
          });
      }

      setAnalysisResult(response.text || "No analysis could be generated.");
    } catch (error) {
      console.error("Analysis failed", error);
      alert("Analysis failed. Please try again.");
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
    <div className="space-y-6 h-full flex flex-col">
       {/* Header */}
       <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BrainCircuit className="text-brand-600" /> AI Migration Forecast
          </h2>
          <p className="text-gray-500 text-sm">Predictive modeling for migration routes and arrival times.</p>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          {/* Main Map Visualization */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col relative">
             <div className="absolute top-4 left-4 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur p-2 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300">
                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Historical Corridor
                    <div className="w-2 h-2 rounded-full bg-red-500 ml-2"></div> Live Position
                </div>
             </div>
             <MigrationPrediction />
          </div>

          {/* Analysis Sidebar */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm p-6 flex flex-col overflow-y-auto">
             <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Sparkles size={18} className="text-brand-500" /> Gemini Analysis
             </h3>
             
             <div className="space-y-4 mb-6">
                <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Transmitter</label>
                   <select 
                     className="font-sans w-full mt-1 p-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                     value={selectedTransmitterId}
                     onChange={(e) => setSelectedTransmitterId(e.target.value)}
                     style={{ fontFamily: "'Sakkal Majalla', sans-serif" }}
                   >
                     <option value="">Select a PTT...</option>
                     {activeAssets.map(a => (
                        <option key={a.transmitter.platform_id} value={a.transmitter.platform_id}>
                           {a.transmitter.platform_id} ({a.bird?.ring_id})
                        </option>
                     ))}
                   </select>
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
                   <label htmlFor="thinking" className="text-xs text-gray-600 dark:text-gray-400">Enable Thinking Mode (Gemini 3 Pro)</label>
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

             {/* Output Area */}
             <div className="flex-1 bg-gray-50 dark:bg-slate-900 rounded-xl p-4 overflow-y-auto min-h-[200px] border border-gray-200 dark:border-slate-700">
                {analysisResult ? (
                   <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                      <ReactMarkdown>{analysisResult}</ReactMarkdown>
                   </div>
                ) : (
                   <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <Brain size={32} className="mb-2 opacity-20" />
                      <p className="text-xs text-center">Select a transmitter and run analysis to see AI insights.</p>
                   </div>
                )}
             </div>
          </div>
       </div>
    </div>
  );
};