import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD9MzJr1x2DZdBy8vu5-TvB-uX2UwbheUg",
  authDomain: "trackapp-v2.firebaseapp.com",
  projectId: "trackapp-v2",
  storageBucket: "trackapp-v2.firebasestorage.app",
  messagingSenderId: "509636113713",
  appId: "1:509636113713:web:cb091dce8208f17b0b2c10",
  measurementId: "G-XXXXXXXXXX" // Usually you'd get this from Firebase Console for Analytics
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

import { getFunctions } from "firebase/functions";

// Export instances to use in the app with IndexedDB persistent caching to minimize billable Firestore reads
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const functions = getFunctions(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
