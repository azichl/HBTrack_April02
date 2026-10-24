import { Bird, Transmitter } from '../../types';
import { BirdStatus, normalizeStatus } from '../constants/statusColors';
import { isBirdLinkedToTransmitter } from '../../utils/formatting';

export type IdKind = 'ptt' | 'ring' | 'darvic';

export interface ReportSubject {
  key: string;                                   // `${bird.id}:${transmitter?.id ?? 'none'}` — every cache/hook is keyed by this
  searched: { kind: IdKind; value: string };
  bird: Bird | null;                             // from the Bird table
  transmitters: Transmitter[];                   // all transmitters linked to the bird
  active?: Transmitter;                          // the one used for tracking
  display: {
    birdId: string;                              // subtitle value (searched kind: ptt | ring | darvic)
    transmitterId: string;                       // transmitter PTT or "No Transmitter" / "بدون جهاز"
    ringNumber: string;                          // bird.ring or "NA"
    mapChipLabel: string;                        // chip on map pins: PTT if exists, else ring, else darvic
  };
  release?: { date?: string; lat?: number; lon?: number };   // bird record first, else first fix
  latest?: { date: string; lat: number; lon: number };       // only if fixes exist
  track: { points: any[]; status: 'loading' | 'ready' | 'none' };
  status: { value: BirdStatus; source: 'transmitter' | 'bird'; editable: boolean };
}

export interface ResolveSubjectInput {
  birdId?: string;
  id?: string;
  kind?: IdKind;
  value?: string;
  pttId?: string;
}

export function cleanSubjectId(str?: string | null): string {
  return String(str || '').trim().toLowerCase().replace(/[\s_\-]+/g, '');
}

/**
 * Predicate to decide if a transmitter object represents a genuine hardware device
 * rather than a placeholder, "No Transmitter", or empty stub.
 */
export function isRealTransmitter(t?: Transmitter | null): boolean {
  if (!t) return false;
  const ptt = t.platform_id !== undefined ? String(t.platform_id).trim() : String(t.id || '').trim();
  const clean = ptt.replace(/^trans-/, '').toLowerCase();
  if (
    !clean ||
    clean === 'na' ||
    clean === 'n/a' ||
    clean === 'none' ||
    clean === 'null' ||
    clean === 'undefined' ||
    clean === 'not tagged' ||
    clean.includes('no transmitter') ||
    clean.includes('بدون جهاز')
  ) {
    return false;
  }
  return true;
}

/**
 * Resolves a unified ReportSubject from user input (PTT, Ring, or Darvic).
 * Single source of truth for all report blocks.
 */
