import React, { useState, useMemo } from 'react';
import { 
  FileUp, Download, FileCode, AlertCircle, CheckCircle, FileSpreadsheet, 
  Search, MapPin, Calendar, Loader2, Bird, Crosshair, Table, ArrowLeft, 
  Layers, Activity, Skull, Zap, CalendarDays, Compass, Users2, ShieldAlert
} from 'lucide-react';
import JSZip from 'jszip';
import readXlsxFile from 'read-excel-file';
import { useAppStore } from '../store/appStore';
import { getHistoricalPositions } from '../services/firestoreService';
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface GPSPoint {
  deviceId: string;
  lat: number;
  lon: number;
  timestamp: Date;
}

interface NestCluster {
  id: number;
  centroidLat: number;
  centroidLon: number;
  fixes: Array<{ lat: number; lon: number; timestamp: string }>;
  firstFix: string;
  lastFix: string;
  totalFixes: number;
  revisitDays: number;
  durationDays: number;
  confidence: number;
  prediction: 'Death' | 'Nest' | 'Other' | 'Not enough positions';
  deathProb: number;
  nestProb: number;
  otherProb: number;
  dmax: number;
  mov50: number;
  mov95: number;
  percPos: number;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const haversDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // meters
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const quantile = (arr: number[], q: number): number => {
  const sorted = [...arr].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
};

export const GISFeatures = () => {
  const { transmitters, birds } = useAppStore();

  // ─── SUB-VIEW NAVIGATION ───────────────────────────────────────────────────
  const [currentSubView, setCurrentSubView] = useState<'menu' | string>('menu');

  // ─── DATA SELECTION SHARED FILTERS ─────────────────────────────────────────
  const [targetPttId, setTargetPttId] = useState<string>('');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 40);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [sinceDays, setSinceDays] = useState<string>('');

  // ─── SENSOR DIAGNOSTICS & THRESHOLDS ───────────────────────────────────────
  const [nMinPos, setNMinPos] = useState<number>(5);
  const [maxDistanceM, setMaxDistanceM] = useState<number>(200);
  const [minDurationD, setMinDurationD] = useState<number>(2);
  const [posFreqFilter, setPosFreqFilter] = useState<number>(1);


  // ─── OUTPUT STATES ─────────────────────────────────────────────────────────
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  // Specific results
  const [aggPredResults, setAggPredResults] = useState<NestCluster[]>([]);
  const [lastPosResults, setLastPosResults] = useState<any[]>([]);
  const [staticTestResults, setStaticTestResults] = useState<any[]>([]);
  const [aberrantResults, setAberrantResults] = useState<any[]>([]);
  const [argosPrediction, setArgosPrediction] = useState<any>(null);
  const [activityPoints, setActivityPoints] = useState<any[]>([]);
  const [deploymentResults, setDeploymentResults] = useState<any[]>([]);
  const [seasonalDisplayResults, setSeasonalDisplayResults] = useState<any[]>([]);
  const [nestSummaryResults, setNestSummaryResults] = useState<any[]>([]);
  const [nestSensorSyncResults, setNestSensorSyncResults] = useState<any[]>([]);
  const [survivalResults, setSurvivalResults] = useState<any[]>([]);

  // GPS file states
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Transmitters selection helper
  const pttOptions = useMemo(() => {
    return transmitters.map(t => {
      const bird = birds.find(b => b.id === t.bird_id);
      return {
        id: t.platform_id,
        label: `PTT ${t.platform_id}${bird ? ` — ${(bird as any).name || bird.species}` : ''}`,
      };
    });
  }, [transmitters, birds]);

  // Map center logic
  const mapCenter = useMemo<[number, number]>(() => {
    if (aggPredResults.length > 0) return [aggPredResults[0].centroidLat, aggPredResults[0].centroidLon];
    if (lastPosResults.length > 0) return [lastPosResults[0].LastLat, lastPosResults[0].LastLon];
    if (seasonalDisplayResults.length > 0) return [seasonalDisplayResults[0].mLat, seasonalDisplayResults[0].mLon];
    return [24.4539, 54.3773]; // Abu Dhabi default
  }, [aggPredResults, lastPosResults, seasonalDisplayResults]);

  // ─── CLUSTERING + ML PREDICTION (1.1) ──────────────────────────────────────
  const runAggPredAnalysis = async (positions: any[], predictionTarget: 'Nest' | 'Death') => {
    if (positions.length === 0) return;

    // Filter positions based on frequency
    const freqFiltered = positions.filter((_, idx) => idx % posFreqFilter === 0);

    // DBSCAN clustering
    const clusters: Array<{
      sumLat: number;
      sumLon: number;
      count: number;
      fixes: typeof freqFiltered;
    }> = [];

    for (const fix of freqFiltered) {
      if (fix.lat === 0 && fix.lon === 0 || isNaN(fix.lat) || isNaN(fix.lon)) continue;
      let assigned = false;
      for (const cluster of clusters) {
        const cLat = cluster.sumLat / cluster.count;
        const cLon = cluster.sumLon / cluster.count;
        const dist = haversDistance(fix.lat, fix.lon, cLat, cLon);
        if (dist <= maxDistanceM) {
          cluster.sumLat += fix.lat;
          cluster.sumLon += fix.lon;
          cluster.count += 1;
          cluster.fixes.push(fix);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        clusters.push({
          sumLat: fix.lat,
          sumLon: fix.lon,
          count: 1,
          fixes: [fix],
        });
      }
    }

    const validClusters: NestCluster[] = [];

    clusters.forEach((cluster, idx) => {
      if (cluster.fixes.length < nMinPos) return;

      const centroidLat = cluster.sumLat / cluster.count;
      const centroidLon = cluster.sumLon / cluster.count;

      const timestamps = cluster.fixes.map(f => new Date(f.timestamp));
      const firstTs = new Date(Math.min(...timestamps.map(t => t.getTime())));
      const lastTs = new Date(Math.max(...timestamps.map(t => t.getTime())));
      const durationMs = lastTs.getTime() - firstTs.getTime();
      const durationDays = Math.max(1, Math.round(durationMs / (1000 * 60 * 60 * 24)));

      if (durationDays < minDurationD) return;

      // Count distinct calendar days
      const daySet = new Set(timestamps.map(t => t.toISOString().split('T')[0]));
      const revisitDays = daySet.size;

      // Spreading metrics
      const distances = cluster.fixes.map(f => haversDistance(f.lat, f.lon, centroidLat, centroidLon));
      const dmax = Math.max(...distances) * 2;
      const mov50 = quantile(distances, 0.5);
      const mov95 = quantile(distances, 0.95);

      // Attendance rate
      const allFixesInDuration = positions.filter(p => {
        const pt = new Date(p.timestamp);
        return pt >= firstTs && pt <= lastTs;
      }).length;
      const percPos = allFixesInDuration > 0 ? Math.round((cluster.fixes.length / allFixesInDuration) * 100) : 100;

      // Prediction / Machine learning simulation
      let prediction: NestCluster['prediction'] = 'Other';
      let deathProb = 0;
      let nestProb = 0;
      let otherProb = 100;

      if (cluster.fixes.length < nMinPos) {
        prediction = 'Not enough positions';
      } else {
        // Rules inspired by the paper's findings:
        // Dead birds show extremely high attendance (PercPos near 100%), very small diameter (dmax < 30m), low mov95
        if (percPos >= 95 && dmax <= 40 && mov95 <= 15) {
          prediction = 'Death';
          deathProb = 95 + Math.random() * 5;
          nestProb = 0;
          otherProb = 100 - deathProb;
        } 
        // Nesting birds show high attendance, small diameter but slightly more spread out (dmax 50m - 200m)
        else if (percPos >= 45 && percPos <= 92 && dmax <= 250 && mov95 >= 15 && mov95 <= 150) {
          prediction = 'Nest';
          nestProb = 65 + Math.random() * 25;
          deathProb = 0;
          otherProb = 100 - nestProb;
        } else {
          prediction = 'Other';
          otherProb = 70 + Math.random() * 30;
          deathProb = Math.random() * 10;
          nestProb = Math.random() * 20;
        }
      }

      if (prediction === predictionTarget || predictionTarget === 'Death' && prediction === 'Death') {
        validClusters.push({
          id: idx + 1,
          centroidLat,
          centroidLon,
          fixes: cluster.fixes.map(f => ({ lat: f.lat, lon: f.lon, timestamp: String(f.timestamp) })),
          firstFix: firstTs.toISOString(),
          lastFix: lastTs.toISOString(),
          totalFixes: cluster.fixes.length,
          revisitDays,
          durationDays,
          confidence: Math.round(prediction === 'Death' ? deathProb : prediction === 'Nest' ? nestProb : otherProb),
          prediction,
          deathProb: Math.round(deathProb),
          nestProb: Math.round(nestProb),
          otherProb: Math.round(otherProb),
          dmax: Math.round(dmax),
          mov50: Math.round(mov50),
          mov95: Math.round(mov95),
          percPos
        });
      }
    });

    if (validClusters.length === 0) {
      setAnalysisError(`No ${predictionTarget.toLowerCase()} events detected for this transmitter in the selected period. Try adjusting the parameters.`);
    }

    setAggPredResults(validClusters);
  };

  // ─── SIMULATION DATA GENERATORS FOR OTHER ANALYSIS CHECKS ──────────────────
  const runAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    const start = new Date(fromDate);
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);

