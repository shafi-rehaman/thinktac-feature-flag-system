/**
 * demo.ts — runs against the Firestore emulator (or a real project).
 *
 * Run with:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx ts-node src/demo.ts
 *
 * Make sure the emulator is already running:
 *   firebase emulators:start --only firestore
 */

import { getFlag, setFlag, deleteFlag } from "../scripts/featureFlags";

// Small utility so we don't have to wrap every call manually
async function run(label: string, fn: () => Promise<unknown>) {
  process.stdout.write(`\n[${label}] `);
  try {
    const result = await fn();
    console.log("✓", result);
  } catch (err: any) {
    console.error("✗", err.message);
  }
}

async function main() {
  console.log("=== Feature Flag Demo ===");
  console.log(
    "Emulator host:",
    process.env.FIRESTORE_EMULATOR_HOST ?? "(not set — using real Firestore)"
  );

  // ------------------------------------------------------------------
  // 1. Fully-enabled flag
  // ------------------------------------------------------------------
  await run("setFlag dark_mode ON @ 100%", () =>
    setFlag("dark_mode", true, 100)
  );

  await run("getFlag dark_mode (expect: true)", () => getFlag("dark_mode"));

  // ------------------------------------------------------------------
  // 2. Disabled flag — rollout % is irrelevant
  // ------------------------------------------------------------------
  await run("setFlag beta_search OFF", () =>
    setFlag("beta_search", false, 50)
  );

  await run("getFlag beta_search (expect: false)", () =>
    getFlag("beta_search")
  );

  // ------------------------------------------------------------------
  // 3. Partial rollout — sample 10 times and print outcomes
  // ------------------------------------------------------------------
  await run("setFlag new_checkout ON @ 30%", () =>
    setFlag("new_checkout", true, 30)
  );

  console.log("\n[getFlag new_checkout × 10] sampling results:");
  let trueCount = 0;
  for (let i = 0; i < 10; i++) {
    const result = await getFlag("new_checkout");
    if (result) trueCount++;
    process.stdout.write(result ? "  T" : "  F");
  }
  console.log(`\n  → ${trueCount}/10 requests saw the flag as enabled (expect ~3/10)`);

  // ------------------------------------------------------------------
  // 4. Missing flag — should throw
  // ------------------------------------------------------------------
  await run("getFlag nonexistent_flag (expect: throw)", () =>
    getFlag("nonexistent_flag")
  );

  // ------------------------------------------------------------------
  // 5. Edge cases — 0% rollout
  // ------------------------------------------------------------------
  await run("setFlag shadow_feature ON @ 0%", () =>
    setFlag("shadow_feature", true, 0)
  );

  await run("getFlag shadow_feature (expect: false, no one in rollout)", () =>
    getFlag("shadow_feature")
  );

  // ------------------------------------------------------------------
  // 6. Cleanup
  // ------------------------------------------------------------------
  console.log("\n--- Cleaning up ---");
  await run("deleteFlag dark_mode", () => deleteFlag("dark_mode"));
  await run("deleteFlag beta_search", () => deleteFlag("beta_search"));
  await run("deleteFlag new_checkout", () => deleteFlag("new_checkout"));
  await run("deleteFlag shadow_feature", () => deleteFlag("shadow_feature"));

  console.log("\n=== Demo complete ===\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});