export function resolveReportSubject(
  input: ResolveSubjectInput | string,
  birds: Bird[],
  transmitters: Transmitter[],
  language: 'ar' | 'en' = 'ar'
): ReportSubject {
  const queryStr = typeof input === 'string' ? input.trim() : (input.value || input.id || input.pttId || '').trim();
  const explicitBirdId = typeof input === 'object' ? input.birdId : undefined;
  const explicitKind = typeof input === 'object' ? input.kind : undefined;

  let resolvedBird: Bird | null = null;
  let resolvedTx: Transmitter | undefined = undefined;
  let detectedKind: IdKind = explicitKind || 'ptt';

  const cleanQuery = cleanSubjectId(queryStr);

  // 1. Resolve by explicit bird ID if provided
  if (explicitBirdId) {
    resolvedBird = birds.find(b => b.id === explicitBirdId) || null;
  }

  // 2. If not resolved, search by ring_id (case/space/dash insensitive)
  if (!resolvedBird && cleanQuery) {
    resolvedBird = birds.find(b => b.ring_id && cleanSubjectId(b.ring_id) === cleanQuery) || null;
    if (resolvedBird && !explicitKind) detectedKind = 'ring';
  }

  // 3. Search by darvic_number
  if (!resolvedBird && cleanQuery) {
    resolvedBird = birds.find(b => b.darvic_number && cleanSubjectId(b.darvic_number) === cleanQuery) || null;
    if (resolvedBird && !explicitKind) detectedKind = 'darvic';
  }

  // 4. Search by transmitter PTT or ID
  if (cleanQuery) {
    resolvedTx = transmitters.find(t => 
      cleanSubjectId(t.platform_id) === cleanQuery || 
      cleanSubjectId(t.id) === cleanQuery ||
      cleanSubjectId(String(t.platform_id).replace(/^trans-/, '')) === cleanQuery
    );
    if (resolvedTx && !explicitKind) detectedKind = 'ptt';
  }

  // If transmitter found but bird not resolved yet, find linked bird
  if (resolvedTx && !resolvedBird) {
    resolvedBird = birds.find(b => isBirdLinkedToTransmitter(b, resolvedTx!)) || null;
  }

  // If bird found but transmitter not resolved yet, find linked transmitters
  let linkedTransmitters: Transmitter[] = [];
  if (resolvedBird) {
    linkedTransmitters = transmitters.filter(t => 
      isBirdLinkedToTransmitter(resolvedBird!, t) ||
      t.bird_id === resolvedBird!.id ||
      resolvedBird!.assigned_transmitter_id === t.id ||
      resolvedBird!.assigned_transmitter_id === t.platform_id
    );
  } else if (resolvedTx) {
    linkedTransmitters = [resolvedTx];
  }

  // Active transmitter: prefer active/non-inactive from genuine devices, else first real transmitter
  const realTransmitters = linkedTransmitters.filter(isRealTransmitter);
  let activeTx = resolvedTx && isRealTransmitter(resolvedTx) ? resolvedTx : undefined;
  if (!activeTx && realTransmitters.length > 0) {
    activeTx = realTransmitters.find(t => {
      const st = (t.derived_status || t.status || '').toLowerCase();
      return st !== 'inactive';
    }) || realTransmitters[0];
  }

  const hasTransmitter = Boolean(activeTx);

  // Display values
  const searchedVal = queryStr || (activeTx ? activeTx.platform_id : (resolvedBird?.ring_id || ''));
  const noTransmitterLabel = language === 'ar' ? 'بدون جهاز' : 'No Transmitter';
  const transmitterId = activeTx ? String(activeTx.platform_id) : noTransmitterLabel;
  const rawRing = resolvedBird?.ring_id ? String(resolvedBird.ring_id).trim() : '';
  const ringNumber = rawRing && rawRing.toUpperCase() !== 'NA' ? rawRing : 'NA';

  let mapChipLabel = 'NA';
  if (activeTx) {
    mapChipLabel = String(activeTx.platform_id);
  } else if (ringNumber !== 'NA') {
    mapChipLabel = ringNumber;
  } else if (resolvedBird?.darvic_number) {
    mapChipLabel = resolvedBird.darvic_number;
  }

  // Release Coordinates
  let release: { date?: string; lat?: number; lon?: number } | undefined = undefined;
  if (resolvedBird) {
    const rLat = parseFloat(resolvedBird.release_lat);
    const rLon = parseFloat(resolvedBird.release_lon);
    if (!isNaN(rLat) && !isNaN(rLon)) {
      release = {
        date: resolvedBird.release_date || undefined,
        lat: rLat,
        lon: rLon
      };
    }
  }

  // Status
  let statusVal: BirdStatus = 'alive';
  let statusSource: 'transmitter' | 'bird' = 'transmitter';
  let statusEditable = false;

  if (hasTransmitter && activeTx) {
    statusVal = normalizeStatus(activeTx.derived_status || activeTx.status) || 'alive';
    statusSource = 'transmitter';
    statusEditable = false;
  } else if (resolvedBird) {
    statusVal = normalizeStatus((resolvedBird as any).status) || 'alive';
    statusSource = 'bird';
    statusEditable = true;
  }

  const birdKey = resolvedBird ? resolvedBird.id : 'nobird';
  const txKey = activeTx ? (activeTx.id || activeTx.platform_id) : 'notx';
  const key = `${birdKey}:${txKey}`;

  return {
    key,
    searched: { kind: detectedKind, value: searchedVal },
    bird: resolvedBird,
    transmitters: linkedTransmitters,
    active: activeTx,
    display: {
      birdId: searchedVal,
      transmitterId,
      ringNumber,
      mapChipLabel
    },
    release,
    latest: undefined, // populated after telemetry is loaded
    track: {
      points: [],
      status: activeTx ? 'loading' : 'none'
    },
    status: {
      value: statusVal,
      source: statusSource,
      editable: statusEditable
    }
  };
}
