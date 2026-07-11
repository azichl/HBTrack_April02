const admin = require('firebase-admin');

// Initialize with application default credentials, which should have full access.
// Ensure the project ID is correct. The firebase config in the root says "trackapp-v2".
admin.initializeApp({
  projectId: 'trackapp-v2'
});

const db = admin.firestore();

async function cleanup() {
  console.log('Fetching bad positions (lat=0)...');
  const snapshot = await db.collection('positions').where('lat', '==', 0).get();
  
  if (snapshot.empty) {
    console.log('No matching documents.');
    return;
  }

  console.log(`Found ${snapshot.size} bad coordinates. Deleting...`);
  
  const batchArray = [];
  batchArray.push(db.batch());
  let operationCounter = 0;
  let batchIndex = 0;

  snapshot.forEach(doc => {
    batchArray[batchIndex].delete(doc.ref);
    operationCounter++;

    if (operationCounter === 490) {
      batchArray.push(db.batch());
      batchIndex++;
      operationCounter = 0;
    }
  });

  for (let i = 0; i < batchArray.length; i++) {
    await batchArray[i].commit();
    console.log(`Committed batch ${i + 1}`);
  }

  console.log('Cleanup complete!');
}

cleanup().catch(console.error).then(() => process.exit(0));
