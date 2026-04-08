import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD9MzJr1x2DZdBy8vu5-TvB-uX2UwbheUg",
  authDomain: "trackapp-v2.firebaseapp.com",
  projectId: "trackapp-v2",
  storageBucket: "trackapp-v2.firebasestorage.app",
  messagingSenderId: "509636113713",
  appId: "1:509636113713:web:cb091dce8208f17b0b2c10"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export instances to use in the app
export const auth = getAuth(app);
export const db = getFirestore(app);
