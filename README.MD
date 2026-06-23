# Feature Flag System — ThinkTac Take-Home

**Mohammed Shafi Ur Rehman · Engineer (Platform)**

---

## Part 1 — Running the Code

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Firebase CLI | `npm install -g firebase-tools` |
| Java | 11+ (required by the Firebase emulator) |

### 1. Install dependencies

```bash
cd feature-flags
npm install
```

### 2. Start the Firestore emulator

```bash
firebase emulators:start --only firestore
```

The emulator UI will be available at `http://localhost:4000`.  
Firestore listens on `localhost:8080`.

### 3. Run the demo script

In a second terminal:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx ts-node scripts/demo.ts
```

You should see output like:

```
=== Feature Flag Demo ===
Emulator host: 127.0.0.1:8080

[setFlag dark_mode ON @ 100%] ✓ undefined
[getFlag dark_mode (expect: true)] ✓ true
[setFlag beta_search OFF] ✓ undefined
[getFlag beta_search (expect: false)] ✓ false
[setFlag new_checkout ON @ 30%] ✓ undefined

[getFlag new_checkout × 10] sampling results:
  F  T  F  F  T  F  T  F  F  F
  → 3/10 requests saw the flag as enabled (expect ~3/10)

[getFlag nonexistent_flag (expect: throw)] ✗ Feature flag "nonexistent_flag" does not exist in Firestore.
[setFlag shadow_feature ON @ 0%] ✓ undefined
[getFlag shadow_feature (expect: false, no one in rollout)] ✓ false

--- Cleaning up ---
[deleteFlag dark_mode] ✓ undefined
...
=== Demo complete ===
```

### Project structure

```
feature-flags/
├── src/
│   ├── firebase.ts        # Admin SDK init (emulator-aware)
│   └── featureFlags.ts    # getFlag / setFlag / deleteFlag
├── scripts/
│   └── demo.ts            # End-to-end demo script
├── firebase.json          # Emulator ports
├── firestore.rules        # Firestore security rules
├── tsconfig.json
└── package.json
```

---

## Part 2 — Written Explanation

### 1. Data model

Each flag is a single Firestore document inside a `feature_flags` collection, with the flag key as the **document ID**.

```
feature_flags/
  dark_mode        { key, enabled, rollout_percentage, updated_at }
  new_checkout     { key, enabled, rollout_percentage, updated_at }
