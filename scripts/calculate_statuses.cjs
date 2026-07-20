/**
 * One-time script to calculate and set derived_status for all transmitters.
 * 
 * Run from the project root:
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json node scripts/calculate_statuses.cjs
 * 
 * OR from an environment with default credentials (e.g., Cloud Shell, or after `gcloud auth application-default login`).
 */

const admin = require('../functions/node_modules/firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = degreesToRadians(lat1);
  const p2 = degreesToRadians(lat2);
  const dp = degreesToRadians(lat2 - lat1);
  const dl = degreesToRadians(lon2 - lon1);
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBarycenter(positions) {
  if (positions.length === 0) return { lat: 0, lon: 0 };
  let sumLat = 0, sumLon = 0;
  positions.forEach(p => { sumLat += p.lat; sumLon += p.lon; });
  return { lat: sumLat / positions.length, lon: sumLon / positions.length };
}

function evaluateTransmitterStatus(transmitter, positions) {
  if (!positions || positions.length === 0) return 'Inactive';

  // Filter: only use GPS fixes or Doppler fixes with error under 500m
  const qualityPositions = positions.filter(p => {
    const locType = (p.locationType || '').toUpperCase();
    if (locType === 'GPS') return true;
    const dopplerErr = parseFloat(p.dopplerError || '0');
    if (dopplerErr > 0 && dopplerErr < 500) return true;
    const lc = String(p.lc || '').trim();
    if (['1', '2', '3'].includes(lc)) return true;
    return false;
  });

  // Use ALL positions for timestamp checks
  const allSorted = [...positions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const latestPos = allSorted[allSorted.length - 1];
  const latestTime = new Date(latestPos.timestamp).getTime();
  const now = Date.now();

  // 1. Inactive (> 10 days)
  if ((now - latestTime) / (1000 * 60 * 60 * 24) > 10) return 'Inactive';

  // If no quality positions, default to Active
  if (qualityPositions.length === 0) return 'Active';

  const sorted = [...qualityPositions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // 2. Static Test (70% of ALL quality points < 20m from global barycenter)
  const bc = calculateBarycenter(sorted);
  let near = 0;
  sorted.forEach(p => {
    if (calculateHaversineDistance(bc.lat, bc.lon, p.lat, p.lon) < 20) near++;
  });
  if ((near / sorted.length) >= 0.70) return 'Static test';

  // 3. Potential Mortality (last 4 days all < 20m from barycenter, spanning >= 3 days)
  const fourDaysAgo = latestTime - (4 * 24 * 60 * 60 * 1000);
  const recent = sorted.filter(p => new Date(p.timestamp).getTime() >= fourDaysAgo);
  if (recent.length > 0) {
    const first = new Date(recent[0].timestamp).getTime();
    if ((latestTime - first) / (1000 * 60 * 60 * 24) >= 3) {
      const rbc = calculateBarycenter(recent);
      let allNear = true;
      for (const p of recent) {
        if (calculateHaversineDistance(rbc.lat, rbc.lon, p.lat, p.lon) >= 20) { allNear = false; break; }
      }
      if (allNear) return 'Potential Mortality';
    }
  }

  return 'Active';
}

async function run() {
    console.log('Fetching transmitters...');
    const tSnap = await db.collection('transmitters').get();
    const transmitters = [];
    tSnap.forEach(doc => transmitters.push({ id: doc.id, ...doc.data() }));
    console.log(`Found ${transmitters.length} transmitters.`);

    let updatedCount = 0;

    for (const t of transmitters) {
        const posSnap = await db.collection('argos_positions')
            .where('platformId', '==', t.platform_id)
            .get();
        
        const positions = [];
        posSnap.forEach(doc => positions.push(doc.data()));

        const newStatus = evaluateTransmitterStatus(t, positions);
        
        console.log(`  ${t.platform_id}: ${positions.length} positions -> ${newStatus} (was: ${t.derived_status || 'None'})`);

        if (t.derived_status !== newStatus) {
            await db.collection('transmitters').doc(t.id).update({ derived_status: newStatus });
            updatedCount++;
        }
    }

    console.log(`\nDone. Updated ${updatedCount} / ${transmitters.length} transmitters.`);
}

run().catch(console.error).finally(() => process.exit(0));
