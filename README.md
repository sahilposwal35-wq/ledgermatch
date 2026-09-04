# LedgerMatch

**LedgerMatch** is an enterprise-grade, B2B fintech SaaS platform designed to automate the painful process of financial reconciliation. It allows finance and accounting teams to ingest massive internal ledgers and external bank statements, map their columns dynamically, and run a high-performance matching engine to detect missing payments, hidden bank fees, and timing differences.

## 🚀 Key Features

*   **Dynamic Data Ingestion:** Upload any chaotic CSV or Excel export from any ERP or bank. The visual mapping UI allows users to dynamically map their unique headers (e.g., "Bank Ref No.") to the system's required fields.
*   **Memory-Safe Stream Processing:** Engineered to handle massive datasets. Uploads are streamed to disk and processed asynchronously in micro-batches, ensuring the Node.js event loop remains unblocked and memory usage stays perfectly flat regardless of file size.
*   **High-Performance Rules Engine:** Replaced traditional $O(N^2)$ nested-loop matching with a highly optimized engine utilizing pre-indexed Hash Maps for $O(1)$ lookups and sliding window algorithms, reducing processing time from minutes to milliseconds.
*   **Customizable Tolerances:** Users can define batch-specific mathematical rules, such as allowing a 3-day delay on deposits or a $0.05 tolerance for rounding errors, before flagging a transaction as an exception.
*   **Maker-Checker Audit Trail:** Every automatic match and manual override is permanently recorded in a cryptographic-style audit log to satisfy enterprise compliance requirements.

## 🛠️ Tech Stack

*   **Frontend:** React, Vite, CSS Variables (Custom Fintech Theme)
*   **Backend:** Node.js, Express.js, `multer` (Disk Storage), `csv-parse` (Async Generators)
*   **Database:** MongoDB, Mongoose (Complex aggregations, Bulk chunked inserts)
*   **Architecture:** Clean Modular Monolith, RESTful API, Server-Side Pagination

## 🧠 The Matching Logic

The engine categorizes financial records into 6 distinct tiers:
1.  **Exact Match:** Amount, Date, and Reference ID match perfectly.
2.  **Fuzzy Match (Timing):** Amount matches, but the bank settled the transaction a few days late (within user-defined tolerance).
3.  **Split Match (1-to-Many):** Multiple internal invoices were paid in a single batched bank deposit.
4.  **Amount Mismatch:** Reference matches, but the amount is slightly off (detects hidden payment gateway fees).
5.  **Missing on Ledger A:** Unrecorded bank deposits.
6.  **Missing on Ledger B:** Expected payments that never cleared the bank.

## 💻 Running Locally

1.  **Clone the repository**
2.  **Start MongoDB:** Ensure you have a local MongoDB instance running, or configure a MongoDB Atlas connection string.
3.  **Install & Run Backend:**
    ```bash
    cd server
    npm install
    npm run dev
    ```
4.  **Install & Run Frontend:**
    ```bash
    cd client
    npm install
    npm run dev
    ```
5.  Navigate to `http://localhost:5173`

## 📊 Sample Data

A set of synthetic sample datasets (`ledgerA-test.csv` and `ledgerB-test.csv`) are included in the root directory. They have been specifically engineered to test every edge case in the matching algorithm.