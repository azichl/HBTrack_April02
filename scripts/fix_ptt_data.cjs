/**
 * fix_ptt_data.cjs — One-time Firestore fix for PTT 36130 and PTT 244292
 * 
 * 1. PTT 36130: Set to Inactive (phantom Static test on dashboard)
 * 2. PTT 244292: Query latest valid position and backfill coordinate fields
 * 
 * Usage: node scripts/fix_ptt_data.cjs
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.resolve(__dirname, '../serviceAccountKey.json');
let serviceAccount;
try {
    serviceAccount = require(serviceAccountPath);
} catch {
    console.error('❌ serviceAccountKey.json not found. Place it in the project root.');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixPTT36130() {
    console.log('\n🔧 Fixing PTT 36130 (phantom Static test)...');
    const docRef = db.collection('transmitters').document('trans-36130');
    const doc = await docRef.get();
    
    if (!doc.exists) {
        // Try without prefix
        const altRef = db.collection('transmitters').doc('36130');
        const altDoc = await altRef.get();
        if (altDoc.exists) {
            await altRef.update({
                'derived_status': 'Inactive',
                'manual_status_override': 'Inactive'
            });
            console.log('✅ PTT 36130 set to Inactive (doc: 36130)');
            return;
        }
        
        // Search by platform_id
        const snap = await db.collection('transmitters')
            .where('platform_id', '==', '36130')
            .limit(1)
            .get();
        
        if (!snap.empty) {
            await snap.docs[0].ref.update({
                'derived_status': 'Inactive',
                'manual_status_override': 'Inactive'
            });
            console.log(`✅ PTT 36130 set to Inactive (doc: ${snap.docs[0].id})`);
        } else {
            console.log('⚠️  PTT 36130 not found in transmitters collection');
        }
        return;
    }
    
    await docRef.update({
        'derived_status': 'Inactive',
        'manual_status_override': 'Inactive'
    });
    console.log('✅ PTT 36130 set to Inactive (doc: trans-36130)');
}

async function fixPTT244292() {
    console.log('\n🔧 Fixing PTT 244292 (missing coordinates)...');
    
    // Find the transmitter document
    let txDocRef = null;
    let txDoc = await db.collection('transmitters').doc('trans-244292').get();
    if (txDoc.exists) {
        txDocRef = txDoc.ref;
    } else {
        txDoc = await db.collection('transmitters').doc('244292').get();
        if (txDoc.exists) {
            txDocRef = txDoc.ref;
        } else {
            const snap = await db.collection('transmitters')
                .where('platform_id', '==', '244292')
                .limit(1)
                .get();
            if (!snap.empty) {
                txDocRef = snap.docs[0].ref;
                txDoc = snap.docs[0];
            }
        }
    }
    
    if (!txDocRef) {
        console.log('⚠️  PTT 244292 not found in transmitters collection');
        return;
    }
    
    console.log(`   Found transmitter doc: ${txDocRef.id}`);
    const txData = txDoc.data();
    console.log(`   Current coordinates: lat=${txData.latitude || 'MISSING'}, lon=${txData.longitude || 'MISSING'}`);
    console.log(`   Current last_latitude: ${txData.last_latitude || 'MISSING'}, last_longitude: ${txData.last_longitude || 'MISSING'}`);
    
    // Query latest valid position from positions collection
    let latestPos = null;
    
    for (const collection of ['positions', 'argos_positions']) {
        const snap = await db.collection(collection)
            .where('transmitter_id', '==', '244292')
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();
        
        for (const doc of snap.docs) {
            const data = doc.data();
            const lat = data.lat || data.latitude || 0;
            const lon = data.lon || data.longitude || 0;
            
            // Validate coordinates (reject 0,0 and invalid ranges)
            if (lat !== 0 && lon !== 0 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (Math.abs(lat) > 1 || Math.abs(lon) > 1)) {
                if (!latestPos || data.timestamp > latestPos.timestamp) {
                    latestPos = { lat, lon, timestamp: data.timestamp, collection };
                }
                break; // Found a valid one in this collection
            }
        }
        
        // Also try with platformId field
        const snap2 = await db.collection(collection)
            .where('platformId', '==', '244292')
            .orderBy('timestamp', 'desc')
            .limit(10)
            .get();
        
        for (const doc of snap2.docs) {
            const data = doc.data();
            const lat = data.lat || data.latitude || 0;
            const lon = data.lon || data.longitude || 0;
            
            if (lat !== 0 && lon !== 0 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (Math.abs(lat) > 1 || Math.abs(lon) > 1)) {
                if (!latestPos || data.timestamp > latestPos.timestamp) {
                    latestPos = { lat, lon, timestamp: data.timestamp, collection };
                }
                break;
            }
        }
    }
    
    if (latestPos) {
        console.log(`   Latest valid position: lat=${latestPos.lat}, lon=${latestPos.lon} (from ${latestPos.collection})`);
        
        await txDocRef.update({
            'latitude': latestPos.lat,
            'longitude': latestPos.lon,
            'last_latitude': latestPos.lat,
            'last_longitude': latestPos.lon,
            'lat': latestPos.lat,
            'lon': latestPos.lon
        });
        
        console.log('✅ PTT 244292 coordinates backfilled successfully');
    } else {
        console.log('⚠️  No valid positions found for PTT 244292 in any collection');
        console.log('   You may need to manually set coordinates from Argos web or CSV data.');
    }
}

async function main() {
    console.log('=== HBTrack PTT Data Fix Script ===');
    console.log(`Running at: ${new Date().toISOString()}`);
    
    try {
        await fixPTT36130();
        await fixPTT244292();
        console.log('\n✅ All fixes complete!');
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
    }
    
    process.exit(0);
}

main();
