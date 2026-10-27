# Assumptions and Design Decisions

This document outlines the architectural assumptions, financial invariants, and system constraints implemented in the **Transaction Ledger API**.

---

## 1. Currency & Monetary Precision
- **Precision Standard:** All monetary amounts (`balance`, `amount`) are stored using PostgreSQL `NUMERIC(15, 2)` (and validated via regex `/^\d+(\.\d{1,2})?$/`).
- **Floating-Point Avoidance:** JavaScript IEEE 754 floating-point inaccuracies are mitigated by storing cents-precise decimals in PostgreSQL and rounding calculated balances to two decimal places.
- **Minimum Amount:** The minimum transaction and transfer amount is strictly `$0.01`. Non-positive amounts (`<= 0`) or non-numeric values are rejected with `HTTP 400 Bad Request (INVALID_AMOUNT)`.
- **Sub-Cent Rejection:** Amounts exceeding two decimal places (e.g., `$10.999`) are rejected with `HTTP 400 Bad Request (INVALID_PRECISION)`.

---

## 2. Account Lifecycle & Initial Balance Mandate
- **Zero Balance Enforcement:** In strict compliance with Requirement 1, all new accounts are initialized with an exact balance of `$0.00` on the server.
- **Client Balance Stripping:** Any client-supplied balance parameter (e.g., `{ "name": "Alice", "balance": 10000 }`) in `POST /api/accounts` is stripped and ignored by request validation middleware before database insertion.
- **Identifiers:** Account identifiers are system-generated standard UUIDv4 keys (`gen_random_uuid()`).
- **Account Holder Name:** A non-empty string is required (supporting both `name` per assessment spec and `account_holder_name`).

---

## 3. Concurrency Control & ACID Atomicity
- **Pessimistic Locking:** To prevent double-spend race conditions under concurrent requests, all balance modifications execute within a PostgreSQL transaction using row-level locking:
  ```sql
  SELECT id, balance FROM accounts WHERE id = p_account_id FOR UPDATE;
  ```
- **Deadlock Prevention in Transfers:** During peer-to-peer transfers involving two accounts, row locks are acquired in sorted deterministic UUID order (`LEAST(from_id, to_id)` followed by `GREATEST(from_id, to_id)`). This guarantees that concurrent reciprocal transfers (e.g., Alice $\leftrightarrow$ Bob) never result in deadlock.
- **Atomic Rollback:** If any step of a transaction or transfer fails (e.g., debit exceeds available balance), the entire database transaction is rolled back, preserving state integrity.

---

## 4. Overdraft Prevention & Invariant Rules
- **Non-Negative Balance Invariant:** Accounts are not permitted to have negative balances (`CHECK (balance >= 0)` enforced at the schema level).
- **Insufficient Funds:** A debit transaction or outgoing transfer that exceeds the account's current available balance is immediately rejected with `HTTP 400 Bad Request (INSUFFICIENT_FUNDS)`. No ledger entry is created, and the balance remains intact.

---

## 5. Idempotency & Reference ID Uniqueness
- **Scope of Uniqueness:** The `reference_id` field serves as a client-provided idempotency key. A unique constraint is enforced per account:
  ```sql
  CONSTRAINT uq_account_reference UNIQUE (account_id, reference_id)
  ```
- **Duplicate Prevention:** Re-submitting an existing `reference_id` for the same account is rejected with `HTTP 409 Conflict (DUPLICATE_REFERENCE_ID)`.
- **Global Uniqueness for Transfers:** Transfers require an audit reference ID unique to the transfer operation.

---

## 6. Transaction Immutability & Audit Integrity
- **Append-Only Ledger:** Transactions represent permanent historical financial events. Once inserted, a transaction row cannot be modified or deleted.
- **API Guard:** `PUT`, `PATCH`, and `DELETE` requests to `/api/transactions/:id` are rejected at the router level with `HTTP 405 Method Not Allowed`.
- **Database Trigger Guard:** A PostgreSQL database trigger (`trg_protect_transactions_immutability`) prevents direct SQL `UPDATE` or `DELETE` statements on the `transactions` table, raising exception code `27000`.

---

## 7. Pagination and History Queries
- **Sorting:** Transaction history queries are strictly sorted in descending chronological order (`created_at DESC`), ensuring the most recent activity appears first.
- **Pagination Defaults:**
  - Default `page`: `1`
  - Default `limit`: `10`
  - Maximum `limit`: `100` (requests requesting `> 100` are rejected with `HTTP 400`)
- **Metadata:** All paginated responses include complete pagination metadata:
  ```json
  {
    "page": 1,
    "limit": 10,
    "total_records": 42,
    "total_pages": 5
  }
  ```

---

## 8. Authentication & Scope Boundaries
- **No User Authentication:** In accordance with the assessment specifications and evaluation instructions, the system intentionally does not implement user login/registration or JWT session gating. All API endpoints operate directly on valid Account UUIDs.
- **Public Sandbox Interface:** The web frontend operates as an evaluation dashboard allowing reviewers to inspect, test, and demonstrate all core ledger requirements in real-time.

---

## 9. Deployment Architecture
- **Backend (Render):** Node.js / Express CommonJS server listening on `process.env.PORT` with CORS configured for Vercel origins.
- **Frontend (Vercel):** Static dashboard configured via `vercel.json` (`outputDirectory: "public"`), communicating via either relative proxy rewrites or direct Render API CORS calls.
- **Database (Supabase PostgreSQL):** Cloud PostgreSQL instance executing stored procedures (`process_transaction`, `transfer_funds`) with atomic transaction isolation.