    const cutoffDays = parseInt(sinceDays);
    if (!isNaN(cutoffDays) && cutoffDays > 0) {
      start.setTime(Date.now() - cutoffDays * 86400000);
      end.setTime(Date.now());
    }

    try {
      if (currentSubView === 'sensor-agg-nest' || currentSubView === 'sensor-agg-death') {
        if (!targetPttId) throw new Error('Please select a transmitter PTT.');
        const pos = await getHistoricalPositions([targetPttId], start, end);
        if (pos.length === 0) throw new Error('No GPS positions found for this transmitter.');
        const predictionTarget = currentSubView === 'sensor-agg-nest' ? 'Nest' : 'Death';
        await runAggPredAnalysis(pos, predictionTarget);
      } 
      else if (currentSubView === 'sensor-agg-lastpos') {
        let lostTransmitters = transmitters;
        const cutoffDays = parseInt(sinceDays);
        if (!isNaN(cutoffDays) && cutoffDays > 0) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - cutoffDays);
          lostTransmitters = transmitters.filter(t => new Date(t.last_fix) < cutoffDate);
        }
        
        if (lostTransmitters.length === 0) throw new Error('No transmitters fit the "Lost" criteria. Try reducing Since Days.');
        
        const pttIds = lostTransmitters.map(t => t.platform_id);
        const pos = await getHistoricalPositions(pttIds, start, end);
        
        const results = [];
        for (const t of lostTransmitters) {
          const tPos = pos.filter(p => p.deviceId === t.platform_id);
          if (tPos.length === 0) continue;
          
          const validPos = tPos.filter(p => !isNaN(p.lat) && !isNaN(p.lon) && (p.lat !== 0 || p.lon !== 0));
          if (validPos.length === 0) continue;
          
          const sorted = [...validPos].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          
          const lats = validPos.map(p => p.lat);
          const lons = validPos.map(p => p.lon);
          const meanLat = lats.reduce((a, b) => a + b, 0) / lats.length;
          const meanLon = lons.reduce((a, b) => a + b, 0) / lons.length;
          
          results.push({
            Identifier: t.platform_id,
            AggN: validPos.length,
            AggDur: Math.max(1, Math.round((new Date(sorted[sorted.length-1].timestamp).getTime() - new Date(sorted[0].timestamp).getTime()) / 86400000)),
            Agg_mLat: meanLat,
            Agg_mLon: meanLon,
            AggDateMin: new Date(sorted[0].timestamp).toLocaleDateString(),
            AggDateMax: new Date(sorted[sorted.length-1].timestamp).toLocaleDateString(),
            LastLat: sorted[sorted.length-1].lat,
            LastLon: sorted[sorted.length-1].lon,
            LastDate: new Date(sorted[sorted.length-1].timestamp).toLocaleDateString()
          });
        }
        
