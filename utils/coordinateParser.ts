import { Bird, Transmitter } from '../types';
import { isBirdLinkedToTransmitter } from './formatting';

export interface ParsedBirdCommand {
  rawInput: string;
  identifier: string;
  lat?: number;
  lon?: number;
  formatDetected: 'DD' | 'DMM' | 'DMS' | 'URL' | 'ID_ONLY' | 'UNKNOWN';
}

export interface ResolvedBirdTarget {
  identifierUsed: string;
  matchedBy: 'PTT' | 'RING' | 'DARVIC' | 'MANUAL';
  pttId: string;
  bird: Bird | null;
  transmitter: Transmitter | null;
}

function dmsToDecimal(deg: number, min: number = 0, sec: number = 0, dir?: string): number {
  let dec = Math.abs(deg) + Math.abs(min) / 60 + Math.abs(sec) / 3600;
  if (deg < 0 || (dir && ['S', 'W', 'جنوب', 'غرب'].includes(dir.toUpperCase()))) {
    dec = -dec;
  }
  return Number(dec.toFixed(6));
}

export function parseBirdCoordinateCommand(input: string): ParsedBirdCommand {
  const raw = String(input || '').trim();
  if (!raw) {
    return { rawInput: '', identifier: '', formatDetected: 'UNKNOWN' };
  }

  let working = raw.replace(/^\/report\s+/i, '').trim();
  let lat: number | undefined;
  let lon: number | undefined;
  let formatDetected: ParsedBirdCommand['formatDetected'] = 'ID_ONLY';

  const urlMatch = working.match(/(?:q=|@|ll=)(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i);
  if (urlMatch) {
    lat = parseFloat(urlMatch[1]);
    lon = parseFloat(urlMatch[2]);
    formatDetected = 'URL';
    working = working.replace(/https?:\/\/\S+/gi, '').replace(urlMatch[0], ' ');
  }

  if (lat === undefined || lon === undefined) {
    const dmsRegex = /(\d{1,3})\s*[°ºd]\s*(\d{1,2})\s*['′m]\s*(\d{1,2}(?:\.\d+)?)\s*["″s]?\s*([NSns])?[\s,;:/]+(\d{1,3})\s*[°ºd]\s*(\d{1,2})\s*['′m]\s*(\d{1,2}(?:\.\d+)?)\s*["″s]?\s*([EWew])?/;
    const dmsMatch = working.match(dmsRegex);
    if (dmsMatch) {
      lat = dmsToDecimal(parseFloat(dmsMatch[1]), parseFloat(dmsMatch[2]), parseFloat(dmsMatch[3]), dmsMatch[4] || 'N');
      lon = dmsToDecimal(parseFloat(dmsMatch[5]), parseFloat(dmsMatch[6]), parseFloat(dmsMatch[7]), dmsMatch[8] || 'E');
      formatDetected = 'DMS';
      working = working.replace(dmsMatch[0], ' ');
    }
  }

  if (lat === undefined || lon === undefined) {
    const dmmRegex = /(\d{1,3})\s*[°ºd]\s*(\d{1,2}(?:\.\d+)?)\s*['′]?\s*([NSns])?[\s,;:/]+(\d{1,3})\s*[°ºd]\s*(\d{1,2}(?:\.\d+)?)\s*['′]?\s*([EWew])?/;
    const dmmMatch = working.match(dmmRegex);
    if (dmmMatch) {
      lat = dmsToDecimal(parseFloat(dmmMatch[1]), parseFloat(dmmMatch[2]), 0, dmmMatch[3] || 'N');
      lon = dmsToDecimal(parseFloat(dmmMatch[4]), parseFloat(dmmMatch[5]), 0, dmmMatch[6] || 'E');
      formatDetected = 'DMM';
      working = working.replace(dmmMatch[0], ' ');
    }
  }

  if (lat === undefined || lon === undefined) {
    const ddRegex = /(-?\d{1,2}\.\d{2,})\s*°?\s*([NSns])?[\s,;:/]+(-?\d{1,3}\.\d{2,})\s*°?\s*([EWew])?/;
    const ddMatch = working.match(ddRegex);
    if (ddMatch) {
      let parsedLat = parseFloat(ddMatch[1]);
      if (ddMatch[2] && ddMatch[2].toUpperCase() === 'S') parsedLat = -Math.abs(parsedLat);
      let parsedLon = parseFloat(ddMatch[3]);
      if (ddMatch[4] && ddMatch[4].toUpperCase() === 'W') parsedLon = -Math.abs(parsedLon);
      if (Math.abs(parsedLat) <= 90 && Math.abs(parsedLon) <= 180) {
        lat = Number(parsedLat.toFixed(6));
        lon = Number(parsedLon.toFixed(6));
        formatDetected = 'DD';
        working = working.replace(ddMatch[0], ' ');
      }
    }
  }

  const cleanedTokens = working
    .replace(/[,;|()]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && !['lat', 'lon', 'lng', 'coords', 'bird', 'ptt', 'ring', 'darvic', 'id'].includes(t.toLowerCase()));

  const identifier = cleanedTokens[0] || '';

  return {
    rawInput: raw,
    identifier,
    lat,
    lon,
    formatDetected: identifier || lat !== undefined ? formatDetected : 'UNKNOWN'
  };
}

export function resolveBirdOrTransmitter(
  queryId: string,
  transmitters: Transmitter[],
  birds: Bird[]
): ResolvedBirdTarget {
  const q = String(queryId || '').trim();
  const qClean = q.replace(/^(trans-|bird-)/i, '').trim();
  const qUpper = qClean.toUpperCase();

  const matchedTxByPtt = transmitters.find(
    t =>
      String(t.platform_id || '').trim().toUpperCase() === qUpper ||
      String(t.id || '').replace(/^trans-/i, '').trim().toUpperCase() === qUpper
  );
  if (matchedTxByPtt) {
    const linkedBird = birds.find(b => isBirdLinkedToTransmitter(b, matchedTxByPtt)) || null;
    return {
      identifierUsed: matchedTxByPtt.platform_id,
      matchedBy: 'PTT',
      pttId: matchedTxByPtt.platform_id,
      bird: linkedBird,
      transmitter: matchedTxByPtt
    };
  }

  const matchedBirdByRing = birds.find(
    b =>
      b.ring_id &&
      b.ring_id.toUpperCase() !== 'NA' &&
      (b.ring_id.trim().toUpperCase() === qUpper || b.id.replace(/^bird-/i, '').trim().toUpperCase() === qUpper)
  );
  if (matchedBirdByRing) {
    const linkedTx = transmitters.find(t => isBirdLinkedToTransmitter(matchedBirdByRing, t)) || null;
    return {
      identifierUsed: matchedBirdByRing.ring_id,
      matchedBy: 'RING',
      pttId: linkedTx?.platform_id || matchedBirdByRing.assigned_transmitter_id || matchedBirdByRing.ring_id,
      bird: matchedBirdByRing,
      transmitter: linkedTx
    };
  }

  const matchedBirdByDarvic = birds.find(
    b => b.darvic_number && b.darvic_number.trim().toUpperCase() === qUpper
  );
  if (matchedBirdByDarvic) {
    const linkedTx = transmitters.find(t => isBirdLinkedToTransmitter(matchedBirdByDarvic, t)) || null;
    return {
      identifierUsed: matchedBirdByDarvic.darvic_number!,
      matchedBy: 'DARVIC',
      pttId: linkedTx?.platform_id || matchedBirdByDarvic.assigned_transmitter_id || matchedBirdByDarvic.darvic_number!,
      bird: matchedBirdByDarvic,
      transmitter: linkedTx
    };
  }

  return {
    identifierUsed: qClean || 'NA',
    matchedBy: 'MANUAL',
    pttId: qClean || 'NA',
    bird: null,
    transmitter: null
  };
}
