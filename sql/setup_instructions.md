# Supabase Database Setup Instructions

To enable atomic transactions, row-level locking, race condition protection, and constraints:

1. Open your Supabase Dashboard: [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project.
3. Click on **SQL Editor** in the left sidebar.
4. Click **New Query**.
5. Copy all the contents of `sql/schema.sql` and paste them into the SQL Editor.
6. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`).
7. You should see `Success. No rows returned`.

### What This Script Does:
- **Ensures Tables & Columns**: Guarantees `accounts` and `transactions` have all required columns (`account_holder_name`, `balance`, `type`, `amount`, `reference_id`, etc.).
- **Enforces Constraints**:
  - `chk_positive_balance`: Balances can never go below 0.00.
  - `chk_transaction_type`: Types are strictly `'credit'` or `'debit'`.
  - `chk_transaction_amount`: Amounts must be positive (`> 0.00`).
  - `uq_account_reference`: Prevents duplicate `reference_id` within the same account.
- **Database Immutability Trigger**: Prevents `UPDATE` or `DELETE` on the `transactions` table.
- **Atomic PL/pgSQL Function `process_transaction`**:
  - Uses `SELECT ... FOR UPDATE` to lock the account row during processing, preventing race conditions from concurrent requests.
  - Verifies funds for debits.
  - Inserts transaction and updates account balance in a single atomic database transaction.
- **Atomic PL/pgSQL Function `transfer_funds` (Bonus)**:
  - Locks sender and receiver accounts in deterministic order (preventing deadlocks).
  - Atomically moves funds and records debit & credit ledger entries.