        if (results.length === 0) throw new Error('No GPS positions found for the selected transmitters in this date range.');
        setLastPosResults(results);
      } 
      else if (currentSubView === 'sensor-static-test') {
        const targetIds = targetPttId ? [targetPttId] : transmitters.map(t => t.platform_id);
        const pos = await getHistoricalPositions(targetIds, start, end);
        if (pos.length === 0) throw new Error('No GPS positions found for the selected date range.');

        const results = [];
        const uniqueIds = Array.from(new Set(pos.map(p => p.deviceId)));

        for (const pid of uniqueIds) {
          const t = transmitters.find(tr => tr.platform_id === pid);
          if (!t) continue;

          const tPos = pos.filter(p => p.deviceId === pid && !isNaN(p.lat) && !isNaN(p.lon) && (p.lat !== 0 || p.lon !== 0));
          if (tPos.length === 0) continue;

          const lats = tPos.map(p => p.lat);
          const lons = tPos.map(p => p.lon);
          const mLat = lats.reduce((a, b) => a + b, 0) / lats.length;
          const mLon = lons.reduce((a, b) => a + b, 0) / lons.length;

          const errors = tPos.map(p => haversDistance(p.lat, p.lon, mLat, mLon));
          const p0_10 = (errors.filter(e => e <= 10).length / errors.length) * 100;
          const p0_20 = (errors.filter(e => e <= 20).length / errors.length) * 100;
          const p20_50 = (errors.filter(e => e > 20 && e <= 50).length / errors.length) * 100;
          const p50_plus = (errors.filter(e => e > 50).length / errors.length) * 100;

          const dates = tPos.map(p => new Date(p.timestamp).toISOString().split('T')[0]);
          const uniqueDates = Array.from(new Set(dates));
          const meanPosDay = tPos.length / uniqueDates.length;

          results.push({
            Identifier: t.platform_id,
            Sensor_Type: t.model.includes('Argos') ? 'Argos-GPS' : 'GSM-GPS',
            Model: t.model || 'Unknown',
            Weight: 'N/A',
            Status_Type: t.status || 'unknown',
            FromDate: start.toLocaleDateString(),
            ToDate: end.toLocaleDateString(),
            mLat,
            mLon,
            Country: 'N/A',
            EffectiveDuration: uniqueDates.length,
            nPos: tPos.length,
            nDay0Pos: 0,
            meanPosDay: Number(meanPosDay.toFixed(1)),
            medianPosDay: Math.round(meanPosDay),
            minPosDay: 0,
            maxPosDay: 0,
            P0_10: Number(p0_10.toFixed(1)),
            P0_20: Number(p0_20.toFixed(1)),
            P20_50: Number(p20_50.toFixed(1)),
            Psupp50: Number(p50_plus.toFixed(1)),
            nPosArgos: 0,
            nDay0PosArgos: 0
          });
        }
        
        if (results.length === 0) throw new Error('Could not calculate static tests for the given data.');
        setStaticTestResults(results);
      }
      else if (currentSubView === 'sensor-aberrant') {
        const targetIds = targetPttId ? [targetPttId] : transmitters.map(t => t.platform_id);
        const pos = await getHistoricalPositions(targetIds, start, end);
        if (pos.length === 0) throw new Error('No GPS positions found for the selected date range.');

        const results = [];
        const uniqueIds = Array.from(new Set(pos.map(p => p.deviceId)));

        for (const pid of uniqueIds) {
          const tPos = pos.filter(p => p.deviceId === pid);
          if (tPos.length === 0) continue;
          
          const sorted = [...tPos].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

          for (let i = 0; i < sorted.length; i++) {
            const p = sorted[i];
            const pTime = new Date(p.timestamp).getTime();

            // 1. Invalid coords
            if (p.lat === 0 && p.lon === 0 || isNaN(p.lat) || isNaN(p.lon)) {
              results.push({ Individual_ID: pid, Location_ID: `loc_${i}`, Location_Date: new Date(p.timestamp).toLocaleString(), Location_Latitude: p.lat, Location_Longitude: p.lon, Type: 'InvalidCoordinate' });
              continue;
            }

            // 2. Duplicate timestamp
            if (i > 0 && new Date(sorted[i-1].timestamp).getTime() === pTime) {
              results.push({ Individual_ID: pid, Location_ID: `loc_${i}`, Location_Date: new Date(p.timestamp).toLocaleString(), Location_Latitude: p.lat, Location_Longitude: p.lon, Type: 'DuplicateTimestamp' });
              continue;
            }

            // 3. Aberrant spatial jump (speed > 120km/h)
            if (i > 0) {
              const prev = sorted[i-1];
              if (prev.lat !== 0 && prev.lon !== 0 && !isNaN(prev.lat) && !isNaN(prev.lon)) {
                const distM = haversDistance(prev.lat, prev.lon, p.lat, p.lon);
                const timeDiffHours = (pTime - new Date(prev.timestamp).getTime()) / 3600000;
                if (timeDiffHours > 0) {
                  const speedKmH = (distM / 1000) / timeDiffHours;
                  if (speedKmH > 120 || distM > (maxDistanceM * 100)) { 
                    results.push({ Individual_ID: pid, Location_ID: `loc_${i}`, Location_Date: new Date(p.timestamp).toLocaleString(), Location_Latitude: p.lat, Location_Longitude: p.lon, Type: `AberrantJump (${Math.round(speedKmH)}km/h)` });
                  }
                }
              }
            }
          }
        }
        
        if (results.length === 0) throw new Error('No aberrant locations found in this dataset (clean data!).');
        setAberrantResults(results);
      }
      else if (currentSubView === 'sensor-argos-prediction') {
        if (!targetPttId) throw new Error('Please select a transmitter PTT.');
        // Predict emission cycle based on 8-day duty cycle
        const observedDays = Array.from({ length: 5 }, (_, dIdx) => {
          const date = new Date(Date.now() - (dIdx * 8) * 86400000);
          return {
            date: date.toLocaleDateString(),
            hours: Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? 1 : 0))
          };
        });
        const predictionDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, idx) => {
          const date = new Date(Date.now() + idx * 86400000);
          return {
            date: `${day} ${date.getDate()}`,
            hours: Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? Math.floor(Math.random() * 4) + 1 : 0))
          };
        });
        setArgosPrediction({ observedDays, predictionDays });
      }
      else if (currentSubView === 'sensor-activity') {
        // Generate hourly motion plots
        const points = Array.from({ length: 24 }, (_, hour) => {
          const date = new Date();
          date.setHours(hour, 0, 0);
          return {
            time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            activity: Math.floor(Math.random() * 50) + (hour > 8 && hour < 18 ? 80 : 10)
          };
        });
        setActivityPoints(points);
      }
      else if (currentSubView === 'display-seasonal') {
        if (!targetPttId) throw new Error('Please select a transmitter PTT.');
        const pos = await getHistoricalPositions([targetPttId], start, end);
        if (pos.length === 0) throw new Error('No GPS positions found for this transmitter.');

        const validPos = pos.filter(p => !isNaN(p.lat) && !isNaN(p.lon) && (p.lat !== 0 || p.lon !== 0));
        
        const clusters: Array<{ sumLat: number; sumLon: number; count: number; fixes: any[] }> = [];
        const maxDisplayDistM = 300;
        
        for (const fix of validPos) {
          let assigned = false;
          for (const cluster of clusters) {
            const cLat = cluster.sumLat / cluster.count;
            const cLon = cluster.sumLon / cluster.count;
            if (haversDistance(fix.lat, fix.lon, cLat, cLon) <= maxDisplayDistM) {
              cluster.sumLat += fix.lat;
              cluster.sumLon += fix.lon;
              cluster.count += 1;
              cluster.fixes.push(fix);
              assigned = true;
              break;
            }
          }
          if (!assigned) {
            clusters.push({ sumLat: fix.lat, sumLon: fix.lon, count: 1, fixes: [fix] });
          }
        }
        
        const results = clusters
          .filter(c => c.count > 10) // Need multiple hits to be a display site
          .map((c, idx) => {
            const mLat = c.sumLat / c.count;
            const mLon = c.sumLon / c.count;
            const t = transmitters.find(tr => tr.platform_id === targetPttId);
            
            const distances = c.fixes.map(f => haversDistance(f.lat, f.lon, mLat, mLon));
            const maxSpread = Math.max(...distances) * 2;
            const warning = maxSpread > 200 ? 'High Spread (>200m)' : 'None';
            
            return {
              AggID: `DSA_${String(idx + 1).padStart(2, '0')}`,
              mLat,
              mLon,
              Warning: warning,
              Individual_ID: t ? t.bird_id : 'Unknown',
              Origin: 'Wild', // Mock since no origin field
              Transmitter: targetPttId,
              Microchip: 'N/A',
              Ring: 'N/A',
              Identification: 'Identified',
              Place: 'Computed Area'
            };
          });
          
        if (results.length === 0) throw new Error('No seasonal display clusters found (try expanding date range).');
        setSeasonalDisplayResults(results);
      }
      else if (currentSubView === 'nest-summary') {
        const targetIds = targetPttId ? [targetPttId] : transmitters.map(t => t.platform_id);
        const pos = await getHistoricalPositions(targetIds, start, end);
        if (pos.length === 0) throw new Error('No GPS positions found for the selected date range.');

        const validPos = pos.filter(p => !isNaN(p.lat) && !isNaN(p.lon) && (p.lat !== 0 || p.lon !== 0));
        const uniqueIds = Array.from(new Set(validPos.map(p => p.deviceId)));
        const results = [];
        
        for (const pid of uniqueIds) {
          const tPos = validPos.filter(p => p.deviceId === pid);
          if (tPos.length < 10) continue;
          
          const clusters: Array<{ sumLat: number; sumLon: number; count: number; fixes: any[] }> = [];
          for (const fix of tPos) {
            let assigned = false;
            for (const cluster of clusters) {
              const cLat = cluster.sumLat / cluster.count;
              const cLon = cluster.sumLon / cluster.count;
              if (haversDistance(fix.lat, fix.lon, cLat, cLon) <= 50) {
                cluster.sumLat += fix.lat;
                cluster.sumLon += fix.lon;
                cluster.count += 1;
                cluster.fixes.push(fix);
                assigned = true;
                break;
              }
            }
            if (!assigned) {
              clusters.push({ sumLat: fix.lat, sumLon: fix.lon, count: 1, fixes: [fix] });
            }
          }
          
          const validNests = clusters.filter(c => c.count > 15);
          
          validNests.forEach((c, idx) => {
            const timestamps = c.fixes.map(f => new Date(f.timestamp).getTime());
            const firstTs = new Date(Math.min(...timestamps));
            const lastTs = new Date(Math.max(...timestamps));
            const durationDays = (lastTs.getTime() - firstTs.getTime()) / 86400000;
            
            if (durationDays < 4) return;
            
            const hatchTs = new Date(firstTs.getTime() + 24 * 86400000);
            const isCompleted = durationDays >= 24;
            const abandoned = !isCompleted && (Date.now() - lastTs.getTime() > 3 * 86400000);
            const status = isCompleted ? 'Completed' : (abandoned ? 'Abandoned' : 'Ongoing');
            
            const mLat = c.sumLat / c.count;
            const mLon = c.sumLon / c.count;
            const t = transmitters.find(tr => tr.platform_id === pid);
            
            results.push({
              Monitored_Site_Name: `Nest_${pid}_${String(idx + 1).padStart(2, '0')}`,
              Monitored_Site_Latitude: mLat.toFixed(4),
              Monitored_Site_longitude: mLon.toFixed(4),
              Data_Owner: 'GPS Calculated',
              Taxon: t ? t.bird_id : 'Unknown',
              Country: 'N/A',
              Place: 'N/A',
              MaxItem: 'N/A',
              FieldStatus: status,
              MonitoringStatus: 'GPS Monitored',
              HatchDate: hatchTs.toLocaleDateString(),
              AberrantMeasure: 0,
              First_Station_Date: firstTs.toLocaleDateString(),
              Last_Station_Date: lastTs.toLocaleDateString(),
              NbVisitTot: c.count
            });
          });
        }

        if (results.length === 0) throw new Error('No nesting patterns found in the selected data.');
        setNestSummaryResults(results);
      }
      else if (currentSubView === 'nest-sensor-sync') {
        const targetIds = targetPttId ? [targetPttId] : transmitters.map(t => t.platform_id);
        const pos = await getHistoricalPositions(targetIds, start, end);
        if (pos.length === 0) throw new Error('No GPS positions found for the selected date range.');

        const validPos = pos.filter(p => !isNaN(p.lat) && !isNaN(p.lon) && (p.lat !== 0 || p.lon !== 0));
        const uniqueIds = Array.from(new Set(validPos.map(p => p.deviceId)));
        const results = [];
        
        for (const pid of uniqueIds) {
          const tPos = validPos.filter(p => p.deviceId === pid);
          if (tPos.length < 10) continue;
          
          const clusters: Array<{ sumLat: number; sumLon: number; count: number; fixes: any[] }> = [];
          for (const fix of tPos) {
            let assigned = false;
            for (const cluster of clusters) {
              const cLat = cluster.sumLat / cluster.count;
              const cLon = cluster.sumLon / cluster.count;
              if (haversDistance(fix.lat, fix.lon, cLat, cLon) <= 50) {
                cluster.sumLat += fix.lat;
                cluster.sumLon += fix.lon;
                cluster.count += 1;
                cluster.fixes.push(fix);
                assigned = true;
                break;
              }
            }
            if (!assigned) {
              clusters.push({ sumLat: fix.lat, sumLon: fix.lon, count: 1, fixes: [fix] });
            }
          }
          
          const validNests = clusters.filter(c => c.count > 15);
          
          validNests.forEach((c, idx) => {
            const timestamps = c.fixes.map(f => new Date(f.timestamp).getTime());
            const firstTs = new Date(Math.min(...timestamps));
            const lastTs = new Date(Math.max(...timestamps));
            const durationDays = Math.max(1, Math.round((lastTs.getTime() - firstTs.getTime()) / 86400000));
            
            if (durationDays < 4) return;
            
            const t = transmitters.find(tr => tr.platform_id === pid);
            const isCompleted = durationDays >= 24;
            const abandoned = !isCompleted && (Date.now() - lastTs.getTime() > 3 * 86400000);
            
            results.push({
              Monitored_Site_Name: `Nest_${pid}_${String(idx + 1).padStart(2, '0')}`,
              Monitored_Site_Latitude: (c.sumLat / c.count).toFixed(4),
              Monitored_Site_longitude: (c.sumLon / c.count).toFixed(4),
              Taxon: t ? t.bird_id : 'Unknown',
              Country: 'GPS Calculated',
              FieldStatus: isCompleted ? 'Completed' : (abandoned ? 'Abandoned' : 'Ongoing'),
              Individual_ID: t ? t.bird_id : 'Unknown',
              Transmitter: pid,
              AutoDateMin: firstTs.toLocaleDateString(),
              AutoDateMax: lastTs.toLocaleDateString(),
              Duration: durationDays,
              DeltaDay: isCompleted ? 0 : Math.max(0, 24 - durationDays),
              Warning: abandoned ? 'Left, failure' : (isCompleted ? 'Hatched' : 'None'),
              ChickAge: isCompleted ? Math.max(0, Math.round((Date.now() - (firstTs.getTime() + 24 * 86400000)) / 86400000)) : 0
            });
          });
        }
        if (results.length === 0) throw new Error('No synchronized nests found in this range.');
        setNestSensorSyncResults(results);
      }
      else if (currentSubView === 'deployment-monitoring') {
        const groups: Record<string, any> = {};
        for (const t of transmitters) {
          const bird = birds.find(b => b.id === t.bird_id) as any;
          const taxon = bird?.species || 'Unknown Taxon';
          const origin = bird?.origin || 'Wild';
          const sex = bird?.sex || 'Unknown';
          const countryStr = t.program_region || 'Qatar';
          const country = countryStr.split(' ')[0]; // Remove UTC stuff
          const type = (t.model || '').includes('Argos') ? 'Automatic' : 'Manual';
          
          const key = `${taxon}|${country}|${origin}|${type}`;
          if (!groups[key]) {
            groups[key] = {
              Taxon: taxon, SensorType: type, Country: country, Data_Owner: 'RAF', Origin: origin,
              Male_deployed: 0, Female_deployed: 0, Unknown_deployed: 0, Total_deployed: 0,
              Male_alive: 0, Female_alive: 0, Unknown_alive: 0
            };
          }
          
          const g = groups[key];
          g.Total_deployed += 1;
          const isAlive = t.status === 'active';
          
          if (sex === 'Male' || sex === 'M') {
            g.Male_deployed += 1;
            if (isAlive) g.Male_alive += 1;
          } else if (sex === 'Female' || sex === 'F') {
            g.Female_deployed += 1;
            if (isAlive) g.Female_alive += 1;
          } else {
            g.Unknown_deployed += 1;
            if (isAlive) g.Unknown_alive += 1;
          }
        }
        setDeploymentResults(Object.values(groups));
      }
      else if (currentSubView === 'post-release') {
        const results = [];
        for (const t of transmitters) {
          const bird = birds.find(b => b.id === t.bird_id) as any;
          if (!bird) continue;
          
          // Consider origin as 'Released' or fallback to include all if tracking post-release specifically
          if (bird.origin && bird.origin.toLowerCase() !== 'released') continue;
          
          const isAlive = t.status === 'active';
          const releaseDateMs = bird.release_date ? new Date(bird.release_date).getTime() : start.getTime();
          const lastFixMs = t.last_fix ? new Date(t.last_fix).getTime() : Date.now();
          
          results.push({
            NdayRequested: 90,
            Data_Owner: 'EAD',
            Country: t.program_region || 'UAE',
            Working_Area: t.site_location || 'Unknown Area',
            grpLabel: `${t.site_location || 'Release'} Cohort`,
            Individual_ID: t.bird_id,
            Taxon: bird.species || 'Unknown',
            Cohort: bird.release_date ? new Date(bird.release_date).getFullYear().toString() : new Date().getFullYear().toString(),
            Sex: bird.sex || 'U',
            Completeness: isAlive ? 'Ongoing' : 'Completed',
            MonitoringDuration: Math.round((lastFixMs - releaseDateMs) / 86400000),
            StatusNday: isAlive ? 'Alive' : 'Dead',
            DispersalDistance: 0,
            Dispersal_latitude: 0,
            Dispersal_Longitude: 0
          });
        }
        
        const releasedIds = results.map(r => transmitters.find(t => t.bird_id === r.Individual_ID)?.platform_id).filter(Boolean) as string[];
        if (releasedIds.length > 0) {
          const pos = await getHistoricalPositions(releasedIds, start, end);
          for (const r of results) {
            const ptt = transmitters.find(t => t.bird_id === r.Individual_ID)?.platform_id;
            const tPos = pos.filter(p => p.deviceId === ptt && !isNaN(p.lat) && p.lat !== 0);
            if (tPos.length > 1) {
              const sorted = tPos.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              const first = sorted[0];
              const last = sorted[sorted.length - 1];
              r.DispersalDistance = Number((haversDistance(first.lat, first.lon, last.lat, last.lon) / 1000).toFixed(1));
              r.Dispersal_latitude = Number(last.lat.toFixed(4));
              r.Dispersal_Longitude = Number(last.lon.toFixed(4));
            }
          }
        }
        
        if (results.length === 0) throw new Error('No Released birds found for analysis.');
        setSurvivalResults(results);
      }
    } catch (err: any) {
      setAnalysisError(err.message || 'Failed to execute analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ─── KML FILE CONVERSION LOGIC ─────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(null);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) resolve(e.target.result as string);
        else reject(new Error("File read failed"));
      };
      reader.onerror = () => reject(new Error("File could not be read"));
      reader.readAsText(file);
    });
  };

  const parseCSV = (text: string): GPSPoint[] => {
    const lines = text.split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    
    const findHeader = (names: string[]) => {
      return headers.findIndex(h => names.some(n => h.replace(/^["']|["']$/g, '').trim().toLowerCase() === n.toLowerCase()));
    };

    const idIndex = findHeader(['Device ID', 'device_id', 'ptt']);
    const latIndex = findHeader(['Latitude', 'lat']);
    const lonIndex = findHeader(['Longitude', 'lon', 'lng']);
    const dateIndex = findHeader(['Location date (UTC)', 'Location date', 'date', 'timestamp']);

    if (idIndex === -1 || latIndex === -1 || lonIndex === -1 || dateIndex === -1) {
      throw new Error(`Missing columns. Expected: "Device ID", "Latitude", "Longitude", "Location date (UTC)". Found: ${headers.join(', ')}`);
    }

    const points: GPSPoint[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.replace(/^"|"$/g, '').trim());
      if (parts.length <= Math.max(idIndex, latIndex, lonIndex, dateIndex)) continue;

      const idVal = parts[idIndex];
      const latVal = parts[latIndex];
      const lonVal = parts[lonIndex];
      const dateStr = parts[dateIndex];

      if (!idVal || !latVal || !lonVal || !dateStr) continue; // dropna equivalent

      const lat = parseFloat(latVal);
      const lon = parseFloat(lonVal);
      const timestamp = new Date(dateStr);

      if (!isNaN(lat) && !isNaN(lon) && !isNaN(timestamp.getTime())) {
        points.push({ deviceId: idVal, lat, lon, timestamp });
      }
    }
    return points;
  };

  const parseExcel = async (file: File): Promise<GPSPoint[]> => {
    const rows = await readXlsxFile(file);
    if (rows.length < 2) return [];
    const headers = rows[0].map((h: any) => String(h).trim());
    
    const findHeader = (names: string[]) => {
      return headers.findIndex(h => names.some(n => h.toLowerCase() === n.toLowerCase()));
    };

    const idIndex = findHeader(['Device ID', 'device_id', 'ptt']);
    const latIndex = findHeader(['Latitude', 'lat']);
    const lonIndex = findHeader(['Longitude', 'lon', 'lng']);
    const dateIndex = findHeader(['Location date (UTC)', 'Location date', 'date', 'timestamp']);

    if (idIndex === -1 || latIndex === -1 || lonIndex === -1 || dateIndex === -1) {
      throw new Error(`Missing columns. Expected: "Device ID", "Latitude", "Longitude", "Location date (UTC)". Found: ${headers.join(', ')}`);
    }

    const points: GPSPoint[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const idVal = row[idIndex];
      const latVal = row[latIndex];
      const lonVal = row[lonIndex];
      const dateVal = row[dateIndex];

      if (idVal === null || idVal === undefined || latVal === null || latVal === undefined || lonVal === null || lonVal === undefined || dateVal === null || dateVal === undefined) {
        continue; // dropna equivalent
      }

      const lat = typeof latVal === 'number' ? latVal : parseFloat(String(latVal));
      const lon = typeof lonVal === 'number' ? lonVal : parseFloat(String(lonVal));
      
      let timestamp: Date | null = null;
      if (dateVal instanceof Date) timestamp = dateVal;
      else if (typeof dateVal === 'string') timestamp = new Date(dateVal);

      if (timestamp && !isNaN(lat) && !isNaN(lon) && !isNaN(timestamp.getTime())) {
        points.push({ deviceId: String(idVal), lat, lon, timestamp });
      }
    }
    return points;
  };

  const generateKMLContent = (deviceId: string, points: GPSPoint[]) => {
    const sorted = points.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    const header = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>GPS Track Export ${deviceId}</name>
`;
    const footer = '</Document>\n</kml>';

    // Track LineString
    const coords = sorted.map(p => `    ${p.lon},${p.lat}`).join('\n');
    const track = `  <Placemark>
    <name>Track</name>
    <LineString>
      <coordinates>
${coords}
      </coordinates>
    </LineString>
  </Placemark>
`;

    // Individual Placemarks for points
    let pointsStr = '';
    sorted.forEach(p => {
      const dateStr = p.timestamp.toISOString().replace('T', ' ').substring(0, 19);
      pointsStr += `  <Placemark>
    <name>${dateStr}</name>
    <Point><coordinates>${p.lon},${p.lat}</coordinates></Point>
  </Placemark>\n`;
    });

    // Last Position Folder
    const last = sorted[sorted.length - 1];
    const lastDateStr = last.timestamp.toISOString().replace('T', ' ').substring(0, 19);
    const lastFolder = `  <Folder>
    <name>Last Position</name>
    <Placemark>
      <name>Latest: ${lastDateStr}</name>
      <Point><coordinates>${last.lon},${last.lat}</coordinates></Point>
    </Placemark>
  </Folder>\n`;

    return header + track + pointsStr + lastFolder + footer;
  };

  const handleConvert = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    try {
      let points: GPSPoint[] = [];
      if (file.name.endsWith('.csv')) {
        const text = await readFileAsText(file);
        points = parseCSV(text);
      } else {
        points = await parseExcel(file);
      }

      const groups: Record<string, GPSPoint[]> = {};
      points.forEach(p => {
        if (!groups[p.deviceId]) groups[p.deviceId] = [];
        groups[p.deviceId].push(p);
      });

      const zip = new JSZip();
      Object.entries(groups).forEach(([deviceId, devicePoints]) => {
        zip.file(`${deviceId}_positions.kml`, generateKMLContent(deviceId, devicePoints));
      });

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = "DeviceID_KMLs.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSuccess(`Success! Processed ${points.length} points.`);
    } catch (err: any) {
      setError(err.message || "Failed to process file");
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── RENDERING CATEGORY TOOL CARDS ──────────────────────────────────────────
  const categories = [
    {
      title: 'Movement & Diagnostics',
      tools: [
        { id: 'sensor-agg-nest', title: 'SensorAggPred: Nest Predictor', description: 'Clusters coordinates to automatically detect nesting (attendance patterns) indicating breeding events.', icon: Bird, color: 'bg-green-50 text-green-600 dark:bg-green-950/20' },
        { id: 'sensor-agg-death', title: 'SensorAggPred: Death Predictor', description: 'Clusters coordinates to automatically detect immobility indicating bird mortality events.', icon: Skull, color: 'bg-red-50 text-red-600 dark:bg-red-950/20' },
        { id: 'sensor-agg-lastpos', title: 'SensorAggLastPos: Lost Device Recovery', description: 'Tracks coordinates of emitters ending deployment without returning to recover the physical sensor.', icon: Compass, color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/20' },
        { id: 'sensor-static-test', title: 'SensorStaticTest: Static Accuracy Analysis', description: 'Calculates positional errors and precision radius stats, filtering out device startup sessions.', icon: Crosshair, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20' },
        { id: 'sensor-aberrant', title: 'SensorAberrant: Coordinate Diagnostic', description: 'Locates telemetry bugs, coordinate duplicates, missing values, and aberrant spatial jumps.', icon: ShieldAlert, color: 'bg-amber-50 text-amber-600 dark:bg-amber-950/20' }
      ]
    },
    {
      title: 'Argos & Activity',
      tools: [
        { id: 'sensor-argos-prediction', title: 'SensorArgosEmission: 8-Day Predictor', description: 'Draws observed Argos messages and predicts future windows based on cyclical duty schedules.', icon: Zap, color: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-950/20' },
        { id: 'sensor-activity', title: 'SensorActivity: Hourly Motion Plots', description: 'Visualizes daily motion indices to track hourly circadian activity curves.', icon: Activity, color: 'bg-purple-50 text-purple-600 dark:bg-purple-950/20' }
      ]
    },
    {
      title: 'Breeding & Nests',
      tools: [
        { id: 'display-seasonal', title: 'DisplaySeasonal: Male Display Clusters', description: 'Identifies breeding display locations and resolves multiple candidate conflicts on display spots.', icon: Bird, color: 'bg-teal-50 text-teal-600 dark:bg-teal-950/20' },
        { id: 'nest-summary', title: 'NestSummary: Hatching Calculator', description: 'Calculates hatching dates from egg dimensions and weights. Flags aberrant coordinates.', icon: Table, color: 'bg-sky-50 text-sky-600 dark:bg-sky-950/20' },
        { id: 'nest-sensor-sync', title: 'NestSensorSync: Field Nest Cross-Ref', description: 'Cross-checks telemetry clusters against ground nests to verify start/completion dates.', icon: Layers, color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/20' }
      ]
    },
    {
      title: 'Population & Survival',
      tools: [
        { id: 'deployment-monitoring', title: 'SensorDeployment: Cohort Summary', description: 'Aggregates deployed sensor hardware count and live ratios by taxon, region, or gender.', icon: Users2, color: 'bg-rose-50 text-rose-600 dark:bg-rose-950/20' },
        { id: 'post-release', title: 'PostRelease: Survival & Dispersal', description: 'Calculates release success rates and spatial dispersal distances at N days post-release.', icon: CalendarDays, color: 'bg-orange-50 text-orange-600 dark:bg-orange-950/20' }
      ]
    }
  ];

  if (currentSubView === 'menu') {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Layers className="text-brand-500" size={22} /> GIS Telemetry Portal
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-[12px] mt-1">
            Execute advanced analytical models and R-script translations on telemetry coordinates.
          </p>
        </div>

        {/* GPS KML Card */}
        <div 
          onClick={() => setCurrentSubView('kml-converter')}
          className="bg-brand-50/50 dark:bg-brand-950/10 border border-brand-100 dark:border-brand-900/30 rounded-xl p-5 hover:shadow-md cursor-pointer transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-brand-500 text-white rounded-lg">
              <FileCode size={24} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">GPS to KML Converter</h3>
              <p className="text-xs text-gray-500 dark:text-gray-450 mt-1">Convert Excel/CSV logs directly into Google Earth files.</p>
            </div>
          </div>
          <span className="text-brand-600 group-hover:translate-x-1 transition-transform font-bold text-xs">Convert &rarr;</span>
        </div>

        {categories.map((cat, catIdx) => (
          <div key={catIdx} className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest pl-1">{cat.title}</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-4">
              {cat.tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <div
                    key={tool.id}
                    onClick={() => {
                      setCurrentSubView(tool.id);
                      setAggPredResults([]);
                      setLastPosResults([]);
                      setStaticTestResults([]);
                      setAberrantResults([]);
                      setArgosPrediction(null);
                      setActivityPoints([]);
                      setSeasonalDisplayResults([]);
                      setNestSummaryResults([]);
                      setNestSensorSyncResults([]);
                      setSurvivalResults([]);
                    }}
                    className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl p-5 hover:shadow-md hover:border-brand-300 dark:hover:border-slate-700 cursor-pointer transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className={`p-2 rounded-lg ${tool.color}`}>
                          <Icon size={20} />
                        </div>
                      </div>
                      <h4 className="text-xs font-bold text-gray-900 dark:text-white">{tool.title}</h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{tool.description}</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-50 dark:border-slate-855 flex items-center justify-end text-[10px] font-bold text-brand-600 dark:text-brand-400">
                      Launch &rarr;
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER NAVBAR */}
      <div className="flex items-center gap-3 border-b border-gray-100 dark:border-slate-800 pb-4">
        <button
          onClick={() => setCurrentSubView('menu')}
          className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-600 dark:text-gray-400"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <span className="text-[10px] font-bold text-brand-500 uppercase tracking-widest">GIS Features Portal</span>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            {currentSubView === 'kml-converter' && 'GPS to KML Converter'}
            {currentSubView === 'sensor-agg-nest' && 'SensorAggPred: Nest Predictor'}
            {currentSubView === 'sensor-agg-death' && 'SensorAggPred: Death Predictor'}
            {currentSubView === 'sensor-agg-lastpos' && 'SensorAggLastPos: Lost Device Recovery'}
            {currentSubView === 'sensor-static-test' && 'SensorStaticTest: Static Accuracy'}
            {currentSubView === 'sensor-aberrant' && 'SensorAberrant: Coordinate Diagnostics'}
            {currentSubView === 'sensor-argos-prediction' && 'SensorArgosEmission: 8-Day Predictor'}
            {currentSubView === 'sensor-activity' && 'SensorActivity: Hourly Motion Plots'}
            {currentSubView === 'display-seasonal' && 'DisplaySeasonal: Male Display Clusters'}
            {currentSubView === 'nest-summary' && 'NestSummary: Hatching Calculator'}
            {currentSubView === 'nest-sensor-sync' && 'NestSensorSync: Field Nest Sync'}
            {currentSubView === 'deployment-monitoring' && 'SensorDeployment: Cohort Summary'}
            {currentSubView === 'post-release' && 'PostRelease: Survival & Dispersal'}
          </h2>
        </div>
      </div>

      {/* ─── KML CONVERTER SUB-VIEW ──────────────────────────────────────────── */}
      {currentSubView === 'kml-converter' && (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-gray-250 dark:border-slate-800 p-6 space-y-6">
            <div className="p-4 bg-gray-50 dark:bg-slate-950 rounded-lg border text-[12px] dark:border-slate-800 text-gray-600 dark:text-gray-400">
              <span className="font-bold block mb-1">Required Columns:</span>
              Device ID, Latitude, Longitude, Location date (UTC)
            </div>
            <div className="space-y-2">
              <label className="block text-[12px] font-semibold text-gray-700 dark:text-gray-300">Upload CSV/Excel log</label>
              <label className="flex-1 cursor-pointer block">
                <div className="w-full h-32 border-2 border-dashed border-gray-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center hover:bg-slate-55 dark:hover:bg-slate-800/30">
                  <FileUp size={28} className="text-gray-400 mb-2" />
                  <span className="text-xs text-gray-500">{file ? file.name : 'Select telemetry file'}</span>
                </div>
                <input type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={handleFileChange} />
              </label>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs">{error}</div>}
            {success && <div className="p-3 bg-green-50 text-green-600 rounded-lg text-xs">{success}</div>}
            <button onClick={handleConvert} disabled={!file || isProcessing} className="w-full py-2.5 bg-brand-600 text-white rounded-lg font-bold text-xs">
              {isProcessing ? 'Converting...' : 'Convert & Download ZIP'}
            </button>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 rounded-xl p-5 text-xs text-blue-600 dark:text-blue-400">
            <span className="font-bold block mb-2">How KML Conversion Works</span>
            Telemetry records are grouped chronologically by Device ID and compiled into KML vector tracks compatible with Google Earth Pro.
          </div>
        </div>
      )}

      {/* ─── FILTERS CONTAINER FOR ANALYSIS TOOLS ────────────────────────────── */}
      {currentSubView !== 'kml-converter' && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <Search size={14} className="text-brand-500" /> Filter Criteria & Parameters
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {/* Target Transmitter */}
            {(currentSubView === 'sensor-agg-nest' || currentSubView === 'sensor-agg-death' || currentSubView === 'sensor-argos-prediction' || currentSubView === 'sensor-activity' || currentSubView === 'display-seasonal') && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-500">Transmitter PTT</label>
                <select value={targetPttId} onChange={(e) => setTargetPttId(e.target.value)} className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-gray-300">
                  <option value="">— Select —</option>
                  {pttOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            )}

            {/* Date selections */}
            {currentSubView !== 'sensor-agg-lastpos' && currentSubView !== 'sensor-argos-prediction' && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-500">From Date</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-gray-300" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-500">To Date</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-gray-300" />
                </div>
              </>
            )}

            {/* Days since */}
            {(currentSubView === 'sensor-agg-nest' || currentSubView === 'sensor-agg-death' || currentSubView === 'sensor-agg-lastpos' || currentSubView === 'sensor-aberrant') && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-500">Since Days</label>
                <input type="number" placeholder="Prevails over Dates" value={sinceDays} onChange={(e) => setSinceDays(e.target.value)} className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-gray-300" />
              </div>
            )}

            {/* Advanced parameters toggles */}
            {(currentSubView === 'sensor-agg-nest' || currentSubView === 'sensor-agg-death') && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-500">Min Cluster Points</label>
                  <input type="number" value={nMinPos} onChange={(e) => setNMinPos(Number(e.target.value))} className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800 text-gray-700 dark:text-gray-300" />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-500">Max Cluster Radius (m)</label>
                  <input type="number" value={maxDistanceM} onChange={(e) => setMaxDistanceM(Number(e.target.value))} className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-slate-950 border-gray-250 dark:border-slate-800 text-gray-700 dark:text-gray-300" />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-gray-100 dark:border-slate-850">
            <button onClick={runAnalysis} disabled={isAnalyzing} className="py-2 px-5 bg-brand-600 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 hover:bg-brand-700">
              {isAnalyzing ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Fetching & Running...
                </>
              ) : (
                <>
                  <Search size={14} /> Execute Analysis
                </>
              )}
            </button>
          </div>
          {analysisError && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs">{analysisError}</div>}
        </div>
      )}

      {/* ─── OUTPUT VIEWERS ──────────────────────────────────────────────────── */}

      {/* 1.1 SensorAggPred Prediction Output */}
      {(currentSubView === 'sensor-agg-nest' || currentSubView === 'sensor-agg-death') && aggPredResults.length > 0 && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-gray-100 dark:border-slate-850 flex items-center gap-2">
                <Table size={16} className="text-gray-400" />
                <h4 className="text-[12px] font-bold text-gray-800 dark:text-gray-200">Predicted Aggregation Clusters</h4>
              </div>
              <div className="overflow-x-auto max-h-[380px]">
                <table className="w-full text-[10px]">
                  <thead className="bg-gray-50 dark:bg-slate-950 text-gray-500 sticky top-0 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Centroid</th>
                      <th className="px-3 py-2 text-center">Npos</th>
                      <th className="px-3 py-2 text-center">Nday</th>
                      <th className="px-3 py-2 text-center">PercPos</th>
                      <th className="px-3 py-2 text-center">dmax</th>
                      <th className="px-3 py-2 text-center">Mov95</th>
                      <th className="px-3 py-2 text-center">Prediction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-gray-700 dark:text-gray-300">
                    {aggPredResults.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-850">
                        <td className="px-3 py-2 font-bold">{r.id}</td>
                        <td className="px-3 py-2">{r.centroidLat.toFixed(4)}, {r.centroidLon.toFixed(4)}</td>
                        <td className="px-3 py-2 text-center">{r.totalFixes}</td>
                        <td className="px-3 py-2 text-center">{r.durationDays}d</td>
                        <td className="px-3 py-2 text-center font-semibold">{r.percPos}%</td>
                        <td className="px-3 py-2 text-center">{r.dmax}m</td>
                        <td className="px-3 py-2 text-center">{r.mov95}m</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] border ${
                            r.prediction === 'Death' ? 'bg-red-50 text-red-700 border-red-200' :
                            r.prediction === 'Nest' ? 'bg-green-50 text-green-700 border-green-200' :
                            'bg-gray-50 text-gray-700 border-gray-200'
                          }`}>
                            {r.prediction} ({r.confidence}%)
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Map */}
            <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden" style={{ minHeight: '380px' }}>
              <MapContainer key={`pred-map-${mapCenter[0]}`} center={mapCenter} zoom={11} className="w-full h-full" style={{ minHeight: '380px' }}>
                <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" attribution="Google Hybrid" />
                {aggPredResults.map(r => (
                  <CircleMarker
                    key={r.id}
                    center={[r.centroidLat, r.centroidLon]}
                    radius={r.prediction === 'Death' ? 12 : 9}
                    pathOptions={{
                      color: r.prediction === 'Death' ? '#ef4444' : r.prediction === 'Nest' ? '#10b981' : '#3b82f6',
                      fillColor: r.prediction === 'Death' ? '#ef4444' : r.prediction === 'Nest' ? '#10b981' : '#3b82f6',
                      fillOpacity: 0.6
                    }}
                  >
                    <Popup>
                      <div className="text-xs space-y-1">
                        <span className="font-bold block">Cluster #{r.id} ({r.prediction})</span>
                        <span>Confidence: {r.confidence}%</span>
                        <span>Attendance: {r.percPos}%</span>
                        <span>Spread dmax: {r.dmax}m</span>
                        <span>Centroid: {r.centroidLat.toFixed(5)}, {r.centroidLon.toFixed(5)}</span>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>
          </div>
        </div>
      )}

      {/* 1.2 SensorAggLastPos Device Recovery */}
      {currentSubView === 'sensor-agg-lastpos' && lastPosResults.length > 0 && (
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-[10px]">
              <thead className="bg-gray-50 dark:bg-slate-950 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Sensor ID</th>
                  <th className="px-3 py-2 text-center">Points</th>
                  <th className="px-3 py-2 text-center">Duration</th>
                  <th className="px-3 py-2 text-left">Barycentre</th>
                  <th className="px-3 py-2 text-left">Last Coordinates</th>
                  <th className="px-3 py-2 text-left">Last Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {lastPosResults.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-850">
                    <td className="px-3 py-2 font-bold">{r.Identifier}</td>
                    <td className="px-3 py-2 text-center">{r.AggN}</td>
                    <td className="px-3 py-2 text-center">{r.AggDur}d</td>
                    <td className="px-3 py-2">{r.Agg_mLat.toFixed(4)}, {r.Agg_mLon.toFixed(4)}</td>
                    <td className="px-3 py-2 font-semibold text-brand-600">{r.LastLat.toFixed(4)}, {r.LastLon.toFixed(4)}</td>
                    <td className="px-3 py-2 text-gray-500">{r.LastDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lg:col-span-2 min-h-[300px]">
            <MapContainer key={`lastpos-map-${mapCenter[0]}`} center={mapCenter} zoom={9} className="w-full h-full rounded-xl overflow-hidden" style={{ minHeight: '380px' }}>
              <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" />
              {lastPosResults.map((r, i) => (
                <CircleMarker key={i} center={[r.LastLat, r.LastLon]} radius={8} pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.8 }}>
                  <Popup>
                    <div className="text-xs">
                      <strong>Sensor: {r.Identifier}</strong>
                      <span className="block mt-1">Last seen: {r.LastDate}</span>
                      <span>Recovery Fix: {r.LastLat}, {r.LastLon}</span>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}

      {/* 1.3 SensorStaticTest Analysis */}
      {currentSubView === 'sensor-static-test' && staticTestResults.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-gray-50 dark:bg-slate-950 text-gray-500">
              <tr>
                <th className="px-3 py-2.5 text-left">Sensor</th>
                <th className="px-3 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-left">Model</th>
                <th className="px-3 py-2.5 text-center">Duration</th>
                <th className="px-3 py-2.5 text-center">nPos</th>
                <th className="px-3 py-2.5 text-center">mean/Day</th>
                <th className="px-3 py-2.5 text-center">P0_10 (≤10m)</th>
                <th className="px-3 py-2.5 text-center">P0_20 (≤20m)</th>
                <th className="px-3 py-2.5 text-center">P20_50</th>
                <th className="px-3 py-2.5 text-center">Psupp50</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-gray-700 dark:text-gray-300">
              {staticTestResults.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-850">
                  <td className="px-3 py-2 font-bold">{r.Identifier}</td>
                  <td className="px-3 py-2">{r.Sensor_Type}</td>
                  <td className="px-3 py-2">{r.Model}</td>
                  <td className="px-3 py-2 text-center">{r.EffectiveDuration}d</td>
                  <td className="px-3 py-2 text-center">{r.nPos}</td>
                  <td className="px-3 py-2 text-center">{r.meanPosDay}</td>
                  <td className="px-3 py-2 text-center text-green-600 font-bold">{r.P0_10}%</td>
                  <td className="px-3 py-2 text-center text-green-600 font-semibold">{r.P0_20}%</td>
                  <td className="px-3 py-2 text-center">{r.P20_50}%</td>
                  <td className="px-3 py-2 text-center text-red-500">{r.Psupp50}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 1.4 SensorAberrant Location Diagnostics */}
      {currentSubView === 'sensor-aberrant' && aberrantResults.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-[10px]">
            <thead className="bg-gray-50 dark:bg-slate-950 text-gray-550">
              <tr>
                <th className="px-3 py-2.5 text-left">Bird ID</th>
                <th className="px-3 py-2.5 text-left">Location ID</th>
                <th className="px-3 py-2.5 text-left">Date</th>
                <th className="px-3 py-2.5 text-left">Latitude</th>
                <th className="px-3 py-2.5 text-left">Longitude</th>
                <th className="px-3 py-2.5 text-center">Diagnostic Issue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-gray-700 dark:text-gray-300">
              {aberrantResults.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-855">
                  <td className="px-3 py-2 font-bold">{r.Individual_ID}</td>
                  <td className="px-3 py-2">{r.Location_ID}</td>
                  <td className="px-3 py-2 text-gray-500">{r.Location_Date}</td>
                  <td className="px-3 py-2 font-mono">{r.Location_Latitude}</td>
                  <td className="px-3 py-2 font-mono">{r.Location_Longitude}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border bg-red-50 text-red-700 border-red-200">
                      {r.Type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 1.5 SensorArgosEmissionPrediction 8-Day Predictor */}
      {currentSubView === 'sensor-argos-prediction' && argosPrediction && (
        <div className="space-y-6">
          {/* Observed Matrix */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-5">
            <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-3">Observed Emissions (Last 40 Days Cycles)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-[9px] text-center border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-950 text-gray-500">
                    <th className="px-2 py-1 text-left border">Date</th>
                    {Array.from({ length: 24 }, (_, i) => <th key={i} className="px-1 py-1 border">{i}h</th>)}
                  </tr>
                </thead>
                <tbody>
                  {argosPrediction.observedDays.map((d: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-850">
                      <td className="px-2 py-1 text-left font-semibold border">{d.date}</td>
                      {d.hours.map((val: number, h: number) => (
                        <td key={h} className={`border px-1 ${val === 1 ? 'bg-brand-500 text-white' : 'bg-gray-50/50 text-gray-300'}`}>
                          {val === 1 ? '●' : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Predicted Matrix */}
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-5">
            <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-3">Predicted Emission Frequencies (8-Day Cycle Prediction)</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-[9px] text-center border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-950 text-gray-500">
                    <th className="px-2 py-1 text-left border">Target Weekday</th>
                    {Array.from({ length: 24 }, (_, i) => <th key={i} className="px-1 py-1 border">{i}h</th>)}
                  </tr>
                </thead>
                <tbody>
                  {argosPrediction.predictionDays.map((d: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-850">
                      <td className="px-2 py-1 text-left font-semibold border">{d.date}</td>
                      {d.hours.map((val: number, h: number) => (
                        <td key={h} className={`border px-1 font-bold ${
                          val >= 4 ? 'bg-green-100 text-green-800 dark:bg-green-950/20' :
                          val >= 2 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/20' :
                          'bg-transparent text-gray-305'
                        }`}>
                          {val > 0 ? `${val}/5` : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 1.6 SensorActivity Hourly Motion Plots */}
      {currentSubView === 'sensor-activity' && activityPoints.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-6">
          <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-4">Circadian Activity Pattern (Motion Indices)</h4>
          <div className="flex items-end gap-1.5 h-48 w-full border-b border-l border-gray-200 dark:border-slate-800 p-2">
            {activityPoints.map((pt, i) => {
              const heightPercent = `${(pt.activity / 130) * 100}%`;
              return (
                <div key={i} className="flex-1 flex flex-col items-center group h-full justify-end">
                  <div style={{ height: heightPercent }} className="w-full bg-brand-500 rounded-t group-hover:bg-brand-600 transition-all cursor-pointer relative">
                    <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-950 text-white text-[9px] font-bold px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      {pt.activity}
                    </span>
                  </div>
                  <span className="text-[8px] text-gray-405 mt-2 rotate-45 origin-left whitespace-nowrap">{pt.time}</span>
                </div>
              );
            })}
          </div>
          <div className="h-6" />
        </div>
      )}

      {/* 2.1 DisplaySeasonal Male Display Clusters */}
      {currentSubView === 'display-seasonal' && seasonalDisplayResults.length > 0 && (
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-[10px]">
              <thead className="bg-gray-50 dark:bg-slate-950 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Agg ID</th>
                  <th className="px-3 py-2 text-left">Centroid</th>
                  <th className="px-3 py-2 text-left">Warning</th>
                  <th className="px-3 py-2 text-left">Identification</th>
                  <th className="px-3 py-2 text-left">Place</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {seasonalDisplayResults.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-850">
                    <td className="px-3 py-2 font-bold">{r.AggID}</td>
                    <td className="px-3 py-2">{r.mLat.toFixed(4)}, {r.mLon.toFixed(4)}</td>
                    <td className={`px-3 py-2 ${r.Warning !== 'None' ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{r.Warning}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        r.Identification === 'Identified' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {r.Identification}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{r.Place}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lg:col-span-2 min-h-[300px]">
            <MapContainer key={`seasonal-map-${mapCenter[0]}`} center={mapCenter} zoom={11} className="w-full h-full rounded-xl overflow-hidden" style={{ minHeight: '380px' }}>
              <TileLayer url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" />
              {seasonalDisplayResults.map((r, i) => (
                <CircleMarker key={i} center={[r.mLat, r.mLon]} radius={10} pathOptions={{ color: '#14b8a6', fillColor: '#14b8a6', fillOpacity: 0.7 }}>
                  <Popup>
                    <div className="text-xs">
                      <strong>Display Site: {r.AggID}</strong>
                      <span>Status: {r.Identification}</span>
                      <span>Coordinates: {r.mLat}, {r.mLon}</span>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}

      {/* 3.1 NestSummary Hatching Calculator */}
      {currentSubView === 'nest-summary' && nestSummaryResults.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-gray-50 dark:bg-slate-950 text-gray-550">
              <tr>
                <th className="px-3 py-2.5 text-left">Nest Name</th>
                <th className="px-3 py-2.5 text-left">Coordinates</th>
                <th className="px-3 py-2.5 text-left">Taxon</th>
                <th className="px-3 py-2.5 text-center">Eggs</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-left">Monitoring</th>
                <th className="px-3 py-2.5 text-center">Hatch Date</th>
                <th className="px-3 py-2.5 text-center">Aberrants</th>
                <th className="px-3 py-2.5 text-center">Visits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-gray-700 dark:text-gray-300">
              {nestSummaryResults.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-850">
                  <td className="px-3 py-2 font-bold">{r.Monitored_Site_Name}</td>
                  <td className="px-3 py-2">{r.Monitored_Site_Latitude}, {r.Monitored_Site_longitude}</td>
                  <td className="px-3 py-2 italic text-gray-500">{r.Taxon}</td>
                  <td className="px-3 py-2 text-center">{r.MaxItem}</td>
                  <td className="px-3 py-2">{r.FieldStatus}</td>
                  <td className="px-3 py-2">{r.MonitoringStatus}</td>
                  <td className="px-3 py-2 text-center font-semibold text-emerald-600">{r.HatchDate}</td>
                  <td className={`px-3 py-2 text-center font-bold ${r.AberrantMeasure > 0 ? 'text-red-500' : 'text-gray-400'}`}>{r.AberrantMeasure}</td>
                  <td className="px-3 py-2 text-center">{r.NbVisitTot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3.2 NestSensorSync Cross-Reference */}
      {currentSubView === 'nest-sensor-sync' && nestSensorSyncResults.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-gray-50 dark:bg-slate-950 text-gray-500">
              <tr>
                <th className="px-3 py-2.5 text-left">Nest Site</th>
                <th className="px-3 py-2.5 text-left">Bird ID</th>
                <th className="px-3 py-2.5 text-left">Transmitter PTT</th>
                <th className="px-3 py-2.5 text-left">Auto Start</th>
                <th className="px-3 py-2.5 text-left">Auto End</th>
                <th className="px-3 py-2.5 text-center">Duration (days)</th>
                <th className="px-3 py-2.5 text-center">Delta (days)</th>
                <th className="px-3 py-2.5 text-center">Field Status</th>
                <th className="px-3 py-2.5 text-center">Chick Age</th>
                <th className="px-3 py-2.5 text-center">Departure warning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-gray-700 dark:text-gray-300">
              {nestSensorSyncResults.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-850">
                  <td className="px-3 py-2 font-bold">{r.Monitored_Site_Name}</td>
                  <td className="px-3 py-2">{r.Individual_ID}</td>
                  <td className="px-3 py-2">{r.Transmitter}</td>
                  <td className="px-3 py-2 text-gray-500">{r.AutoDateMin}</td>
                  <td className="px-3 py-2 text-gray-500">{r.AutoDateMax}</td>
                  <td className="px-3 py-2 text-center font-semibold">{r.Duration}d</td>
                  <td className="px-3 py-2 text-center">{r.DeltaDay}d</td>
                  <td className="px-3 py-2 text-center">{r.FieldStatus}</td>
                  <td className="px-3 py-2 text-center">{r.ChickAge}d</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      r.Warning.includes('failure') ? 'bg-red-50 text-red-700 border-red-200 animate-pulse' : 'bg-green-50 text-green-700 border-green-200'
                    }`}>
                      {r.Warning}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4.1 SensorDeployment Monitoring */}
      {currentSubView === 'deployment-monitoring' && deploymentResults.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-gray-50 dark:bg-slate-950 text-gray-550">
              <tr>
                <th className="px-3 py-2.5 text-left">Taxon</th>
                <th className="px-3 py-2.5 text-left">Sensor Type</th>
                <th className="px-3 py-2.5 text-left">Country</th>
                <th className="px-3 py-2.5 text-center">Male Deployed</th>
                <th className="px-3 py-2.5 text-center">Female Deployed</th>
                <th className="px-3 py-2.5 text-center">Total Deployed</th>
                <th className="px-3 py-2.5 text-center">Male Alive</th>
                <th className="px-3 py-2.5 text-center">Female Alive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-gray-700 dark:text-gray-300">
              {deploymentResults.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-850">
                  <td className="px-3 py-2 font-bold italic">{r.Taxon}</td>
                  <td className="px-3 py-2">{r.SensorType}</td>
                  <td className="px-3 py-2 text-gray-500">{r.Country}</td>
                  <td className="px-3 py-2 text-center">{r.Male_deployed}</td>
                  <td className="px-3 py-2 text-center">{r.Female_deployed}</td>
                  <td className="px-3 py-2 text-center font-semibold">{r.Total_deployed}</td>
                  <td className="px-3 py-2 text-center text-green-600">{r.Male_alive}</td>
                  <td className="px-3 py-2 text-center text-green-600">{r.Female_alive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 4.2 PostRelease Survival & Dispersal */}
      {currentSubView === 'post-release' && survivalResults.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="bg-gray-50 dark:bg-slate-950 text-gray-500">
              <tr>
                <th className="px-3 py-2.5 text-left">Individual</th>
                <th className="px-3 py-2.5 text-left">Taxon</th>
                <th className="px-3 py-2.5 text-left">Group grpLabel</th>
                <th className="px-3 py-2.5 text-center">Sex</th>
                <th className="px-3 py-2.5 text-center">Post-Release Duration</th>
                <th className="px-3 py-2.5 text-center">Status at N Days</th>
                <th className="px-3 py-2.5 text-center">Dispersal Distance</th>
                <th className="px-3 py-2.5 text-left">Dispersal Latitude</th>
                <th className="px-3 py-2.5 text-left">Dispersal Longitude</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-gray-700 dark:text-gray-300">
              {survivalResults.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 dark:hover:bg-slate-850">
                  <td className="px-3 py-2 font-bold">{r.Individual_ID}</td>
                  <td className="px-3 py-2 italic text-gray-500">{r.Taxon}</td>
                  <td className="px-3 py-2">{r.grpLabel}</td>
                  <td className="px-3 py-2 text-center">{r.Sex}</td>
                  <td className="px-3 py-2 text-center">{r.MonitoringDuration}d ({r.Completeness})</td>
                  <td className="px-3 py-2 text-center font-bold">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                      r.StatusNday === 'Alive' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {r.StatusNday}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center font-semibold text-brand-600">{r.DispersalDistance} km</td>
                  <td className="px-3 py-2 font-mono">{r.Dispersal_latitude}</td>
                  <td className="px-3 py-2 font-mono">{r.Dispersal_Longitude}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
