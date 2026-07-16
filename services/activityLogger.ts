import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export type ActivityEventType = 
  | 'SESSION_START' 
  | 'SESSION_END' 
  | 'AUTO_LOGOUT_IDLE' 
  | 'HEARTBEAT'
  | 'CUSTOM_ACTION';

export const logUserActivity = async (
  userId: string, 
  userEmail: string, 
  eventType: ActivityEventType, 
  details?: string
) => {
  try {
    const logsRef = collection(db, 'user_activity_logs');
    await addDoc(logsRef, {
      userId,
      userEmail,
      eventType,
      details: details || '',
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent
    });
  } catch (error) {
    console.error('Failed to log user activity:', error);
  }
};
