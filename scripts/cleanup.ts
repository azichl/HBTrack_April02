import { collection, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase'; // Adjust path if necessary

async function cleanup() {
  console.log('Fetching positions...');
  const querySnapshot = await getDocs(collection(db, 'positions'));
  const batch = writeBatch(db);
  let count = 0;

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.lat === 0 || data.lon === 0) {
      batch.delete(docSnap.ref);
      count++;
    }
  });

  if (count > 0) {
    console.log(`Found ${count} bad coordinates. Deleting...`);
    // Firestore batch limit is 500 operations. If > 500, we need chunks.
    // For safety, let's just do them one by one if it's not huge, or we can use chunks.
    const chunks = [];
    const docsToDelete = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.lat === 0 || data.lon === 0) {
        docsToDelete.push(docSnap.ref);
      }
    });

    for (let i = 0; i < docsToDelete.length; i += 400) {
      const chunk = docsToDelete.slice(i, i + 400);
      const b = writeBatch(db);
      chunk.forEach(ref => b.delete(ref));
      await b.commit();
      console.log(`Committed chunk of ${chunk.length}`);
    }
    console.log('Cleanup complete!');
  } else {
    console.log('No bad coordinates found.');
  }
}

cleanup().catch(console.error).then(() => process.exit(0));
