import { Position, Transmitter } from '../types';

export interface LocationClassPercentage {
  lc: string;
  label: string;
  count: number;
  percentage: number;
}

export interface StaticTestResult {
  transmitterId: string;
  model?: string;
  statusType: string;
  fromDate: string;
  toDate: string;
  effectiveDurationDays: number;
  mLat: number;
  mLon: number;
  nPos: number;
  nDay0Pos: number;
  meanPosDay: number;
  medianPosDay: number;
  minPosDay: number;
  maxPosDay: number;
  p0_10: number;    // % <= 10m
  p0_20: number;    // % <= 20m
  p20_50: number;   // % 20-50m
  psupp50: number;  // % > 50m
  nPosArgos: number;
  nDay0PosArgos: number;
}

// Distance helper in meters (Haversine formula)
export const haversineDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * 1. Normal Fix Accuracy Calculation
 * Computes percentage breakdown across location classes (3, 2, 1, 0, A, B, Z)
 */
export const calculateNormalAccuracy = (
  positions: Position[],
  selectedTxIds: string[],
  startDateStr: string,
  endDateStr: string
): { chartData: LocationClassPercentage[]; totalFixes: number } => {
  const startTime = new Date(startDateStr).getTime();
  const endTime = new Date(endDateStr).setHours(23, 59, 59, 999);

  const filteredFixes = positions.filter((p) => {
    const pTime = new Date(p.timestamp).getTime();
    if (isNaN(pTime) || pTime < startTime || pTime > endTime) return false;
    if (selectedTxIds.length > 0 && !selectedTxIds.includes(String(p.transmitter_id))) return false;
    return true;
  });

  const totalFixes = filteredFixes.length;
  const lcCounts: Record<string, number> = {
    'GPS': 0,
    '3': 0,
    '2': 0,
    '1': 0,
    '0': 0,
    'A': 0,
    'B': 0,
    'Z': 0
  };

  filteredFixes.forEach((p) => {
    const locType = String(p.locationType || '').toUpperCase();
    const lcUp = String(p.lc || '').toUpperCase();

    if (locType === 'GPS' || lcUp === 'GPS' || lcUp === 'G') {
      lcCounts['GPS']++;
    } else if (p.lc && lcCounts[p.lc] !== undefined) {
      lcCounts[p.lc]++;
    } else if (lcUp && lcCounts[lcUp] !== undefined) {
      lcCounts[lcUp]++;
    } else {
      lcCounts['Z']++;
    }
  });

  const lcLabels: Record<string, string> = {
    'GPS': 'GPS Class (<30m)',
    '3': 'Class 3 (<250m)',
    '2': 'Class 2 (<500m)',
    '1': 'Class 1 (<1500m)',
    '0': 'Class 0 (>1500m)',
    'A': 'Class A (No limits)',
    'B': 'Class B (No limits)',
    'Z': 'Class Z (Invalid)'
  };

  const chartData: LocationClassPercentage[] = Object.keys(lcLabels).map((lcKey) => {
    const count = lcCounts[lcKey] || 0;
    const percentage = totalFixes > 0 ? Number(((count / totalFixes) * 100).toFixed(1)) : 0;
    return {
      lc: lcKey,
      label: lcLabels[lcKey],
      count,
      percentage
    };
  });

  return { chartData, totalFixes };
};

/**
 * 2. Static Test Accuracy Calculation (SensorStaticTest.R algorithm)
 * Rules:
 * - Excludes initial 2 days and final 1 day of test (total 3 days excluded)
 * - Barycentre: mean(lat), mean(lon) of GPS fixes during effective duration
 * - Distance from barycentre computed for each fix
 * - Spatial accuracy percentages: P0_10 (<=10m), P0_20 (<=20m), P20_50 (20-50m), Psupp50 (>50m)
 */
