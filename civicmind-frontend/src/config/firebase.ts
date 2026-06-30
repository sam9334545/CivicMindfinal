import { initializeApp, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const firebaseAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const firebaseStorageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
const firebaseMessagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
const firebaseAppId = import.meta.env.VITE_FIREBASE_APP_ID;

if (!firebaseApiKey || !firebaseAuthDomain || !firebaseProjectId || !firebaseAppId) {
  throw new Error(
    "[firebase] Missing required production Firebase environment variables. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID."
  );
}

function normalizeStorageBucket(projectId: string, bucket?: string): string {
  if (!bucket) {
    return `${projectId}.appspot.com`;
  }

  let normalizedBucket = bucket.trim();

  if (normalizedBucket.startsWith("gs://")) {
    normalizedBucket = normalizedBucket.replace(/^gs:\/\//, "");
  }

  // Handle common mistakes where the hosting/storage web domain is used instead of the bucket name.
  if (normalizedBucket.endsWith(".firebasestorage.app")) {
    normalizedBucket = normalizedBucket.replace(/\.firebasestorage\.app$/, ".appspot.com");
  }

  if (normalizedBucket.startsWith("http://") || normalizedBucket.startsWith("https://")) {
    try {
      const url = new URL(normalizedBucket);
      normalizedBucket = url.hostname;
    } catch (_err) {
      // fall back to project bucket below
    }
  }

  if (!normalizedBucket.includes(".")) {
    return `${projectId}.appspot.com`;
  }

  return normalizedBucket;
}

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: firebaseAuthDomain,
  projectId: firebaseProjectId,
  storageBucket: normalizeStorageBucket(firebaseProjectId, firebaseStorageBucket),
  messagingSenderId: firebaseMessagingSenderId,
  appId: firebaseAppId,
};

let app: FirebaseApp;
try {
  app = getApp();
} catch (e) {
  app = initializeApp(firebaseConfig);
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();

export default app;
