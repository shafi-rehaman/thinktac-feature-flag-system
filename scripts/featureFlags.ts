import * as admin from "firebase-admin";
import { getFirestore } from "./firebase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of a flag document stored in Firestore.
 *
 * Collection: feature_flags
 * Document ID: the flag key itself (e.g. "dark_mode")
 *
 * Using the key as the document ID means reads are O(1) point-lookups
 * (no query needed) and keys are naturally unique without an extra index.
 */
export interface FlagDocument {
  key: string;
  enabled: boolean;
  rollout_percentage: number; // 0–100; defaults to 100 when not supplied
  created_at?: admin.firestore.Timestamp;
  updated_at: admin.firestore.Timestamp;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const FLAGS_COLLECTION = "feature_flags";

function flagRef(key: string) {
  return getFirestore().collection(FLAGS_COLLECTION).doc(key);
}

/**
 * Decide whether this request falls inside the rollout.
 *
 * Strategy: draw a uniformly distributed float in [0, 100) and check
 * whether it is less than rollout_percentage.
 *
 * - At 0 %  → Math.random() is never < 0  → always false
 * - At 100% → Math.random() * 100 is always < 100 → always true
 * - At 50%  → true ~50% of the time across many calls
 *
 * Limitation: this is purely stateless / per-request randomness.
 * The same user can get different results on consecutive requests unless
 * the caller hashes a stable user ID into the sampling decision (see README).
 */
function isInRollout(rollout_percentage: number): boolean {
  if (rollout_percentage <= 0) return false;
  if (rollout_percentage >= 100) return true;
  return Math.random() * 100 < rollout_percentage;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the flag is enabled AND this request is sampled into the
 * active rollout percentage.
 *
 * Throws if the flag document does not exist — a missing flag is not the same
 * as a disabled flag; the caller should handle the error explicitly so that
 * mis-typed keys don't silently evaluate to false and hide bugs.
 */
export async function getFlag(key: string): Promise<boolean> {
  if (!key || typeof key !== "string") {
    throw new TypeError(`getFlag: key must be a non-empty string, got: ${JSON.stringify(key)}`);
  }

  const snap = await flagRef(key).get();

  if (!snap.exists) {
    // Intentional throw: a missing flag should be visible noise, not silent false.
    throw new Error(`Feature flag "${key}" does not exist in Firestore.`);
  }

  const data = snap.data() as FlagDocument;

  if (!data.enabled) {
    return false;
  }

  return isInRollout(data.rollout_percentage);
}

/**
 * Creates or overwrites a flag document.
 *
 * - rolloutPercentage defaults to 100 (fully enabled) when omitted.
 * - Clamps the value to [0, 100] rather than throwing — a caller passing 150
 *   almost certainly intends "fully on", so silently clamping is safer than
 *   crashing at write time only to fail strangely at read time.
 */
export async function setFlag(
  key: string,
  enabled: boolean,
  rolloutPercentage: number = 100
): Promise<void> {
  if (!key || typeof key !== "string") {
    throw new TypeError(`setFlag: key must be a non-empty string, got: ${JSON.stringify(key)}`);
  }

  const clamped = Math.min(100, Math.max(0, Math.round(rolloutPercentage)));

  const doc: FlagDocument = {
    key,
    enabled,
    rollout_percentage: clamped,
    updated_at: admin.firestore.Timestamp.now(),
  };

  // set() with merge:false replaces the whole document atomically.
  // This avoids stale field bleed-through if we later add/remove fields.
  await flagRef(key).set(doc);
}

/**
 * Deletes a flag. Intentionally not in the required spec but useful in practice.
 * Included so the demo script can clean up after itself.
 */
export async function deleteFlag(key: string): Promise<void> {
  await flagRef(key).delete();
}