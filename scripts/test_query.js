import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "trackapp-v2",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const q = query(
    collection(db, 'argos_positions'),
    where('platformId', '==', '36109')
  );
  const snapshot = await getDocs(q);
  console.log('Query for 36109 returned', snapshot.docs.length, 'documents');
}
run();
