# LedgerMatch: Technical Design Document

> This document supplements the [README](README.md) with deeper technical context for interview preparation. Everything stated here is verifiable in the codebase.

---

## 1. The Problem

When a company sells a product, they record it in their internal database (Ledger A). When the payment clears the bank or payment gateway (Ledger B), the amounts and dates rarely match perfectly:

- **The Timing Problem:** A sale made on Friday might not settle in the bank until Tuesday.
- **The Fee Problem:** A ₹1,200 sale might hit the bank as ₹1,190 because of a transaction fee deducted at settlement.
- **The Batch Problem:** Multiple individual sales might be deposited into the bank as one lump sum.

Finance teams typically reconcile these using Excel VLOOKUP — a manual, error-prone process. LedgerMatch automates it with a deterministic rules engine and an auditable maker-checker workflow.

---

## 2. Workflow

1. **Authentication:** A user registers with a role (maker or checker) and logs in via JWT.
2. **Data Ingestion:** The maker uploads two CSV files. The frontend parses CSV headers client-side using the FileReader API and presents a visual column-mapping UI so the user can map arbitrary column names (e.g., "Bank Ref No" vs "Transaction ID") to the system's expected schema.
3. **Stream Processing:** Multer writes uploaded files to disk. The backend streams them row-by-row using `csv-parse` with `for await` loops and inserts into MongoDB in chunks of 1,000 rows via `insertMany`. This keeps memory usage proportional to the chunk size, not the file size.
4. **Rules Configuration:** The maker configures tolerances (date tolerance in days, amount tolerance) per batch via the Settings panel.
5. **Reconciliation Engine:** The backend loads all records for the batch into memory, builds two hash maps for O(1) candidate lookup, and runs the 4-tier cascading algorithm.
6. **Exception Queue:** The dashboard shows all matches sorted by confidence. Non-exact matches go to `pending_review` status.
7. **Maker-Checker Review:** A checker (who did NOT create the batch) reviews each exception, provides a mandatory justification, and approves or rejects. The resolution is logged in an append-only audit trail with the checker's real user ID from the JWT.

---

## 3. The Matching Algorithm

See the [inline documentation in matchingEngine.js](server/services/matchingEngine.js) for the authoritative reference. Summary:

| Tier | Fields Compared | Lookup Strategy | Confidence |
|------|----------------|-----------------|------------|
| 1 — Exact | refId + amount (±0.01) + date (same day) | Hash map on refId | 100% |
| 2 — Fuzzy | amount (exact) + date (±N days), refId ignored | Hash map on amount | 90%/75% |
| 3 — Split | sum of 2 A amounts = B amount, date (±N days) | O(A²) pair scan + hash map on summed amount | 70% |
| 4 — Mismatch | refId + date (±N days), amount differs | Hash map on refId | 40% |

**Tie-breaking:** Greedy first-match in insertion order. Deterministic, not optimized. See the engine comments for the rationale.

**What "fuzzy" means here:** Amount-equality + date-proximity. No string-similarity metrics (Levenshtein, Jaro-Winkler, etc.) are used. This is deliberate — in bank reconciliation, the amount is a stronger signal than narration text, and narration formats vary too much across banks for text similarity to be reliable.

---

## 4. Technology Choices

### Why MongoDB?
Financial records from different banks/systems have different schemas — some have narration fields, some don't; some have multiple reference IDs, some have none. MongoDB's flexible document model accommodates this without schema migrations. Compound unique indexes (`batchId + txnId`) enforce data integrity where needed.

### Why Hash Maps?
The naive approach (compare every A record against every B record) is O(N²). By grouping B records into two hash maps — one keyed on refId, one keyed on amount — each A record's candidate lookup is O(1). This brings total complexity to O(N) for Tiers 1, 2, and 4. Tier 3 is O(A²) for pair enumeration but each pair's B lookup is still O(1).

### Why Stream Parsing?
Loading an entire CSV into memory before processing would crash on large files. Using `csv-parse` with `for await` and chunked `insertMany` (1,000 rows per batch) keeps memory proportional to the chunk size, not the file size.

### Why Transactions?
The reconciliation write path (delete old matches → insert new matches → insert audit logs → update batch status) involves multiple writes across multiple collections. Without a transaction, a crash between any two writes would leave the database in an inconsistent state — e.g., matches without corresponding audit trail entries. MongoDB's `startSession()` + `withTransaction()` ensures all-or-nothing.

---

## 5. Security Model

- **JWT-based auth** with bcrypt password hashing (salt rounds: 10)
- **Role-based access control** via `requireRole()` middleware
- **Self-approval prevention** enforced at the database level (compares `batch.createdBy` against the JWT's user ID)
- **Audit trail integrity** — `resolvedBy` is set from the JWT, never from client input
- **UI-level button hiding is convenience only** — all authorization is enforced server-side

---

## 6. Known Limitations

These are documented here (and in the README) so they can be discussed honestly in an interview:

1. **Batch names are globally unique** — two makers can't create batches with the same name. Production would namespace by organization.
2. **Split matching only checks pairs** (2 A → 1 B). Triplets or higher are not checked — O(A³) complexity for marginal gain.
3. **No role-change API** — role changes require direct DB access.
4. **JWT role staleness** — up to 7 days. The self-approval check is DB-based and unaffected, but `requireRole` middleware could reflect a stale role.
5. **The matching engine loads all records into memory** — works well for tens of thousands of rows but would need streaming/pagination for millions.
6. **Tie-breaking is greedy, not optimal** — first qualifying candidate wins, no optimization for closest date or smallest amount delta.
