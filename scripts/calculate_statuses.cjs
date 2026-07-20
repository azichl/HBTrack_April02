const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin (make sure you have GOOGLE_APPLICATION_CREDENTIALS set
// or it's running in an environment with default credentials, OR initialize with service account key)
// For local testing, we might need a service account key if not set.
// If you run this script locally, ensure you set the GOOGLE_APPLICATION_CREDENTIALS environment variable.

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

function degreesToRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = degreesToRadians(lat1);
  const φ2 = degreesToRadians(lat2);
  const Δφ = degreesToRadians(lat2 - lat1);
  const Δλ = degreesToRadians(lon2 - lon1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

function calculateBarycenter(positions) {
  if (positions.length === 0) return { lat: 0, lon: 0 };
  let sumLat = 0;
  let sumLon = 0;
  positions.forEach(p => {
    sumLat += p.lat;
    sumLon += p.lon;
  });
  return {
    lat: sumLat / positions.length,
    lon: sumLon / positions.length
  };
}

function evaluateTransmitterStatus(transmitter, positions) {
  if (!positions || positions.length === 0) {
    return 'Inactive';
  }

  // Sort positions by timestamp ascending
  const sorted = [...positions].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const latestPos = sorted[sorted.length - 1];
  const latestTime = new Date(latestPos.timestamp).getTime();
  const now = new Date().getTime();

  // 1. Check Inactive (> 10 days since last transmission)
  const daysSinceLastFix = (now - latestTime) / (1000 * 60 * 60 * 24);
  if (daysSinceLastFix > 10) {
    return 'Inactive';
  }

  // 2. Check Static Test (70% of ALL points < 20m from global barycenter)
  const globalBarycenter = calculateBarycenter(sorted);
  let pointsNearGlobalBarycenter = 0;
  sorted.forEach(p => {
    const dist = calculateHaversineDistance(globalBarycenter.lat, globalBarycenter.lon, p.lat, p.lon);
    if (dist < 20) {
      pointsNearGlobalBarycenter++;
    }
  });

  if ((pointsNearGlobalBarycenter / sorted.length) >= 0.70) {
    return 'Static test';
  }

  // 3. Check Potential Mortality (fixes over the last 4 days are all < 20m from their barycenter)
  const fourDaysAgo = latestTime - (4 * 24 * 60 * 60 * 1000);
  const recentPositions = sorted.filter(p => new Date(p.timestamp).getTime() >= fourDaysAgo);

  if (recentPositions.length > 0) {
    const firstRecentTime = new Date(recentPositions[0].timestamp).getTime();
    const durationDays = (latestTime - firstRecentTime) / (1000 * 60 * 60 * 24);
    
    // Only confidently call it mortality if we have data spanning at least 3 days in this 4-day window
    if (durationDays >= 3) {
      const recentBarycenter = calculateBarycenter(recentPositions);
      let allStationary = true;
      for (const p of recentPositions) {
        const dist = calculateHaversineDistance(recentBarycenter.lat, recentBarycenter.lon, p.lat, p.lon);
        if (dist >= 20) {
          allStationary = false;
          break;
        }
      }

      if (allStationary) {
        return 'Potential Mortality';
      }
    }
  }

  return 'Active';
}

async function run() {
    console.log('Fetching transmitters...');
    const snapshot = await db.collection('transmitters').get();
    const transmitters = [];
    snapshot.forEach(doc => {
        transmitters.push({ id: doc.id, ...doc.data() });
    });

    console.log(`Found ${transmitters.length} transmitters. Computing status...`);

    let updatedCount = 0;

    for (const t of transmitters) {
        // Fetch positions for this transmitter
        const posSnapshot = await db.collection('argos_positions')
            .where('platformId', '==', t.platform_id)
            .get();
        
        const positions = [];
        posSnapshot.forEach(doc => positions.push(doc.data()));

        const newStatus = evaluateTransmitterStatus(t, positions);
        
        if (t.derived_status !== newStatus) {
            console.log(`Updating ${t.platform_id}: ${t.derived_status || 'None'} -> ${newStatus}`);
            await db.collection('transmitters').doc(t.id).update({
                derived_status: newStatus
            });
            updatedCount++;
        }
    }

    console.log(`Finished updating ${updatedCount} transmitters.`);
}

run().catch(console.error).finally(() => process.exit(0));
