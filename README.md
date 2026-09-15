# LedgerMatch

A bank/ledger reconciliation engine that automatically matches internal financial records (Ledger A) against external bank statements (Ledger B), flagging discrepancies for human review through an enforced maker-checker workflow.

Built as a portfolio project targeting fintech engineering roles.

<!-- 
  ┌─────────────────────────────────────────────┐
  │  SCREENSHOT / GIF PLACEHOLDER               │
  │                                              │
  │  Replace this block with a screenshot or     │
  │  GIF of the dashboard showing the exception  │
  │  queue and match drawer. Use this syntax:    │
  │                                              │
  │  ![Dashboard](./screenshots/dashboard.png)   │
  │                                              │
  │  Record a ~15s GIF showing:                  │
  │  1. Login as maker → upload CSVs             │
  │  2. Run reconciliation → see results         │
  │  3. Login as checker → approve a match       │
  └─────────────────────────────────────────────┘
-->

---

## What It Does

Finance teams reconcile internal records against bank statements to find missing payments, hidden fees, and delayed settlements. This process is typically done manually with Excel VLOOKUP. LedgerMatch automates it:

1. Upload two CSV files (internal ledger + bank statement)
2. Map CSV columns to the system's expected fields via a visual UI
3. Run the reconciliation engine — it categorizes every record into one of 6 match tiers
4. Review the "exception queue" of non-exact matches — approve or reject each one through a maker-checker workflow
5. Every action is logged in an append-only audit trail

---

## The Matching Algorithm

Records are processed through a **cascading rules engine** — each tier only sees records not already consumed by a higher tier. Thresholds are configurable per batch.

| Tier | Name | Rule | Confidence |
|------|------|------|------------|
| 1 | **Exact Match** | Same reference ID + same amount (±₹0.01) + same date | 100% — auto-matched |
| 2 | **Fuzzy Match** | Same amount (exact) + date within ±N days. Reference ID is **not** checked — catches payments settled under a different bank reference | 90% (same day) / 75% (date differs) |
| 3 | **Split Match** | Two internal records sum to exactly one bank deposit, within date tolerance. Only checks pairs, not triplets | 70% |
| 4 | **Amount Mismatch** | Same reference ID + date within tolerance, but amounts differ (flags hidden bank fees) | 40% |
| 5 | **Missing on B** | Internal record exists but no matching bank deposit found | 0% |
| 6 | **Missing on A** | Bank deposit exists but no matching internal record found | 0% |

**Default thresholds:** `dateToleranceDays = 2`, `amountTolerance = 0.01` (adjustable in the Settings panel per batch).

**Tie-breaking:** When multiple candidates qualify, the first in insertion order wins. This is deterministic but does not optimize for "closest date" or "smallest delta." See the [inline documentation in matchingEngine.js](server/services/matchingEngine.js) for the full rationale.

**Lookup strategy:** Two hash maps (`bByRef` and `bByAmount`) index B records for O(1) candidate lookup per A record. Tier 3 is O(A²) for pair enumeration but O(1) for the B lookup.

---

## Authentication & Maker-Checker Workflow

### Roles

Every user has exactly one role: **maker** or **checker**.

| Action | Allowed |
|--------|---------|
| Create batch / upload CSVs / run reconciliation | Maker (own batches only) |
| View batches, matches, audit trail | Any authenticated user |
| Approve or reject matches | Checker only, **and** they cannot have created the batch |

### Self-Approval Prevention

The core control of the maker-checker pattern: a checker **cannot approve matches on a batch they created**, even if their role was changed from maker to checker after the fact. This is enforced at the database level by comparing `batch.createdBy` against the JWT's user ID — it does not rely on the role claim in the token.

### Authentication

- JWT-based (7-day expiry), passwords hashed with bcrypt (salt rounds: 10)
- `resolvedBy` on match resolutions is set from the JWT, never from client input — the audit trail is cryptographically tied to the authenticated user

### Intentional Simplifications

- **No role-change endpoint** — changing a user's role requires direct DB access. This is an intentionally out-of-scope admin operation, not an oversight.
- **JWT role staleness** — if a role is changed in the DB, the user's existing JWT keeps the old role for up to 7 days. The self-approval check is DB-based so it can't be bypassed this way, but role-gated actions (`requireRole` middleware) could reflect a stale role until the token expires. Production would use short-lived access tokens + refresh tokens.
- **Batch visibility is global** — all authenticated users see all batches. Deliberate simplification for a portfolio demo; a production version would scope visibility by team or organization.
- **Registration is open** — anyone can register. This is appropriate for a demo but not for a real deployment.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, Recharts, plain CSS |
| Backend | Node.js, Express 4, REST API |
| Database | MongoDB (Mongoose 8 ODM) |
| Auth | jsonwebtoken, bcryptjs |
| File Processing | Multer (disk storage, 50 MB limit), csv-parse (stream parsing) |

### Database Transaction Safety

