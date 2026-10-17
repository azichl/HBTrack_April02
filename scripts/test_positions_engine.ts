import { readFileSync } from 'node:fs';
import { 
  buildFixes, 
  buildTrack, 
  filterFixes, 
  lastFix, 
  byDateDesc, 
  parseUtc, 
  type RawFix 
} from '../utils/positionsEngine';

import { join } from 'node:path';

const cls: RawFix[] = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/cls_positions_43574.json'), 'utf8'));
const app: RawFix[] = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/app_export_43574.json'), 'utf8'));
const W = { fromMs: parseUtc('2026-10-16T07:46:00Z'), toMs: parseUtc('2026-10-17T07:46:00Z') };

console.log('================================================================');
console.log('RUNNING POSITIONS ENGINE TESTS (PTT 43574)');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(id: string, condition: boolean, message: string) {
  if (condition) {
    console.log(`[PASS] ${id}: ${message}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${id}: ${message}`);
    failCount++;
  }
}

// Suite 1: CLS Positions export (PTT 43574) is reproduced exactly
const { fixes, rejected } = buildFixes(cls);

assert('T1.1', rejected.length === 0, `Nothing rejected (got ${rejected.length})`);
assert('T1.2', fixes.length === 77, `Keeps every fix once: 77 fixes (got ${fixes.length})`);
assert('T1.3', fixes.filter(f => f.type === 'GPS').length === 12, `12 GPS fixes (got ${fixes.filter(f => f.type === 'GPS').length})`);
assert('T1.4', fixes.filter(f => f.type === 'DOPPLER').length === 65, `65 Doppler fixes (got ${fixes.filter(f => f.type === 'DOPPLER').length})`);

const trackGps = buildTrack(fixes, { ...W, type: 'GPS' });
assert('T2.1', trackGps.points.length === 12, `GPS filter + 24h window = 12 points (got ${trackGps.points.length})`);
assert('T2.2', trackGps.distanceKm > 1.5 && trackGps.distanceKm < 1.7, `CLS GPS path ~1.6 km (got ${trackGps.distanceKm.toFixed(3)} km)`);
assert('T2.3', trackGps.segments.length === 1, `Single contiguous segment (got ${trackGps.segments.length})`);

const lastG = lastFix(fixes, 'GPS')!;
assert('T3.1', Boolean(lastG) && new Date(lastG.t).toISOString() === '2026-10-17T07:00:00.000Z', `Last GPS is 2026-10-17 07:00:00 (got ${new Date(lastG.t).toISOString()})`);
assert('T3.2', Math.abs(lastG.lat - 43.8748) < 1e-4 && Math.abs(lastG.lon - 73.3084) < 1e-4, `Last GPS coords (43.8748, 73.3084) (got ${lastG.lat}, ${lastG.lon})`);

const lastAll = lastFix(fixes, 'ALL')!;
assert('T3.3', lastAll.type === 'DOPPLER' && new Date(lastAll.t).toISOString() === '2026-10-17T07:41:42.003Z', `Last overall is 07:41:42 Doppler (got ${lastAll.type} ${new Date(lastAll.t).toISOString()})`);

// Order independence
const shuffled = [...cls].sort(() => Math.random() - 0.5);
const trackA = buildTrack(buildFixes(shuffled).fixes, { ...W, type: 'ALL' });
const trackB = buildTrack(fixes, { ...W, type: 'ALL' });
const sameIds = trackA.points.map(p => p.id).join(',') === trackB.points.map(p => p.id).join(',');
assert('T4', sameIds, 'Shuffled input produces identical track IDs');

// Chronological
let isChronological = true;
const allPts = buildTrack(fixes, { ...W, type: 'ALL' }).points;
for (let i = 1; i < allPts.length; i++) {
  if (allPts[i].t < allPts[i - 1].t) {
    isChronological = false;
    break;
  }
}
assert('T5', isChronological, 'Track is strictly chronological by location date');

// Type separation
assert('T6.1', filterFixes(fixes, { type: 'GPS' }).every(f => f.type === 'GPS'), 'GPS filter returns only GPS');
assert('T6.2', filterFixes(fixes, { type: 'DOPPLER' }).every(f => f.type === 'DOPPLER'), 'DOPPLER filter returns only DOPPLER');

// Idempotent re-import
const reImport = buildFixes([...cls, ...cls]).fixes;
const sameReImport = reImport.map(f => f.id).join(',') === fixes.map(f => f.id).join(',');
assert('T7', sameReImport, 'Re-importing rows creates 0 new fixes (idempotent ids)');

// Suite 2: Duplicates seen in the web-app export (unit types DS + Houbara)
const appBuild = buildFixes(app);
const dop = appBuild.fixes.filter(f => f.type === 'DOPPLER');
assert('T8.1', app.length === 3, `App export has 3 raw rows`);
assert('T8.2', appBuild.fixes.length === 2, `Collapsed to 2 fixes (got ${appBuild.fixes.length})`);
assert('T8.3', dop.length === 1, `1 Doppler fix collapsed from DS + Houbara twins`);
assert('T8.4', dop[0].errorRadiusM === 1970, `Doppler error radius preserved at 1970m (got ${dop[0].errorRadiusM})`);
assert('T8.5', dop[0].unitTypes.slice().sort().join(',') === 'DS,Houbara', `unitTypes contains DS and Houbara (got ${dop[0].unitTypes.sort().join(',')})`);

const subSecBuild = buildFixes([
  ...cls.filter(r => r.locationDate === '2026-10-17T07:41:42.003Z'),
  ...app.filter(r => r.locationType === 'DOPPLER')
]);
assert('T9', subSecBuild.fixes.filter(f => f.type === 'DOPPLER').length === 1, `Doppler timestamps differing by <1s map to same fix (got ${subSecBuild.fixes.filter(f => f.type === 'DOPPLER').length})`);

// Suite 3: Why message date must never be used
const appGps = app.find(r => r.locationType === 'GPS')!;
const matchGps = fixes.filter(f => f.type === 'GPS' && Math.abs(f.lat - appGps.lat) < 6e-4 && Math.abs(f.lon - appGps.lon) < 6e-4);
assert('T10.1', matchGps.map(m => new Date(m.t).toISOString().slice(11, 16)).includes('02:01'), `Coordinates match CLS GPS fix of 02:01 (got ${matchGps.map(m => new Date(m.t).toISOString().slice(11, 16))})`);
assert('T10.2', parseUtc(appGps.locationDate) > matchGps[0].t, `App GPS date is hours later than true fix date (${new Date(parseUtc(appGps.locationDate)).toISOString()} vs ${new Date(matchGps[0].t).toISOString()})`);

console.log('\n================================================================');
console.log(`POSITIONS ENGINE RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================');

if (failCount > 0) process.exit(1);