```

**Why this structure:**

- Using the key as the document ID means every `getFlag` is a **point-lookup** (`doc(key).get()`), not a query. Point-lookups in Firestore are O(1) and do not consume extra index reads.
- The schema is intentionally flat. There are no nested maps or arrays because the flag evaluation logic only ever needs the whole document at once — partial reads add no value here.
- `updated_at` is included even though the spec does not require it. It costs nothing and makes operational debugging (and the optional AI extension) significantly easier.

**What breaks at 10x scale:**

- **Hot documents.** If one flag (e.g. a global kill-switch) is read on every request, that single document can become a Firestore hotspot. Mitigation: add an in-process or Redis cache with a short TTL (see "What I skipped").
- **Collection size is not the problem.** Firestore scales to millions of documents without degradation, so 10x more flags is fine. The issue is read frequency per flag, not flag count.
- **No per-user or per-segment targeting.** The current model samples purely at random. At scale, you almost always need stable per-user assignment (same user always sees the same variant), which requires either hashing a user ID into the sampling decision or storing per-user flag state.

### 2. Rollout logic

`getFlag` draws `Math.random() * 100` and returns `true` if the result is less than `rollout_percentage`.

- At 0% → never true (the check `<= 0` short-circuits before the random draw).
- At 100% → always true (short-circuits before the draw).
- At N% → true with probability N/100 across a large number of requests.

**Statistical limitations:**

- **Not user-stable.** The same user hitting the same endpoint twice may get `true` then `false`. For UI features this causes flickering. The fix is to hash a stable user ID (e.g. `SHA256(userId + flagKey) % 100 < rollout_percentage`) so the decision is deterministic per user.
- **Small-sample variance.** At 30%, 10 samples might give 1/10 or 6/10 — both are within normal variance. The law of large numbers only smooths things out at hundreds of requests or more.
- **No bucketing.** A proper system would divide users into consistent buckets so that going from 10% → 20% rollout adds users rather than randomly reshuffling who is in and out.

### 3. What I skipped

**Caching**

Every `getFlag` call makes a Firestore network round-trip. In a high-traffic service, this is the first thing to add.

- *Benefit:* reduces latency from ~10–50 ms (Firestore) to ~0.1 ms (in-process map), and cuts Firestore read costs.
- *Cost:* flags are stale for the cache TTL (e.g. 30 seconds). Operators lose the ability to instantly kill a flag — they have to wait for cache expiry. A pub/sub invalidation channel (Firestore `onSnapshot`) can close this gap but adds complexity.

**Audit logs**

Every `setFlag` call should write an immutable audit record: who changed what, from what value, to what value, and when.

- *Benefit:* essential for incident response ("when was this flag turned on?"), compliance, and debugging unexpected behaviour in production.
- *Cost:* a small extra Firestore write on every mutation. Structurally, this means a second collection (`feature_flag_audit`) or appending to a subcollection on the flag document.

### 4. One thing I would change with two more hours

I would make `getFlag` accept an optional **stable user ID** and replace the `Math.random()` sampling with a deterministic hash:

```ts
function isInRollout(key: string, rollout: number, userId?: string): boolean {
  if (!userId) return Math.random() * 100 < rollout; // fallback: anonymous
  const hash = parseInt(sha256(`${userId}:${key}`).slice(0, 8), 16);
  return (hash % 100) < rollout;
}
```

This is the most important improvement because **user-stable assignment is a prerequisite for using feature flags in any real UI or A/B test**. Without it, a user can see a feature appear and disappear between page loads, which is a worse experience than simply not having the feature at all.

---

## Part 3 — Critique of thinktac.com

### UX Observation 1

The hero section introduces several concepts in a short space, including platform engineering, AI, and software development services.

As a first-time visitor, I was not immediately sure which service was the primary offering or which audience the company was targeting. The page communicates capability, but it takes additional reading before understanding exactly what business problem ThinkTac solves.

This matters because many visitors decide within a few seconds whether a website is relevant to them.

---

### UX Observation 2

Several sections contain relatively large blocks of text with similar visual weight.

The information is useful, but it requires more effort to scan than necessary. When browsing a services website, users often look for quick answers to questions such as:

- What does this company do?
- Who is it for?
- What outcomes can I expect?

Using shorter summaries, clearer headings, and more emphasis on customer outcomes would make these answers easier to find.

---

### UX Observation 3

Some calls-to-action could be more action-oriented and specific.

For example, visitors may respond more strongly to actions such as:

- Request a Platform Assessment
- Book a Consultation
- View Case Studies

These provide a clearer expectation of what happens after the click and help users move through the site with more confidence.

---

### Technical Observation

The site delivers a modern and responsive experience, which suggests significant client-side JavaScript usage.

From a platform engineering perspective, I would investigate:

- Largest Contentful Paint (LCP)
- JavaScript bundle size
- Image loading strategy
- Lighthouse performance metrics

Even small improvements in loading performance can improve user experience and search visibility, particularly for first-time visitors on slower networks.

---

### Suggested Improvement

If I were improving the homepage, I would start with the hero section.

I would make the value proposition more explicit by answering three questions immediately:

- Who is the target customer?
- What problem does ThinkTac solve?
- What outcome can customers expect?

This would help visitors determine relevance more quickly and reduce the likelihood of them leaving before exploring the rest of the site.

---

## Part 4 — Reflection

Modelling the flag system felt natural — I've worked with TypeScript and document databases enough that the data-model and API surface decisions came quickly. The part that felt most uncertain was the rollout sampling: I knew the `Math.random()` approach was correct for the spec but I was also immediately aware of its user-stability limitation, and I had to make a deliberate choice to implement the simpler version and document the gap rather than over-engineer it. If I were joining ThinkTac as a platform engineer tomorrow, the thing I would want to develop quickly is **deeper familiarity with Firestore's operational characteristics at scale** — specifically, hotspot behaviour, read quotas, and the trade-offs between `onSnapshot` listeners and polling — because those constraints shape architecture decisions that are difficult to reverse later.

---

## Optional Extension — AI Integration

*(See `src/aiParser.ts` if attempted — marked clearly in that file)*

Not attempted in this submission. If I were to add it, I would build a function that accepts a plain-English instruction like `"turn on dark mode for 10% of users"` and calls an LLM to extract `{ key, enabled, rolloutPercentage }` before passing the result to `setFlag`. The problem it solves is lowering the barrier for non-engineers (PMs, support) to manage flags without touching a UI or knowing the exact key names. The case where it would be a bad idea: any flag change with a safety or revenue impact — an LLM mis-parsing `"disable payments for 5% of users"` as `{ enabled: true, rolloutPercentage: 95 }` would be a production incident. AI-assisted flag management should always require a human confirmation step before writing to Firestore.
