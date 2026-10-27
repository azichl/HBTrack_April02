// src/features/track-order/useHistoryFixes.ts
import { useState, useEffect, useRef } from 'react';
import {
  normalizeFixes,
  isChronological,
  diagnoseOrder,
  type TimedFix,
  type OrderReport
} from './fixTime';
import { getHistoricalPositions } from '../../../services/firestoreService';
import { normalizePttId } from '../../../utils/formatting';

export function normalizeHistoryFixes<T = any>(records: readonly T[]): TimedFix<T>[] {
  const fixes = normalizeFixes(records, {
    getLat: (r: any) => r.lat ?? r.latitude,
    getLon: (r: any) => r.lon ?? r.longitude,
    getId: (r: any, i: number) => r.id ?? `${r.pttId || r.platformId || r.transmitter_id || 'fix'}_${i}`
  });
  console.assert(isChronological(fixes), '[track-order] Normalized fixes must be strictly chronological by fix time');
  return fixes;
}

export function logOrderDiagnostics(pttId: string, rawRecords: readonly any[], normalizedFixes: TimedFix<any>[]): {
  before: OrderReport;
  after: OrderReport;
} {
  // Order as drawn before fix: sorted by message date
  const drawnBefore = [...rawRecords]
    .map(r => normalizeFixes([r], {
      getLat: (x: any) => x.lat ?? x.latitude,
      getLon: (x: any) => x.lon ?? x.longitude,
      getId: (x: any, i: number) => x.id ?? String(i)
    })[0])
    .filter(Boolean);

  drawnBefore.sort((a, b) => {
    const ma = a.messageT ?? a.t;
    const mb = b.messageT ?? b.t;
    return ma - mb;
  });

  const repBefore = diagnoseOrder(drawnBefore);
  const repAfter = diagnoseOrder(normalizedFixes);

  console.log(`[track-order] Order diagnostics for PTT ${pttId}:`);
  console.log('--- Before Fix (message date order) ---');
  console.table(repBefore);
  console.log('--- After Fix (location fix date order) ---');
  console.table(repAfter);

  if (repAfter.fallbackCount > 0) {
    const fallbackIds = normalizedFixes.filter(f => f.usedFallback).map(f => f.id);
    console.warn(`[track-order] PTT ${pttId} has ${repAfter.fallbackCount} records without a fix date:`, fallbackIds);
  }

  return { before: repBefore, after: repAfter };
}

export function useHistoryFixes(pttId?: string, initialRawPositions?: any[]): {
  fixes: TimedFix<any>[];
  latestFix: TimedFix<any> | null;
  firstFix: TimedFix<any> | null;
  isLoading: boolean;
  totalCount: number;
} {
  const [fixes, setFixes] = useState<TimedFix<any>[]>(() => {
    if (initialRawPositions && initialRawPositions.length > 0) {
      return normalizeHistoryFixes(initialRawPositions);
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const lastFetchedKey = useRef<string>('');

  useEffect(() => {
    const cleanId = normalizePttId(pttId || '');
    if (!cleanId || cleanId === '0') {
      setFixes([]);
      return;
    }

    if (lastFetchedKey.current === cleanId && fixes.length > 0) {
      return;
    }

    let isMounted = true;
    const fetchFixes = async () => {
      setIsLoading(true);
      const now = new Date();
      const tenYearsAgo = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
      try {
        const rawPositions = await getHistoricalPositions([cleanId], tenYearsAgo, now);
        if (!isMounted) return;

        // Ensure the history track polyline sorts strictly by the actual location timestamp
        const sortedTelemetry = [...rawPositions].sort((a, b) => {
          const timeA = new Date(a.locationDate || a.fixTime || a.timestamp || 0).getTime();
          const timeB = new Date(b.locationDate || b.fixTime || b.timestamp || 0).getTime();
          return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB); // Oldest to newest chronological path
        });

        const normalized = normalizeHistoryFixes(sortedTelemetry);

        if (typeof window !== 'undefined' && window.location.search.includes('debug=order')) {
          logOrderDiagnostics(cleanId, rawPositions, normalized);
        }

        lastFetchedKey.current = cleanId;
        setFixes(normalized);
      } catch (err) {
        console.error('[track-order] Error loading historical fixes:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchFixes();
    return () => { isMounted = false; };
  }, [pttId]);

  return {
    fixes,
    latestFix: fixes.length > 0 ? fixes[fixes.length - 1] : null,
    firstFix: fixes.length > 0 ? fixes[0] : null,
    isLoading,
    totalCount: fixes.length,
  };
}
