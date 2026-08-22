

export const getSystemTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {
    return 'UTC';
  }
};

export const formatDateTime = (isoString?: string | null, timeZone?: string): string => {
  if (!isoString) return '-';
  try {
    // Ensure the timestamp is parsed as UTC if it lacks a timezone indicator (like Z or +00:00)
    let parsedString = isoString;
    if (!parsedString.endsWith('Z') && !parsedString.match(/[+-]\d{2}:?\d{2}$/)) {
        // Only append Z if it looks like a standard date string without timezone
        parsedString = parsedString.replace(' ', 'T'); // Handle "YYYY-MM-DD HH:mm:ss"
        parsedString += 'Z';
    }

    const date = new Date(parsedString);
    if (isNaN(date.getTime())) return '-';
    
    // Determine target timezone: if specified and not 'system'/'auto'/'local', use it.
    // Otherwise default to the system device's local timezone.
    let targetTz = timeZone;
    if (!targetTz || targetTz === 'system' || targetTz === 'auto' || targetTz === 'local') {
      targetTz = getSystemTimeZone();
    }
    
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: targetTz
    }).format(date).replace(',', '');
  } catch (e) {
    return '-';
  }
};

export const formatBattery = (voltage?: number): string => {
  if (voltage === undefined || voltage === null || voltage === 0) return '-- V';
  return `${voltage.toFixed(1)} V`;
};

export function safeParseTimestamp(ts: any): number {
  if (!ts) return NaN;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object') {
    if (typeof ts.seconds === 'number') return ts.seconds * 1000;
    if (typeof ts._seconds === 'number') return ts._seconds * 1000;
    if (ts.toDate && typeof ts.toDate === 'function') {
      try { return ts.toDate().getTime(); } catch (_) {}
    }
  }
  const str = String(ts).trim();
  if (!str) return NaN;

  // DD/MM/YYYY HH:mm:ss or DD/MM/YYYY HH:mm
  const dmyMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (dmyMatch) {
    const [_, d, m, y, h, min, s] = dmyMatch;
    return Date.UTC(Number(y), Number(m)-1, Number(d), Number(h), Number(min), Number(s || 0));
  }
  // DD/MM/YYYY
  const dmyMatch2 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch2) {
    const [_, d, m, y] = dmyMatch2;
    return Date.UTC(Number(y), Number(m)-1, Number(d));
  }
  // YYYY-MM-DD HH:mm:ss or YYYY-MM-DD HH:mm
  const ymdMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (ymdMatch) {
    const [_, y, m, d, h, min, s] = ymdMatch;
    return Date.UTC(Number(y), Number(m)-1, Number(d), Number(h), Number(min), Number(s || 0));
  }

  // Replace space with T for Safari/iOS compatibility
  const isoFormatted = str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str;
  const parsed = new Date(isoFormatted).getTime();
  return isNaN(parsed) ? new Date(str).getTime() : parsed;
}

export function getYearMonthKey(ts: any): string {
  if (!ts) return '';
  const timeMs = safeParseTimestamp(ts);
  if (isNaN(timeMs) || timeMs <= 0) return '';
  const d = new Date(timeMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getCurrentYearMonthKey(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