The reconciliation and match-resolution write paths are wrapped in MongoDB transactions (`startSession()` + `withTransaction()`) so partial writes can't leave the database in an inconsistent state. Specifically:

- **Reconciliation:** `deleteMany` (old matches) → `insertMany` (new matches) → `insertMany` (audit logs) → `batch.save()` — all atomic
- **Match resolution:** `match.save()` → `AuditLog.create()` — both atomic

> MongoDB transactions require a **replica set**. MongoDB Atlas runs as a replica set by default. For local dev with standalone `mongod`, start with `--replSet rs0` and run `rs.initiate()`.

---

## Running Locally

### Prerequisites

- Node.js 20.x
- MongoDB (Atlas free tier, or local with replica set for transaction support)

### Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/ledgermatch.git
   cd ledgermatch
   ```

2. **Configure environment variables:**
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env with your MongoDB connection string and a strong JWT secret
   ```

3. **Install dependencies and start the backend:**
   ```bash
   cd server
   npm install
   npm run dev
   ```

4. **In a separate terminal, start the frontend:**
   ```bash
   cd client
   npm install
   npm run dev
   ```

5. **Open** `http://localhost:5173`

### Demo Accounts

Run `npm run seed` from the `server/` directory to create demo data and two test accounts:

| Role | Email | Password |
|------|-------|----------|
| Maker | `maker@demo.com` | `password123` |
| Checker | `checker@demo.com` | `password123` |

The seed script also creates a demo batch (`DEMO-BATCH-001`) with 200 transactions distributed across all match tiers.

### Sample CSV Files

Two test files are included in [`sample-data/`](sample-data/):
- `ledgerA-test.csv` — 8 internal transactions with inline comments describing the expected match type
- `ledgerB-test.csv` — 7 bank statement entries

---

## Project Structure

```
server/
├── index.js                    # Express entry point
├── models/
│   ├── User.js                 # email, password, role (maker/checker)
│   ├── Batch.js                # reconciliation batch with rules + summary
│   ├── LedgerA.js              # internal ledger records
│   ├── LedgerB.js              # external bank statement records
│   ├── Match.js                # match results with confidence + resolution
│   └── AuditLog.js             # append-only audit trail (actorType + actorId)
├── middleware/
│   ├── auth.js                 # JWT verification → sets req.user
│   └── roles.js                # requireRole('maker'|'checker') middleware
├── routes/
│   ├── auth.js                 # register, login, /me
│   ├── batches.js              # CRUD for reconciliation batches
│   ├── upload.js               # CSV upload with stream parsing + validation
│   └── reconciliation.js       # run engine, view matches, resolve, audit trail
├── services/
│   └── matchingEngine.js       # 4-tier cascading matching algorithm
└── scripts/
    ├── seed.js                 # demo data + test accounts
    └── test-self-approval.js   # integration test for self-approval prevention

client/src/
├── App.jsx                     # root component, role-aware conditional UI
├── components/
│   ├── AuthScreen.jsx          # login/register with role selector
│   ├── UploadPanel.jsx         # CSV upload with visual column mapping
│   ├── MatchDrawer.jsx         # match detail + maker-checker review panel
│   ├── LedgerTable.jsx         # exception queue table
│   ├── StatBar.jsx             # reconciliation summary stats
│   ├── BreakdownChart.jsx      # match type distribution chart
│   ├── AuditTrail.jsx          # audit log timeline
│   └── SettingsView.jsx        # batch rules configuration
├── services/api.js             # fetch wrappers for all API endpoints
└── utils/format.js             # number/date formatters, label maps
```

---

## Testing

### Automated

```bash
cd server
npm run test:self-approval
```

This integration test covers the hardest maker-checker edge case: creates a batch as a maker, flips the user's role to checker directly in the DB, and verifies that self-approval is still blocked (the check is DB-based, not role-based).

> Requires a running MongoDB instance.

### Manual Verification Checklist

1. Register as **maker** → create batch → upload sample CSVs → run reconciliation
2. Try to approve a match as the maker → should get **403**
3. Register as **checker** (or login as `checker@demo.com`) → see the maker's batch
4. Approve a match as the checker → should succeed
5. Check audit trail → should show the checker's real user ID, not a free-text name
6. Try to run reconciliation as the checker → should get **403**
7. Invalid/expired JWT → should get **401**

---

## Performance

> [!NOTE]
> Fill in these numbers after testing with your actual data:

- Reconciliation time for `[ADD ACTUAL METRIC]` rows: `[ADD ACTUAL METRIC]`ms
- Largest CSV tested: `[ADD ACTUAL METRIC]` rows
- Memory usage at peak: `[ADD ACTUAL METRIC]` MB

The engine loads all records into memory for hash-map construction. CSV ingestion is chunked (1,000 rows per `insertMany`) and match/audit insertion is chunked (2,000 per `insertMany`) to limit per-query memory.

---

## License

[MIT](LICENSE)