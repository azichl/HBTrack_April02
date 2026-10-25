import { useState, useEffect, useRef } from 'react';
import { getHistoricalPositions } from '../../../services/firestoreService';
import { normalizePttId } from '../../../utils/formatting';
import { toFix } from './toFix';
import type { Fix } from './trackRenderModel';

export function useReportFixes(pttId?: string, initialRawPositions?: any[]): {
  fixes: Fix[];
  isLoading: boolean;
  totalCount: number;
} {
  const [fixes, setFixes] = useState<Fix[]>(() => {
    if (initialRawPositions && initialRawPositions.length > 0) {
      return initialRawPositions.map(toFix).filter((f): f is Fix => f !== null).sort((a, b) => a.t - b.t);
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

        const mapped: Fix[] = [];
        for (const r of rawPositions) {
          const fx = toFix(r);
          if (fx) mapped.push(fx);
        }
        mapped.sort((a, b) => a.t - b.t);

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
