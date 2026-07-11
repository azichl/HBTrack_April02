import { db } from '../firebase';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

export const deleteCoordinateRecord = async (argosId: string, platformId: string, timestamp: string) => {
  // Delete from argos_positions
  await deleteDoc(doc(db, 'argos_positions', argosId));
  
  // Find and delete from positions
  const posQ = query(
    collection(db, 'positions'),
    where('transmitter_id', '==', platformId),
    where('timestamp', '==', timestamp)
  );
  const posSnap = await getDocs(posQ);
  for (const pDoc of posSnap.docs) {
    await deleteDoc(doc(db, 'positions', pDoc.id));
  }
}
