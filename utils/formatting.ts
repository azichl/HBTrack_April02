

export const formatDateTime = (isoString?: string | null, timeZone: string = 'UTC'): string => {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '-';
    
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: timeZone
    }).format(date).replace(',', '');
  } catch (e) {
    return '-';
  }
};

export const formatBattery = (voltage?: number): string => {
  if (voltage === undefined || voltage === null || voltage === 0) return '-- V';
  return `${voltage.toFixed(1)} V`;
};
