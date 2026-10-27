# Transaction Ledger API

A robust, enterprise-grade double-entry capable **Transaction Ledger API** built with **Node.js**, **Express**, and **Supabase PostgreSQL**.

Designed with strict data integrity, atomic transactions, row-level locking concurrency control, immutable transaction records, and comprehensive input validation.

---

## Table of Contents

- [Features](#features)
- [Web Application & Visual Aesthetics](#web-application--visual-aesthetics)
- [Architecture & Concurrency Control](#architecture--concurrency-control)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites & Installation](#prerequisites--installation)
- [Database Setup & Migrations](#database-setup--migrations)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [API Documentation](#api-documentation)
  - [1. Create Account](#1-create-account)
  - [2. Get Account Details](#2-get-account-details)
  - [3. Get Account Balance](#3-get-account-balance)
  - [4. Add Transaction (Credit/Debit)](#4-add-transaction-creditdebit)
  - [5. Get Transaction History](#5-get-transaction-history)
  - [6. Transfer Funds (Bonus)](#6-transfer-funds-bonus)
  - [7. Transaction Immutability Guarantee](#7-transaction-immutability-guarantee)
- [Deployment Guide (Render & Vercel)](#deployment-guide-render--vercel)
- [Assumptions](#assumptions)

---

## Features

1. **Create Account**
   - Automatically generates a unique UUID for each account.
   - Enforces non-empty account holder names.
   - Server-enforced zero initial balance (client inputs for balance are strictly stripped and ignored).
   - Automatically assigns creation and update timestamps.

2. **Add Transaction (Credit / Debit)**
   - Supports `credit` (increases balance) and `debit` (decreases balance).
   - Strict validation: requires positive numeric amount, valid UUID account ID, non-empty description, and unique reference ID.
   - Rejects debits if balance is insufficient (HTTP 400 with descriptive error).
   - Prevents duplicate `reference_id` values within the same account (HTTP 409 Conflict).

3. **Get Account Balance**
   - Retrieves real-time account balance and account ID.
   - Returns HTTP 404 if the account does not exist.

4. **Get Transaction History**
   - Filter by transaction type: `credit` or `debit`.
   - Supports `page` and `limit` pagination.
   - Returns standard pagination metadata: `page`, `limit`, `total_records`, and `total_pages`.
   - Chronologically sorted by `created_at` in descending order (latest transactions first).

5. **Data Integrity & Concurrency Control**
   - **Atomicity**: Inserting a transaction record and updating the account balance succeed or fail together.
   - **Race Condition Prevention**: Employs PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) in stored procedures so concurrent debit/credit requests are serialized safely without balance anomalies.
   - **Database Constraints**: Table-level check constraints ensure balances cannot be negative (`balance >= 0.00`) and amounts must be strictly positive (`amount > 0.00`).
   - **Immutability**: Transactions cannot be updated (`PUT`/`PATCH`) or deleted (`DELETE`) through the API (HTTP 405 Method Not Allowed) or database (via PostgreSQL triggers).

6. **Bonus: Atomic Fund Transfer**
   - Atomic fund transfer between two accounts with deadlock prevention (deterministic row ordering).
   - Creates paired debit and credit transaction records linked by a common transfer reference.

---

## Web Application & Visual Aesthetics

The project features a **world-class, high-conversion FinTech user interface** built with modern glassmorphism, responsive micro-animations, and dynamic real-time state:

- **Enterprise Ledger Dashboard (`/`)**:
  - **Live Balance & KPI Cards**: Real-time available balance, total credit inflow, total debit outflow, and 100% audit integrity badge.
  - **Open New Account Modal**: Fast account creation enforcing the server-side **$0.00 initial balance mandate**.
  - **1-Click Account Switcher**: Easily switch between accounts in the database or inspect the full Accounts Directory.
  - **Atomic Transfer Station**: Interactive peer-to-peer money transfers with quick amount chips ($10, $25, $50, $100) and live audit log visualization.
  - **Deposit & Withdraw Console**: Fast credit/debit testing with instant balance preview and a built-in **"Test Insufficient Funds"** stress-test button (HTTP 400 rejection).
  - **Immutable Audit Table**: Paginated transaction history with filtering by type (`Credit`/`Debit`) and **Export to CSV** functionality.
  - **Interactive API & Immutability Suite**: Live trigger button testing `DELETE /api/transactions/:id` to demonstrate the **HTTP 405 Method Not Allowed** constraint.
  - **Dynamic Backend API Configurator**: Seamlessly toggles between local development, Vercel proxy, or direct Render URL.

---

## Architecture & Concurrency Control

```
   Client Request
        │
        ▼
   [Express Router]
        │
   [Input Validation Middleware]
        │
   [Service Layer]
        │
        ▼
  [Supabase RPC / Stored Procedure]
        │
  ┌─────┴──────────────────────────────────────────────────────┐
  │ PostgreSQL Transaction Boundary:                           │
  │ 1. SELECT * FROM accounts WHERE id = ... FOR UPDATE        │
  │    (Acquires exclusive row-level lock)                     │
  │ 2. Check balance sufficiency (for debit)                   │
  │ 3. Check reference_id uniqueness (UQ constraint & check)   │
  │ 4. INSERT INTO transactions (...) RETURNING *             │
  │ 5. UPDATE accounts SET balance = new_balance               │
  │ 6. COMMIT / ROLLBACK on any failure                        │
  └────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

- **Runtime**: Node.js (v18+)
- **Framework**: Express.js 5
- **Database**: Supabase PostgreSQL
- **Key Libraries**: `@supabase/supabase-js`, `dotenv`, `cors`, `supertest`

---

## Project Structure

```
full stack project/
├── .env.example                # Template for environment variables
├── .gitignore                  # Git ignore rules (.env, node_modules)
├── package.json                # Project dependencies and npm scripts
├── README.md                   # Complete documentation and API guide
├── sql/
│   ├── schema.sql              # Table schemas, constraints, indexes & PL/pgSQL stored procedures
│   └── setup_instructions.md   # Supabase database setup guide
├── src/
│   ├── app.js                  # Express application setup & middleware assembly
│   ├── server.js               # HTTP server entry point
│   ├── config/
│   │   ├── env.js              # Environment variable loader & validator
│   │   └── supabase.js         # Supabase client singleton
│   ├── controllers/
│   │   ├── accountController.js      # Account HTTP handlers
│   │   ├── transactionController.js  # Transaction HTTP handlers
│   │   └── transferController.js     # Transfer HTTP handlers
│   ├── services/
│   │   ├── accountService.js         # Account business logic
│   │   ├── transactionService.js     # Transaction atomic RPC calling & fallback logic
│   │   └── transferService.js        # Transfer atomic RPC calling & fallback logic
│   ├── middlewares/
│   │   ├── validator.js        # Input validation & sanitization
│   │   └── errorHandler.js     # Centralized error handler & DB error normalizer
│   └── utils/
│       ├── errors.js           # Custom ApiError hierarchy
│       └── response.js         # Standard JSON response formatters
└── tests/
    ├── api.test.js             # API endpoint validation and immutability tests
    ├── ledger_unit.test.js     # Unit tests for ledger math & database error mappings
    └── live.test.js            # End-to-end live integration test runner against Supabase
```

---

## Prerequisites & Installation

### 1. Clone & Install Dependencies

```bash
git clone <repository-url>
cd "full stack project"
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
PORT=5000
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-supabase-service-role-or-anon-key
```

> **Tip:** You can find `SUPABASE_URL` and `SUPABASE_KEY` in your Supabase Dashboard under **Project Settings -> API**. Using the `service_role` key is recommended for backend ledger services to bypass row-level security policies.

---

## Database Setup & Migrations

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Open the **SQL Editor** tab.
3. Paste the contents of [`sql/schema.sql`](file:///c:/full%20stack%20project/sql/schema.sql) into the editor.
4. Click **Run**.

This script sets up:
- The `accounts` and `transactions` tables with primary keys, foreign keys, and check constraints (`balance >= 0`, `amount > 0`).
- Unique constraint `uq_account_reference (account_id, reference_id)`.
- Database-level trigger `trg_prevent_transaction_update_delete` blocking any `UPDATE` or `DELETE` on transactions.
- Stored procedures `process_transaction` and `transfer_funds` with row-level locks (`SELECT ... FOR UPDATE`).

---

## Running the Application

### Development Mode (with hot-reload via nodemon)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

The server will start at: `http://localhost:5000`  
Health check endpoint: `http://localhost:5000/health`

---

## Testing

### Automated Unit & API Validation Tests
Run the comprehensive test suite covering input validation, business logic, pagination, immutability, and database error normalization:

```bash
npm test
```

### End-to-End Live Integration Tests
Once your `.env` contains valid Supabase credentials and `sql/schema.sql` is executed, run the live integration suite:

```bash
npm run test:live
```

The live test suite executes:
1. Account creation for Alice and Bob (verifying initial balance is zero).
2. Crediting $250.00 to Alice.
3. Debiting $50.00 from Alice (verifying balance decreases to $200.00).
4. Insufficient funds test (attempting $10,000 debit and verifying balance remains unchanged).
5. Duplicate reference ID test (attempting identical reference ID and verifying HTTP 409).
6. Bonus fund transfer: transferring $75.00 atomically from Alice to Bob.
7. Paginated transaction history retrieval.
8. Immutability verification: confirming PUT/DELETE attempts return HTTP 405.

---

## API Documentation

### Standard Response Format

#### Success Response
```json
{
  "success": true,
  "message": "Optional descriptive message",
  "data": { ... },
  "pagination": { ... }
}
```

#### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error explanation",
    "details": null
  }
}
```

---

### 1. Create Account
Creates a new account. The balance is always initialized to 0.00 on the server.

- **URL**: `POST /api/accounts`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "account_holder_name": "Alice Walker"
  }
  ```
  *(Note: Even if a `balance` field is sent by the client, it is stripped and strictly ignored).*
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Account created successfully",
    "data": {
      "id": "c1f7b820-21a4-4f01-8e7c-a0e28f3cb245",
      "account_holder_name": "Alice Walker",
      "balance": 0.00,
      "created_at": "2026-10-26T12:00:00.000Z",
      "updated_at": "2026-10-26T12:00:00.000Z"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: When `account_holder_name` is missing or empty.

---

### 2. Get Account Details
Retrieves complete account details.

- **URL**: `GET /api/accounts/:id`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "c1f7b820-21a4-4f01-8e7c-a0e28f3cb245",
      "account_holder_name": "Alice Walker",
      "balance": 150.00,
      "created_at": "2026-10-26T12:00:00.000Z",
      "updated_at": "2026-10-26T12:05:00.000Z"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: If `:id` is not a valid UUID format.
  - `404 Not Found`: If no account matches the given ID.

---

### 3. Get Account Balance
Retrieves only the account ID and its current balance.

- **URL**: `GET /api/accounts/:id/balance`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "account_id": "c1f7b820-21a4-4f01-8e7c-a0e28f3cb245",
      "account_holder_name": "Alice Walker",
      "balance": 150.00,
      "updated_at": "2026-10-26T12:05:00.000Z"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: If `:id` is not a valid UUID.
  - `404 Not Found`: If account does not exist.

---

### 4. Add Transaction (Credit/Debit)
Adds a credit or debit transaction atomically.

- **URL**: `POST /api/transactions` (or `POST /api/accounts/:id/transactions`)
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "account_id": "c1f7b820-21a4-4f01-8e7c-a0e28f3cb245",
    "type": "credit",
    "amount": 250.50,
    "description": "Salary deposit",
    "reference_id": "DEP-20261026-001"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Transaction recorded successfully",
    "data": {
      "transaction": {
        "id": "e8a93e32-b7e1-4321-9876-123456789abc",
        "account_id": "c1f7b820-21a4-4f01-8e7c-a0e28f3cb245",
        "type": "credit",
        "amount": 250.50,
        "description": "Salary deposit",
        "reference_id": "DEP-20261026-001",
        "created_at": "2026-10-26T12:05:00.000Z"
      },
      "account_id": "c1f7b820-21a4-4f01-8e7c-a0e28f3cb245",
      "previous_balance": 0.00,
      "new_balance": 250.50
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid type (not credit/debit), non-positive amount, precision > 2 decimals, or insufficient funds for debit.
  - `404 Not Found`: Account does not exist.
  - `409 Conflict`: Duplicate `reference_id` for this account.

---

### 5. Get Transaction History
Retrieves paginated transactions for an account, sorted by `created_at` descending.

- **URL**: `GET /api/accounts/:id/transactions`
- **Query Parameters**:
  - `type` (optional): Filter by `credit` or `debit`.
  - `page` (optional): Page number (default: `1`, minimum: `1`).
  - `limit` (optional): Items per page (default: `10`, maximum: `100`).
- **Example Request**:  
  `GET /api/accounts/c1f7b820-21a4-4f01-8e7c-a0e28f3cb245/transactions?type=credit&page=1&limit=5`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "e8a93e32-b7e1-4321-9876-123456789abc",
        "account_id": "c1f7b820-21a4-4f01-8e7c-a0e28f3cb245",
        "type": "credit",
        "amount": 250.50,
        "description": "Salary deposit",
        "reference_id": "DEP-20261026-001",
        "created_at": "2026-10-26T12:05:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 5,
      "total_records": 1,
      "total_pages": 1
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Invalid `type` filter, `page < 1`, or `limit < 1 || limit > 100`.
  - `404 Not Found`: Account does not exist.

---

### 6. Transfer Funds (Bonus)
Atomically transfers money from one account to another using deterministic row locks.

- **URL**: `POST /api/transfers`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "from_account_id": "c1f7b820-21a4-4f01-8e7c-a0e28f3cb245",
    "to_account_id": "d2a8c931-32b5-5a12-9f8d-b1f39a4dc356",
    "amount": 75.00,
    "description": "Reimbursement for dinner",
    "reference_id": "TXFR-20261026-901"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Fund transfer completed successfully",
    "data": {
      "transfer_reference": "TXFR-20261026-901",
      "amount": 75.00,
      "from_account": {
        "account_id": "c1f7b820-21a4-4f01-8e7c-a0e28f3cb245",
        "previous_balance": 250.50,
        "new_balance": 175.50,
        "transaction": { ... }
      },
      "to_account": {
        "account_id": "d2a8c931-32b5-5a12-9f8d-b1f39a4dc356",
        "previous_balance": 0.00,
        "new_balance": 75.00,
        "transaction": { ... }
      },
      "created_at": "2026-10-26T12:10:00.000Z"
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Sender and recipient are identical, non-positive amount, or insufficient balance in sender account.
  - `404 Not Found`: Either sender or recipient account does not exist.
  - `409 Conflict`: Transfer reference ID already used.

---

### 7. Transaction Immutability Guarantee
Transactions represent an indelible ledger. Any attempt to update or delete a transaction via the API is blocked:

- `PUT /api/transactions/:id` -> `405 Method Not Allowed`
- `PATCH /api/transactions/:id` -> `405 Method Not Allowed`
- `DELETE /api/transactions/:id` -> `405 Method Not Allowed`

Response:
```json
{
  "success": false,
  "error": {
    "code": "METHOD_NOT_ALLOWED",
    "message": "Transactions are immutable and cannot be modified or deleted."
  }
}
```

---

## Deployment Guide (Render & Vercel)

This project is architected for clean separation between the frontend dashboard and backend ledger API:
- **Backend**: Node.js/Express deployed on **Render** (free tier Web Service).
- **Frontend**: Static Dashboard deployed on **Vercel**.
- **Database**: PostgreSQL hosted on **Supabase**.

### 1. Backend Deployment on Render
1. Sign in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** > **Web Service**.
3. Connect your GitHub repository: `https://github.com/shreya-shetty205/Transaction-Ledger.git`.
4. Configure the service:
   - **Name**: `transaction-ledger-api` (or your preferred name)
   - **Region**: Choose closest region (e.g. Frankfurt, Oregon, Singapore)
   - **Branch**: `main`
   - **Root Directory**: Leave blank (root `.`)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Click **Advanced** > **Add Environment Variable**:
   - `PORT`: `5000` (or leave default, Render sets this automatically)
   - `NODE_ENV`: `production`
   - `SUPABASE_URL`: Your Supabase Project URL (`https://<project-id>.supabase.co`)
   - `SUPABASE_KEY`: Your Supabase key (service_role or anon key)
   - `FRONTEND_URL`: Your Vercel frontend URL (e.g., `https://transaction-ledger.vercel.app`)
6. Click **Create Web Service**. Wait 2–3 minutes for deployment.
7. Test your backend health check:
   `https://<your-render-app>.onrender.com/health` -> returns `{"status":"UP"}`.

### 2. Frontend Deployment on Vercel
1. Sign in to your [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** > **Project**.
3. Import your GitHub repository: `shreya-shetty205/Transaction-Ledger`.
4. Configure the project:
   - **Framework Preset**: `Other`
   - **Root Directory**: `./` (leave default)
   - **Output Directory**: `public` (configured automatically via `vercel.json`)
5. Click **Deploy**.
6. Once deployed, open your live Vercel URL.
7. In the header of your dashboard, click **API: Local / Proxy** (or the gear icon) and paste your live Render URL (e.g., `https://transaction-ledger-api.onrender.com`). The dashboard will instantly connect and load your live Supabase ledger!

---

## Assumptions

For detailed architectural decisions, concurrency modeling, invariant guarantees, and financial precision specs, see [ASSUMPTIONS.md](ASSUMPTIONS.md).

1. **Currency Precision**: Monetary balances and transaction amounts use 2 decimal places (`NUMERIC(15, 2)`). Amounts with more than 2 decimal places are rejected during request validation.
2. **Account IDs**: All account IDs and transaction IDs are standard UUIDs.
3. **Reference ID Scope**: Reference IDs are unique per account (`UNIQUE(account_id, reference_id)`), allowing different accounts to independently use external invoice or check numbers while preventing replay attacks within the same account. For transfers, references are suffixed with `-DR` and `-CR`.
4. **Zero Overdraft Policy**: Accounts are strictly non-overdraftable (`balance >= 0.00`). Any debit that would result in a negative balance is rejected.
5. **Database Immutability**: In addition to API-level route restrictions, database triggers are deployed to prevent any direct SQL `UPDATE` or `DELETE` on the `transactions` table.

