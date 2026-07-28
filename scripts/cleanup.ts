import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

async function cleanup() {
  console.log('Fetching positions & argos_positions to clean zero coordinates...');
  
  for (const colName of ['positions', 'argos_positions']) {
    console.log(`Checking collection ${colName}...`);
    const querySnapshot = await getDocs(collection(db, colName));
    const docsToDelete: any[] = [];
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const lat = Number(data.lat !== undefined ? data.lat : data.latitude);
      const lon = Number(data.lon !== undefined ? data.lon : data.longitude);
      
      if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0 || (Math.abs(lat) <= 0.0001 && Math.abs(lon) <= 0.0001)) {
        docsToDelete.push(docSnap.ref);
      }
    });

    if (docsToDelete.length > 0) {
      console.log(`Found ${docsToDelete.length} zero/invalid coordinates in ${colName}. Deleting in batches...`);
      for (let i = 0; i < docsToDelete.length; i += 400) {
        const chunk = docsToDelete.slice(i, i + 400);
        const b = writeBatch(db);
        chunk.forEach(ref => b.delete(ref));
        await b.commit();
        console.log(`Deleted batch of ${chunk.length} from ${colName}`);
      }
    } else {
      console.log(`No zero coordinates found in ${colName}.`);
    }
  }

  console.log('Cleanup complete!');
}

cleanup().catch(console.error).then(() => process.exit(0));
