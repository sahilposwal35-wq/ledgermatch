# LedgerMatch — Automated Transaction Reconciliation Engine

## The problem
Every bank, payment processor, or fintech company keeps at least two records of
the same transactions — e.g. an internal order ledger and a bank/payment-gateway
settlement statement. These almost never match perfectly: timing differences,
rounding, batched settlements, duplicate entries, and missing records are routine.
Reconciling them — automatically, auditably, and safely — is a real job category
inside banks (ops tech, payments, settlements) and one of the least "flashy" but
most operationally critical problems in fintech.

LedgerMatch automates this: it ingests two transaction ledgers, matches them
using a tiered algorithm (exact → fuzzy → split → mismatch), flags exceptions
for human review, and keeps an immutable audit trail of every decision — mirroring
real banking controls like maker-checker approval.

## Getting data in — two ways

You don't need real bank access to use this. Two supported paths, both feeding
the same reconciliation engine and schema:

**1. Seeded demo data (fastest — use this if you have nothing else)**
```bash
cd server && npm run seed
```
Generates `DEMO-BATCH-001` with ~200 transactions and controlled anomalies
(exact/fuzzy/split/mismatch/missing), so the demo always looks realistic.

**2. Upload your own CSVs**
Click "Upload your own CSVs" in the dashboard (collapsed by default), pick a
batch ID, and upload two files:

- Ledger A (internal) columns: `txnId, amount, date, refId, description`
- Ledger B (external/bank) columns: `statementId, amount, date, refId, narration`

`sample-data/ledgerA-sample.csv` and `sample-data/ledgerB-sample.csv` are
included as a working example — try those first to see the expected format.
Real sources for this in production: your own bank's statement export (often
MT940 or CSV), or a payment gateway's settlement report (Razorpay/Stripe/PayU
all provide these as downloadable CSVs). You can also export your own real
bank statement CSV (redact the account number) and try that — the schema is
deliberately generic enough to accept it with minor column renaming.

Both paths write into the same `LedgerA`/`LedgerB` collections under whatever
`batchId` you choose — reconciliation doesn't care which path the data came
from.

## Status: MVP complete

- [x] Day 1-2: Schemas (LedgerA, LedgerB, Match, AuditLog) + seed script with controlled anomalies
- [x] Day 3-6: Matching engine — exact / fuzzy / split / amount-mismatch / unmatched tiers
- [x] Day 7-9: Maker-checker override endpoint + idempotent re-run (verified with an in-memory logic test — all 6 tiers + idempotency confirmed passing)
- [x] Day 10-13: React dashboard — exception queue, match-detail drawer, breakdown chart, live audit trail
- [x] Bonus: CSV upload endpoint (multer + csv-parse) as an alternative to seeded data — validates headers/amounts/dates before writing
- [ ] Day 14: Deploy (Vercel + Render/Railway + Atlas) — do this last, once you've run it locally end-to-end yourself

## How to demo it

1. Follow "Running locally" below, then `npm run seed` to generate `DEMO-BATCH-001`
2. Open the client, click **Run reconciliation**
3. Point out the reconciliation-rate hero number and the match breakdown chart
4. Filter to "Pending review", click into a fuzzy/split/mismatch row, walk through the drawer
5. Try to approve a match **without** typing a reason — show that it's blocked (this is the interview talking point: the UI enforces the same control the backend enforces)
6. Approve one with a reason, then show it land in the audit trail on the right, live
7. Click **Run reconciliation** again — same batch, same count, no duplicates — this is your idempotency demo

## Architecture

```
client (React)  --->  server (Express /api)  --->  matchingEngine.js  --->  MongoDB
                                                          |
                                                    AuditLog (append-only)
```

- **Tiered matching**: exact match first, then fuzzy (date/amount tolerance),
  then split (batched settlements), then amount-mismatch (fee deductions/rounding),
  with anything left over flagged unmatched.
- **Idempotency**: re-running reconciliation on a batch clears and rebuilds its
  matches rather than duplicating them — safe to re-run after a fix.
- **Audit trail**: every automatic match and manual override writes an
  append-only `AuditLog` entry. Application code never updates or deletes these.
- **Maker-checker**: manual overrides require a `reason` and an `resolvedBy`
  actor — mirrors real banking approval controls.

## Running locally

You need a MongoDB instance — either install it locally, or use a free
[MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster and drop its
connection string into `server/.env` as `MONGO_URI`.

**Terminal 1 — API server:**
```bash
cd server
cp .env.example .env   # set MONGO_URI if not using local default
npm install
npm run seed            # generates a demo batch: DEMO-BATCH-001
npm run dev              # http://localhost:5000
```

**Terminal 2 — React client:**
```bash
cd client
npm install
npm run dev              # http://localhost:5173, proxies /api to :5000
```

Open `http://localhost:5173`, batch `DEMO-BATCH-001` is prefilled — click
**Run reconciliation**.

You can also hit the API directly:
```
POST /api/reconcile/DEMO-BATCH-001
GET  /api/matches/DEMO-BATCH-001?status=pending_review
GET  /api/audit/DEMO-BATCH-001
```

## Deploying (Day 14 — do this last)

1. **Database**: create a free MongoDB Atlas cluster, whitelist `0.0.0.0/0`
   for now (tighten later), copy the connection string
2. **Server**: push to GitHub, deploy on Render or Railway as a Node web
   service, set `MONGO_URI` and `PORT` env vars, run `npm run seed` once via
   their shell/console to populate the demo batch
3. **Client**: in `client/vite.config.js` remove the local proxy and instead
   set the deployed API URL via an env var (`VITE_API_BASE`), update
   `src/services/api.js` to use `import.meta.env.VITE_API_BASE` as the base
   instead of the relative `/api` path, then deploy `client/` on Vercel
4. Add the live link + a screenshot or short screen recording to this README
   before putting it on your resume — recruiters click through more often
   than you'd expect

## What I intentionally scoped out (and why)
- **Real bank API integration** — synthetic seeded data is standard for a resume
  project; the algorithm and controls are the point, not the data source.
- **ML-based fuzzy matching** — rule-based scoring keeps the 2-week timeline
  realistic; noted as future work rather than faked.
- **Multi-currency** — single currency for MVP, called out as a known limitation.

## Tech stack
MongoDB, Express, React, Node — MERN, deployed on Vercel (client) + Render (server) + Atlas (DB).
