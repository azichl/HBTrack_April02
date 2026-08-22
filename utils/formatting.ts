

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
  const str = String(ts);
  const dmyMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (dmyMatch) {
    const [_, d, m, y, h, min, s] = dmyMatch;
    return Date.UTC(Number(y), Number(m)-1, Number(d), Number(h), Number(min), Number(s));
  }
  const dmyMatch2 = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch2) {
    const [_, d, m, y] = dmyMatch2;
    return Date.UTC(Number(y), Number(m)-1, Number(d));
  }
  return new Date(str).getTime();
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
