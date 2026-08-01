export interface LSTFetchResult {
  temp: number;
  source: string;
  timezone?: string;
  apiUsed: 'Archive' | 'Forecast';
}

/**
 * Fetches Land Surface Temperature (LST) or soil/air temperature for a given coordinate and timestamp.
 * Handles historical queries back 5+ years using Open-Meteo Archive API (ERA5/ERA5-Land reanalysis)
 * and recent/future queries using Open-Meteo Forecast API.
 */
export const fetchLSTData = async (
  lat: number,
  lon: number,
  timestamp: string
): Promise<LSTFetchResult | null> => {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return null;

    const dateStr = date.toISOString().split('T')[0];
    const hour = date.getUTCHours();

    const now = new Date();
    const diffDays = (now.getTime() - date.getTime()) / (1000 * 3600 * 24);
    const isHistorical = diffDays > 5;

    const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=soil_temperature_0cm,soil_temperature_0_to_7cm,temperature_2m&timezone=auto`;
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=soil_temperature_0cm,soil_temperature_0_to_7cm,temperature_2m&timezone=auto`;

    const primaryUrl = isHistorical ? archiveUrl : forecastUrl;
    const fallbackUrl = isHistorical ? forecastUrl : archiveUrl;

    const extractTemp = (json: any, apiName: 'Archive' | 'Forecast'): LSTFetchResult | null => {
      if (!json || json.error || !json.hourly) return null;
      const h = json.hourly;
      const idx = (hour >= 0 && hour < 24) ? hour : 0;

      const s0 = h.soil_temperature_0cm?.[idx];
      const s7 = h.soil_temperature_0_to_7cm?.[idx];
      const t2 = h.temperature_2m?.[idx];

      let temp: number | null = null;
      let source = '';

      if (s0 !== null && s0 !== undefined) {
        temp = s0;
        source = 'Open-Meteo (Soil 0cm)';
      } else if (s7 !== null && s7 !== undefined) {
        temp = s7;
        source = 'Open-Meteo (Soil 0-7cm)';
      } else if (t2 !== null && t2 !== undefined) {
        temp = t2;
        source = 'Open-Meteo (Air 2m)';
      }

      if (temp !== null) {
        return {
          temp: Number(temp.toFixed(1)),
          source,
          timezone: json.timezone,
          apiUsed: apiName
        };
      }
      return null;
    };

    // Attempt 1: Primary API
    try {
      const res1 = await fetch(primaryUrl);
      const j1 = await res1.json();
      const result1 = extractTemp(j1, isHistorical ? 'Archive' : 'Forecast');
      if (result1) return result1;
    } catch (e) {
      // Continue to fallback
    }

    // Attempt 2: Fallback API
    try {
      const res2 = await fetch(fallbackUrl);
      const j2 = await res2.json();
      const result2 = extractTemp(j2, isHistorical ? 'Forecast' : 'Archive');
      if (result2) return result2;
    } catch (e) {
      // Fallback failed
    }

    return null;
  } catch (e) {
    return null;
  }
};
