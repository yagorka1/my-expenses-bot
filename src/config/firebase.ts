import { App, applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

// Lazy: modules are imported before dotenv.config() runs in bot.ts.
let app: App | undefined;

export function getFirebaseApp(): App {
  if (!app) {
    // FIREBASE_SERVICE_ACCOUNT holds the service account JSON (handy on Railway);
    // otherwise GOOGLE_APPLICATION_CREDENTIALS points to the key file.
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    app = getApps()[0] ?? initializeApp({
      credential: serviceAccount ? cert(JSON.parse(serviceAccount)) : applicationDefault(),
    });
  }
  return app;
}

export function getDb(): Firestore {
  return getFirestore(getFirebaseApp());
}
