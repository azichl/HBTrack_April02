import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD9MzJr1x2DZdBy8vu5-TvB-uX2UwbheUg",
  authDomain: "trackapp-v2.firebaseapp.com",
  projectId: "trackapp-v2"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const snapshot = await getDocs(query(collection(db, 'argos_positions'), limit(10)));
  snapshot.forEach(doc => {
    console.log(doc.id, doc.data());
  });
  
  const snapshot2 = await getDocs(query(collection(db, 'positions'), limit(10)));
  snapshot2.forEach(doc => {
    console.log(doc.id, doc.data());
  });
  process.exit(0);
}
run();
