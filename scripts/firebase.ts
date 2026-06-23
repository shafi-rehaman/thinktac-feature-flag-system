import * as admin from "firebase-admin";

/**
 * Initialise Firebase Admin SDK once.
 *
 * When FIRESTORE_EMULATOR_HOST is set (e.g. "127.0.0.1:8080"), the Admin SDK
 * automatically routes all Firestore traffic to the local emulator, so no real
 * credentials are needed — we just pass an empty credential.
 *
 * In production, replace the credential with:
 *   admin.credential.applicationDefault()
 * and ensure GOOGLE_APPLICATION_CREDENTIALS points to a service-account JSON.
 */

let initialised = false;

export function initFirebase(): void {
  if (initialised) return;

  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  admin.initializeApp({
    credential: isEmulator
      ? admin.credential.applicationDefault() // emulator ignores real auth
      : admin.credential.applicationDefault(),
    // projectId is required by the emulator even without real credentials
    projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-feature-flags",
  });

  initialised = true;
}

export function getFirestore(): admin.firestore.Firestore {
  initFirebase();
  return admin.firestore();
}