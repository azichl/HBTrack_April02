import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { logEvent } from 'firebase/analytics';
import { db, analytics } from '../firebase';

export type ActivityEventType = 
  | 'SESSION_START' 
  | 'SESSION_END' 
  | 'AUTO_LOGOUT_IDLE' 
  | 'HEARTBEAT'
  | 'CUSTOM_ACTION'
  | 'PAGE_VIEW'
  | 'TIME_SPENT_ON_PAGE'
  | 'USER_CLICK'
  | 'DATA_CREATE'
  | 'DATA_UPDATE'
  | 'DATA_DELETE';

export const logUserActivity = async (
  userId: string, 
  userEmail: string, 
  eventType: ActivityEventType, 
  details?: string
) => {
  try {
    // 1. Log to Firestore Database
    const logsRef = collection(db, 'user_activity_logs');
    await addDoc(logsRef, {
      userId,
      userEmail,
      eventType,
      details: details || '',
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent
    });

    // 2. Log to Google Analytics (Analytics Dashboard)
    if (analytics) {
      logEvent(analytics, eventType, {
        user_id: userId,
        user_email: userEmail,
        details: details || ''
      });
    }
  } catch (error) {
    console.error('Failed to log user activity:', error);
  }
};

/**
 * Clears all user activity logs in Firebase Firestore ('user_activity_logs' collection)
 */
export const clearAllUserActivityLogs = async (onProgress?: (deleted: number) => void): Promise<number> => {
  const { deleteCollection } = await import('./firestoreService');
  return await deleteCollection('user_activity_logs', onProgress);
};
