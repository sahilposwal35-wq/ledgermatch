# LedgerCore

**A double-entry core banking engine, built to prove correctness — not just move numbers around.**

LedgerCore is a MERN-stack backend (with a matching operational dashboard) that implements the
same architectural guarantees real banking and payments infrastructure relies on: atomic
transfers, idempotent APIs, optimistic concurrency control, and independent reconciliation with
an immutable audit trail. It's built to demonstrate financial-systems engineering, not to be a
consumer banking app.

> Most student fintech projects model a balance as `user.balance -= x`. This project exists to
> show why that's wrong, and what a correct version looks like in code.

---

## Why this project exists

Every real bank, payment processor, and ledger system (Stripe, Razorpay, the settlement layers
inside institutions like UBS or BNY Mellon) is architected specifically to make four failure
modes *impossible by construction*, not just unlikely:

1. **Lost money** — a server crash mid-transfer must never leave one side of a transfer written
   and the other not.
2. **Double-processing** — a retried or double-submitted request must never move money twice.
3. **Lost updates** — two transfers hitting the same account at the same instant must never
   silently overwrite each other.
4. **Undetected drift** — there must be an independent way to *prove* the system's numbers are
   still internally consistent, rather than just trusting the code was bug-free.

LedgerCore implements a specific, real technique against each of these — see below.

---

## Feature overview

| Guarantee | How it's implemented |
|---|---|
| **Atomicity** | Every transfer runs inside a MongoDB multi-document ACID transaction (`session.withTransaction()`) — two journal entries and two balance updates commit together or not at all |
| **Idempotency** | Client-generated `Idempotency-Key` header; duplicate requests replay the original cached response instead of reprocessing (the same pattern Stripe's API uses) |
| **Concurrency safety** | Optimistic concurrency control via a `version` field on every account, with jittered retry-with-backoff on conflict |
| **Independent verification** | A scheduled reconciliation job re-derives system-wide and per-account balances directly from the journal and flags any discrepancy — completely decoupled from the code path that wrote the data |
| **Immutability** | Journal entries and audit logs are append-only at the schema level (writes/deletes throw); corrections happen via new offsetting reversal transactions, never edits |
| **Access control** | JWT auth (httpOnly cookies) with three roles — teller, auditor, admin — enforced per route |
| **Abuse protection** | Sliding-window rate limiting on transaction-mutating endpoints |

---

## Tech stack

- **Backend:** Node.js, Express, MongoDB (replica set, required for transactions), Mongoose
- **Frontend:** React (Vite), plain CSS design system, Axios, React Router
- **Auth:** JWT + bcrypt
- **Infra:** Docker Compose (single-node Mongo replica set + backend + frontend)
- **Testing:** Jest + Supertest + mongodb-memory-server

---

## Quick start

```bash
docker compose up --build
```

Wait for all three containers to report healthy (~15s for the Mongo replica set to finish
initializing), then seed demo data:

```bash
docker exec -it ledgercore-backend npm run seed
```

Open **http://localhost:5173** and sign in:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ledgercore.dev` | `password123` |
| Teller | `teller@ledgercore.dev` | `password123` |
| Auditor | `auditor@ledgercore.dev` | `password123` |

Or sign up your own account from the login screen — registration is open to any role for demo
purposes.

Full local (non-Docker) setup, including how to stand up a local Mongo replica set by hand, is
in [`docs/`](./docs).

---

## Running the tests

```bash
cd backend
npm install
npm test
```

The suite spins up a real, ephemeral single-node MongoDB replica set per run
(`mongodb-memory-server`), so transaction behavior matches production exactly. It covers:

- Happy-path transfers, insufficient funds, journal immutability, reversals
- Idempotent replay and key-reuse mismatch detection
- **10 concurrent transfers against the same account, proving zero lost updates**
- Reconciliation catching a balance directly corrupted outside the ledger service

---

## What to actually demo

1. **Idempotent replay** — submit a transfer, then resubmit the identical form without
   generating a new key. The balance changes once; the response is identical both times.
2. **Concurrency correctness** — run `npm test` and point to `concurrency.test.js`: 10
   simultaneous transfers against one account, final balance exactly correct.
3. **Reconciliation catching a bug** — manually edit an account's `balance` field directly in
   MongoDB, then run reconciliation from the admin dashboard and watch it flag the discrepancy.
4. **Immutability** — attempt `JournalEntry.updateOne(...)` from a Node REPL against the running
   app and show it throws.

---

## Project structure

```
ledgercore/
├── backend/
│   └── src/
│       ├── models/        # Mongoose schemas — Account, Transaction, JournalEntry, etc.
│       ├── services/      # ledgerService, idempotencyService, reconciliationService, auditService
│       ├── middleware/    # auth, RBAC, rate limiting, idempotency check, validation
│       ├── controllers/   # request handlers
│       ├── routes/        # Express route definitions
│       └── jobs/          # scheduled reconciliation cron
├── frontend/
│   └── src/
│       ├── pages/          # Login, Register, Dashboard, AccountDetail, TransferConsole, Reconciliation
│       └── api/             # thin Axios client wrappers
├── docs/                    # original planning package: PRD, architecture, API spec, security notes
├── docker-compose.yml
└── README.md                 # you are here
```

See [`docs/02_ARCHITECTURE.md`](./docs/02_ARCHITECTURE.md) for the full system diagram and the
reasoning behind each architectural decision, and [`docs/08_FEATURES.md`](./docs/08_FEATURES.md)
for the complete feature checklist.

---

## Design notes (frontend)

The dashboard is deliberately styled around real accounting artifacts rather than a generic
admin-panel template: greenbar ledger-paper table striping, rotated ink-stamp status badges, and
the century-old debit-red / credit-green convention, set in IBM Plex Serif/Sans/Mono. It's plain
CSS — no component framework — so every visual decision is traceable and explainable.

---

## Honest limitations

This is a portfolio/learning project, not production software. Explicitly out of scope:
multi-currency FX, horizontal sharding, real payment rail integration, and account-opening
compliance workflows (KYC, approval gates). See [`docs/01_PRD.md`](./docs/01_PRD.md) for the full
non-goals list — these were deliberate scoping choices to keep engineering effort on the ledger
correctness guarantees, which is the actual point of the project.

---

## License

Built as a personal portfolio/learning project.