import { httpsCallable } from 'firebase/functions';
import { functions, auth } from '../../../firebase';
import { notifyError, notifySuccess } from './toast';

export async function requestCollectionWipe(
  collectionName: string, 
  confirmText: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to perform this action.');
  }

  // Force token refresh to ensure custom claims are latest
  const tokenResult = await user.getIdTokenResult(true);
  const role = (tokenResult.claims.role || tokenResult.claims.userRole || '').toString().toLowerCase();

  // If role is neither manager nor bootstrap admin, block immediately on client
  const isManager = role === 'manager' || user.email === 'achlih21@gmail.com';
  if (!isManager) {
    const err = new Error('Permission denied: Only Manager accounts can wipe database collections.');
    (err as any).code = 'permission-denied';
    notifyError(err);
    throw err;
  }

  try {
    const callable = httpsCallable<{ collection: string; confirmText: string }, { ok: boolean }>(
      functions, 
      'wipeCollection'
    );
    const result = await callable({
      collection: collectionName,
      confirmText,
    });

    if (result.data?.ok) {
      notifySuccess(`Collection "${collectionName}" successfully wiped.`);
    }
  } catch (err: any) {
    notifyError(err, `Failed to wipe collection "${collectionName}"`);
    throw err;
  }
}
