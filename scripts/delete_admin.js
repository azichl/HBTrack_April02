import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

admin.initializeApp({
  projectId: "trackapp-v2"
});

const db = getFirestore();

async function deleteBadCoords() {
  const ptt = "244289";
  const collections = ["positions", "argos_positions"];
  
  for (const coll of collections) {
    console.log(`Checking ${coll}...`);
    let deletedCount = 0;
    
    // We query by transmitter_id or platformId
    const q1 = db.collection(coll).where("transmitter_id", "==", ptt);
    const snapshot1 = await q1.get();
    
    const q2 = db.collection(coll).where("platformId", "==", ptt);
    const snapshot2 = await q2.get();
    
    const docs = [...snapshot1.docs, ...snapshot2.docs];
    console.log(`Found ${docs.length} docs for ${ptt} in ${coll}`);
    
    for (const docSnap of docs) {
      const data = docSnap.data();
      const lat = Number(data.lat);
      const lon = Number(data.lon);
      
      const isBadOceanCoord = Math.abs(lat - 2.813) < 0.1 && Math.abs(lon - 58.111) < 0.1;
      const isZero = lat === 0 && lon === 0;
      
      if (isBadOceanCoord || isZero) {
        console.log(`Deleting ${docSnap.id} with lat=${lat}, lon=${lon}`);
        await docSnap.ref.delete();
        deletedCount++;
      }
    }
    console.log(`Deleted ${deletedCount} bad coordinates from ${coll}.`);
  }
}

deleteBadCoords().catch(console.error);
