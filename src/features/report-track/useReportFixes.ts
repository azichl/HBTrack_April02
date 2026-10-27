import { useState, useEffect, useRef } from 'react';
import { getHistoricalPositions } from '../../../services/firestoreService';
import { normalizePttId } from '../../../utils/formatting';
import { toFix } from './toFix';
import type { Fix } from './trackRenderModel';
import { normalizeFixes, isChronological, diagnoseOrder } from '../track-order/fixTime';

export function useReportFixes(pttId?: string, initialRawPositions?: any[]): {
  fixes: Fix[];
  isLoading: boolean;
  totalCount: number;
} {
  const [fixes, setFixes] = useState<Fix[]>(() => {
    if (initialRawPositions && initialRawPositions.length > 0) {
      const normalized = normalizeFixes(initialRawPositions, {
        getLat: (r: any) => r.lat ?? r.latitude,
        getLon: (r: any) => r.lon ?? r.longitude,
        getId: (r: any, i: number) => r.id ?? String(i)
      });
      return normalized.map(nf => toFix({ ...nf.raw, t: nf.t, lat: nf.lat, lon: nf.lon })).filter((f): f is Fix => f !== null);
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const lastFetchedKey = useRef<string>('');

  useEffect(() => {
    const cleanId = normalizePttId(pttId);
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

        const normalized = normalizeFixes(sortedTelemetry, {
          getLat: (r: any) => r.lat ?? r.latitude,
          getLon: (r: any) => r.lon ?? r.longitude,
          getId: (r: any, i: number) => r.id ?? String(i)
        });
        console.assert(isChronological(normalized), '[useReportFixes] Fixes must be strictly chronological by fix time');

        if (typeof window !== 'undefined' && window.location.search.includes('debug=order')) {
          const drawnBefore = [...rawPositions].map(r => normalizeFixes([r], { getLat: x => x.lat, getLon: x => x.lon })[0]).filter(Boolean);
          drawnBefore.sort((a, b) => (a.messageT ?? a.t) - (b.messageT ?? b.t));
          console.log(`[report-track] Order diagnostics for PTT ${cleanId}:`);
          console.log('Before fix (message order):');
          console.table(diagnoseOrder(drawnBefore));
          console.log('After fix (fix-time order):');
          console.table(diagnoseOrder(normalized));
        }

        const mapped: Fix[] = [];
        for (const nf of normalized) {
          const fx = toFix({ ...nf.raw, t: nf.t, lat: nf.lat, lon: nf.lon });
          if (fx) mapped.push(fx);
        }

        if (cleanId && mapped.length === 0) {
          console.error('[report-track] no fixes for', cleanId);
        }

        lastFetchedKey.current = cleanId;
        setFixes(mapped);
      } catch (err) {
        console.error('[report-track] error loading historical fixes:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchFixes();
    return () => { isMounted = false; };
  }, [pttId]);

  return {
    fixes,
    isLoading,
    totalCount: fixes.length,
  };
}
