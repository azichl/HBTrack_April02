import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD9MzJr1x2DZdBy8vu5-TvB-uX2UwbheUg",
  authDomain: "trackapp-v2.firebaseapp.com",
  projectId: "trackapp-v2",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const q = query(collection(db, "positions"), where("transmitter_id", "==", "284104"));
  const snapshot = await getDocs(q);
  const docs = snapshot.docs.map(d => d.data());
  const nonZero = docs.filter(d => d.lat !== 0 && d.lon !== 0);
  console.log("Non zero for 284104 in positions:", JSON.stringify(nonZero, null, 2));

  const q2 = query(collection(db, "argos_positions"), where("platformId", "==", "284104"));
  const snapshot2 = await getDocs(q2);
  const docs2 = snapshot2.docs.map(d => d.data());
  const nonZero2 = docs2.filter(d => d.lat !== 0 && d.lon !== 0);
  console.log("Non zero for 284104 in argos_positions:", JSON.stringify(nonZero2, null, 2));

  process.exit(0);
}
check().catch(console.error);
