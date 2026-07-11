import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

async function check() {
  const q = query(
    collection(db, 'argos_positions'),
    where('platformId', 'in', ['244292', '244289'])
  );
  
  const snap = await getDocs(q);
  console.log(`Found ${snap.size} argos_positions`);
  
  let count = 0;
  snap.forEach(doc => {
    const data = doc.data();
    const lat = Number(data.lat);
    const lon = Number(data.lon);
    
    // Check if close to 0
    if (Math.abs(lat) < 1 || Math.abs(lon) < 1) {
      console.log(`id: ${doc.id}, lat: ${data.lat}, lon: ${data.lon}`);
      count++;
    }
  });
  console.log(`Total close to zero: ${count}`);
  process.exit(0);
}

check().catch(console.error);
