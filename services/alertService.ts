import * as countryCoder from '@rapideditor/country-coder';
import * as countries from 'i18n-iso-countries';
import englishCountries from 'i18n-iso-countries/langs/en.json';
import { Position, Alert } from '../types';

countries.registerLocale(englishCountries);

const deg2rad = (deg: number) => deg * (Math.PI / 180);

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export const getCountryFromCoords = (lat: number, lon: number): string | null => {
    try {
        const iso2 = countryCoder.iso1A2Code([lon, lat]);
        if (!iso2) return null;
        return countries.getName(iso2, 'en') || null;
    } catch (e) {
        console.error("Geocoding error: ", e);
        return null;
    }
};

export const analyzePositionsForAlerts = (
    newPositions: Position[], 
    existingPositions: Position[], 
    addAlert: (alert: Alert) => void
) => {
    // Filter out 0.0, 0.0 coords and only keep good fixes (error < 1000m: typically LC 3, 2, 1, or GPS)
    const isValidFix = (p: Position) => {
        if (p.lat === 0 && p.lon === 0) return false;
        // GPS fixes or Doppler fixes with accuracy under 500m (LC 3 or 2)
        if (p.locationType === 'GPS' || p.lc === ('G' as any)) return true;
        if (['3', '2'].includes(p.lc)) return true;
        return false;
    };

    const validNewPositions = newPositions.filter(isValidFix);

    // Group new positions by transmitter to find their chronological order
    const byTransmitter = new Map<string, Position[]>();
    validNewPositions.forEach(p => {
        if (!byTransmitter.has(p.transmitter_id)) {
            byTransmitter.set(p.transmitter_id, []);
        }
        byTransmitter.get(p.transmitter_id)!.push(p);
    });

    for (const [transmitterId, positions] of byTransmitter.entries()) {
        if (positions.length === 0) continue;
        
        // Sort chronologically
        positions.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        // Get the very last known VALID location BEFORE these new positions
        const oldPos = existingPositions
             .filter(p => p.transmitter_id === transmitterId && isValidFix(p))
             .sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
             
        let lastPos = oldPos;
        let lastCountry = oldPos ? getCountryFromCoords(oldPos.lat, oldPos.lon) : null;
        
        for (const pos of positions) {
             const currentCountry = getCountryFromCoords(pos.lat, pos.lon);
             if (lastCountry && currentCountry && lastCountry !== currentCountry) {
                 const alert: Alert = {
                     id: `alert-border-${pos.id}`,
                     transmitter_id: pos.transmitter_id,
                     type: 'border',
                     severity: 'info',
                     message: `Crossed border: ${lastCountry} ➝ ${currentCountry}`,
                     timestamp: pos.timestamp,
                     status: 'active',
                     location: { lat: pos.lat, lon: pos.lon }
                 };
                 addAlert(alert);
             }
             
             // Distance check (static threshold 50km for now)
             if (lastPos) {
                 const dist = calculateDistance(lastPos.lat, lastPos.lon, pos.lat, pos.lon);
                 if (dist > 50) {
                     const alert: Alert = {
                        id: `alert-dist-${pos.id}`,
                        transmitter_id: pos.transmitter_id,
                        type: 'distance',
                        severity: dist > 150 ? 'critical' : 'warning',
                        message: `Moved ${Math.round(dist)}km between fixes`,
                        timestamp: pos.timestamp,
                        status: 'active',
                        location: { lat: pos.lat, lon: pos.lon }
                     };
                     addAlert(alert);
                 }
             }

             if (currentCountry) lastCountry = currentCountry;
             lastPos = pos;
        }
    }
};
