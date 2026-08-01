export interface LSTFetchResult {
  airTemp: number | null;
  soilTemp: number | null;
  temp: number | null;
  source: string;
  timezone?: string;
  apiUsed: 'Archive' | 'Forecast';
}

/**
 * Fetches accurate meteorological Ambient Air (2m) and Surface/Soil temperature for a given coordinate and timestamp.
 * Uses strict UTC timezone indexing to prevent local vs UTC hour offsets.
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

    // Extract UTC date and hour for consistent API indexing
    const dateStr = date.toISOString().split('T')[0];
    const utcHour = date.getUTCHours();

    const now = new Date();
    const diffDays = (now.getTime() - date.getTime()) / (1000 * 3600 * 24);
    const isHistorical = diffDays > 5;

    // Detect coordinate local timezone (for popup display)
    let detectedTimezone: string | undefined = undefined;
    try {
      const tzRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=auto`);
      const tzJson = await tzRes.json();
      if (tzJson && tzJson.timezone) {
        detectedTimezone = tzJson.timezone;
      }
    } catch (e) {
      // Timezone lookup fallback
    }

    const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,soil_temperature_0cm,soil_temperature_0_to_7cm&timezone=UTC`;
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=temperature_2m,soil_temperature_0cm,soil_temperature_0_to_7cm&timezone=UTC`;

    const primaryUrl = isHistorical ? archiveUrl : forecastUrl;
    const fallbackUrl = isHistorical ? forecastUrl : archiveUrl;

    const extractTempData = (json: any, apiName: 'Archive' | 'Forecast'): LSTFetchResult | null => {
      if (!json || json.error || !json.hourly) return null;
      const h = json.hourly;
      const idx = (utcHour >= 0 && utcHour < 24) ? utcHour : 0;

      const rawAir = h.temperature_2m?.[idx];
      const s0 = h.soil_temperature_0cm?.[idx];
      const s7 = h.soil_temperature_0_to_7cm?.[idx];
      const rawSoil = (s0 !== null && s0 !== undefined) ? s0 : (s7 !== null && s7 !== undefined) ? s7 : null;

      const airTemp = (rawAir !== null && rawAir !== undefined) ? Number(rawAir.toFixed(1)) : null;
      const soilTemp = (rawSoil !== null && rawSoil !== undefined) ? Number(rawSoil.toFixed(1)) : null;
      const temp = airTemp !== null ? airTemp : soilTemp;

      if (airTemp !== null || soilTemp !== null) {
        return {
          airTemp,
          soilTemp,
          temp,
          source: apiName === 'Archive' ? 'Open-Meteo ERA5 (Archive)' : 'Open-Meteo (Forecast)',
          timezone: detectedTimezone || json.timezone,
          apiUsed: apiName
        };
      }
      return null;
    };

    // Attempt 1: Primary API
    try {
      const res1 = await fetch(primaryUrl);
      const j1 = await res1.json();
      const result1 = extractTempData(j1, isHistorical ? 'Archive' : 'Forecast');
      if (result1) return result1;
    } catch (e) {
      // Continue to fallback
    }

    // Attempt 2: Fallback API
    try {
      const res2 = await fetch(fallbackUrl);
      const j2 = await res2.json();
      const result2 = extractTempData(j2, isHistorical ? 'Forecast' : 'Archive');
      if (result2) return result2;
    } catch (e) {
      // Fallback failed
    }

    return null;
  } catch (e) {
    return null;
  }
};