export const calculateStaticTestAccuracy = (
  positions: Position[],
  transmitters: Transmitter[],
  selectedTxIds: string[],
  startDateStr: string,
  endDateStr: string
): {
  results: StaticTestResult[];
  aggregateSpatial: { bin: string; percentage: number; label: string }[];
  totalStaticFixes: number;
} => {
  const filterStartTime = new Date(startDateStr).getTime();
  const filterEndTime = new Date(endDateStr).setHours(23, 59, 59, 999);

  // Identify transmitters that have derived_status or status as Static test
  const staticTransmitters = transmitters.filter((t) => {
    const st = t.derived_status || t.status;
    const isStatic = st === 'Static test' || st === 'Static Test' || st === 'static';
    if (!isStatic) return false;
    if (selectedTxIds.length > 0 && !selectedTxIds.includes(String(t.platform_id))) return false;
    return true;
  });

  const results: StaticTestResult[] = [];

  let aggP0_10_count = 0;
  let aggP0_20_count = 0;
  let aggP20_50_count = 0;
  let aggPsupp50_count = 0;
  let totalStaticFixes = 0;

  staticTransmitters.forEach((t) => {
    // Get all fixes for this transmitter within the selected date window
    const txFixes = positions
      .filter((p) => {
        if (String(p.transmitter_id) !== String(t.platform_id)) return false;
        const pTime = new Date(p.timestamp).getTime();
        return !isNaN(pTime) && pTime >= filterStartTime && pTime <= filterEndTime;
      })
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (txFixes.length === 0) return;

    const firstFixTime = new Date(txFixes[0].timestamp).getTime();
    const lastFixTime = new Date(txFixes[txFixes.length - 1].timestamp).getTime();

    // Remove first 2 days and last 1 day as per SensorStaticTest.R
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const ONE_DAY_MS = 1 * 24 * 60 * 60 * 1000;

    const effectiveStartTime = firstFixTime + TWO_DAYS_MS;
    const effectiveEndTime = lastFixTime - ONE_DAY_MS;

    const effectiveDurationDays = Math.max(0, (effectiveEndTime - effectiveStartTime) / (24 * 60 * 60 * 1000));

    // If test session is less than 3 days, effective duration is <= 0 -> skip per SensorStaticTest.R
    let effectiveFixes = txFixes.filter((p) => {
      const pTime = new Date(p.timestamp).getTime();
      return pTime >= effectiveStartTime && pTime <= effectiveEndTime;
    });

    // Fallback: If duration is short, analyze all fixes in window to display useful telemetry
    if (effectiveFixes.length === 0) {
      effectiveFixes = txFixes;
    }

    const gpsFixes = effectiveFixes.filter((p) => {
      const locType = String(p.locationType || '').toUpperCase();
      const lcUp = String(p.lc || '').toUpperCase();
      return locType === 'GPS' || lcUp === 'GPS' || lcUp === 'G' || (!p.locationType && (!p.lc || p.lc === '3'));
    });
    const argosFixes = effectiveFixes.filter((p) => {
      const locType = String(p.locationType || '').toUpperCase();
      const lcUp = String(p.lc || '').toUpperCase();
      return locType === 'DOPPLER' || (p.lc && !['GPS', 'G'].includes(lcUp) && p.lc !== '3');
    });

    if (gpsFixes.length === 0) return;

    // Barycentre of GPS localizations (mLat, mLon)
    const mLat = gpsFixes.reduce((sum, p) => sum + p.lat, 0) / gpsFixes.length;
    const mLon = gpsFixes.reduce((sum, p) => sum + p.lon, 0) / gpsFixes.length;

    // Distances from barycentre
    let count0_10 = 0;
    let count0_20 = 0;
    let count20_50 = 0;
    let countSupp50 = 0;

    gpsFixes.forEach((p) => {
      const dist = haversineDistanceMeters(p.lat, p.lon, mLat, mLon);
      if (dist <= 10) {
        count0_10++;
        count0_20++;
      } else if (dist <= 20) {
        count0_20++;
      } else if (dist <= 50) {
        count20_50++;
      } else {
        countSupp50++;
      }
    });

    aggP0_10_count += count0_10;
    aggP0_20_count += count0_20;
    aggP20_50_count += count20_50;
    aggPsupp50_count += countSupp50;
    totalStaticFixes += gpsFixes.length;

    const nGps = gpsFixes.length;
    const p0_10 = nGps > 0 ? Number(((count0_10 / nGps) * 100).toFixed(1)) : 0;
    const p0_20 = nGps > 0 ? Number(((count0_20 / nGps) * 100).toFixed(1)) : 0;
    const p20_50 = nGps > 0 ? Number(((count20_50 / nGps) * 100).toFixed(1)) : 0;
    const psupp50 = nGps > 0 ? Number(((countSupp50 / nGps) * 100).toFixed(1)) : 0;

    // Daily statistics
    const dailyFixCounts: Record<string, number> = {};
    gpsFixes.forEach((p) => {
      const dayKey = p.timestamp.split('T')[0];
      dailyFixCounts[dayKey] = (dailyFixCounts[dayKey] || 0) + 1;
    });

    const dayCounts = Object.values(dailyFixCounts);
    const daysTested = Math.max(1, Math.ceil(effectiveDurationDays || 1));
    const nDay0Pos = Math.max(0, daysTested - dayCounts.length);

    const meanPosDay = dayCounts.length > 0 ? Number((nGps / daysTested).toFixed(1)) : 0;

    // Median
    const sortedCounts = [...dayCounts].sort((a, b) => a - b);
    let medianPosDay = 0;
    if (sortedCounts.length > 0) {
      const mid = Math.floor(sortedCounts.length / 2);
      medianPosDay = sortedCounts.length % 2 !== 0 ? sortedCounts[mid] : (sortedCounts[mid - 1] + sortedCounts[mid]) / 2;
    }

    const minPosDay = sortedCounts.length > 0 ? sortedCounts[0] : 0;
    const maxPosDay = sortedCounts.length > 0 ? sortedCounts[sortedCounts.length - 1] : 0;

    // Argos statistics
    const argosDailyCounts: Record<string, number> = {};
    argosFixes.forEach((p) => {
      const dayKey = p.timestamp.split('T')[0];
      argosDailyCounts[dayKey] = (argosDailyCounts[dayKey] || 0) + 1;
    });
    const nDay0PosArgos = Math.max(0, daysTested - Object.keys(argosDailyCounts).length);

    results.push({
      transmitterId: t.platform_id,
      model: t.model,
      statusType: 'Static test',
      fromDate: new Date(firstFixTime).toISOString().split('T')[0],
      toDate: new Date(lastFixTime).toISOString().split('T')[0],
      effectiveDurationDays: Number(effectiveDurationDays.toFixed(1)),
      mLat: Number(mLat.toFixed(5)),
      mLon: Number(mLon.toFixed(5)),
      nPos: nGps,
      nDay0Pos,
      meanPosDay,
      medianPosDay,
      minPosDay,
      maxPosDay,
      p0_10,
      p0_20,
      p20_50,
      psupp50,
      nPosArgos: argosFixes.length,
      nDay0PosArgos
    });
  });

  const aggregateSpatial = [
    { bin: '≤10m', label: 'P0_10 (≤10m)', percentage: totalStaticFixes > 0 ? Number(((aggP0_10_count / totalStaticFixes) * 100).toFixed(1)) : 0 },
    { bin: '≤20m', label: 'P0_20 (≤20m)', percentage: totalStaticFixes > 0 ? Number(((aggP0_20_count / totalStaticFixes) * 100).toFixed(1)) : 0 },
    { bin: '20-50m', label: 'P20_50 (20-50m)', percentage: totalStaticFixes > 0 ? Number(((aggP20_50_count / totalStaticFixes) * 100).toFixed(1)) : 0 },
    { bin: '>50m', label: 'Psupp50 (>50m)', percentage: totalStaticFixes > 0 ? Number(((aggPsupp50_count / totalStaticFixes) * 100).toFixed(1)) : 0 }
  ];

  return { results, aggregateSpatial, totalStaticFixes };
};
