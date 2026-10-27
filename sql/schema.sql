-- ============================================================================
-- TRANSACTION LEDGER API - DATABASE SCHEMA & ATOMIC PROCEDURES
-- ============================================================================
-- This script sets up:
-- 1. accounts table (with balance constraint)
-- 2. transactions table (with type/amount constraints and unique reference per account)
-- 3. Database-level immutability triggers (disallowing UPDATE / DELETE on transactions)
-- 4. Atomic stored procedure: process_transaction (locks row, updates balance, inserts transaction)
-- 5. Atomic stored procedure: transfer_funds (deadlock-free dual account lock & transfer)
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ACCOUNTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_holder_name VARCHAR(255) NOT NULL,
    balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_positive_balance CHECK (balance >= 0.00)
);

-- In case table already existed without constraint or column:
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'account_holder_name'
    ) THEN
        ALTER TABLE accounts ADD COLUMN account_holder_name VARCHAR(255);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'email'
    ) THEN
        ALTER TABLE accounts ADD COLUMN email VARCHAR(255);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'password_hash'
    ) THEN
        ALTER TABLE accounts ADD COLUMN password_hash TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'accounts' AND constraint_name = 'chk_positive_balance'
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT chk_positive_balance CHECK (balance >= 0.00);
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. TRANSACTIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    type VARCHAR(10) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    description TEXT NOT NULL,
    reference_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_transaction_type CHECK (type IN ('credit', 'debit')),
    CONSTRAINT chk_transaction_amount CHECK (amount > 0.00),
    CONSTRAINT uq_account_reference UNIQUE (account_id, reference_id)
);

-- Ensure constraints exist if table was already created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'transactions' AND constraint_name = 'chk_transaction_type'
    ) THEN
        ALTER TABLE transactions ADD CONSTRAINT chk_transaction_type CHECK (type IN ('credit', 'debit'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'transactions' AND constraint_name = 'chk_transaction_amount'
    ) THEN
        ALTER TABLE transactions ADD CONSTRAINT chk_transaction_amount CHECK (amount > 0.00);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'transactions' AND constraint_name = 'uq_account_reference'
    ) THEN
        ALTER TABLE transactions ADD CONSTRAINT uq_account_reference UNIQUE (account_id, reference_id);
    END IF;
END $$;

-- Indexes for optimal query performance
CREATE INDEX IF NOT EXISTS idx_transactions_account_created ON transactions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_account_type ON transactions(account_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(account_id, reference_id);

-- ----------------------------------------------------------------------------
-- 3. IMMUTABILITY TRIGGER (Transactions cannot be updated or deleted)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_transaction_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Transactions are immutable and cannot be updated or deleted.'
        USING ERRCODE = '27000';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_transaction_update_delete ON transactions;
CREATE TRIGGER trg_prevent_transaction_update_delete
BEFORE UPDATE OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_transaction_modification();

-- ----------------------------------------------------------------------------
-- 4. ATOMIC FUNCTION: process_transaction
-- Handles credit/debit with row locking (SELECT FOR UPDATE) to eliminate race conditions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_transaction(
    p_account_id UUID,
    p_type VARCHAR,
    p_amount NUMERIC,
    p_description TEXT,
    p_reference_id VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_account accounts%ROWTYPE;
    v_new_balance NUMERIC(15, 2);
    v_transaction transactions%ROWTYPE;
BEGIN
    -- Validate transaction type
    IF p_type NOT IN ('credit', 'debit') THEN
        RAISE EXCEPTION 'INVALID_TYPE: Transaction type must be credit or debit'
            USING ERRCODE = '22023';
    END IF;

    -- Validate positive amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Amount must be greater than zero'
            USING ERRCODE = '22023';
    END IF;

    -- Validate reference_id
    IF p_reference_id IS NULL OR TRIM(p_reference_id) = '' THEN
        RAISE EXCEPTION 'INVALID_REFERENCE: Reference ID is required'
            USING ERRCODE = '22023';
    END IF;

    -- Check for duplicate reference_id for this account
    IF EXISTS (
        SELECT 1 FROM transactions 
        WHERE account_id = p_account_id AND reference_id = p_reference_id
    ) THEN
        RAISE EXCEPTION 'DUPLICATE_REFERENCE: Reference ID already exists for this account'
            USING ERRCODE = '23505';
    END IF;

    -- Lock the account row FOR UPDATE to prevent concurrent race conditions
    SELECT * INTO v_account
    FROM accounts
    WHERE id = p_account_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: Account not found'
            USING ERRCODE = 'P0002';
    END IF;

    -- Balance calculation and insufficient funds check
    IF p_type = 'credit' THEN
        v_new_balance := ROUND((v_account.balance + p_amount)::numeric, 2);
    ELSIF p_type = 'debit' THEN
        IF v_account.balance < p_amount THEN
            RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Insufficient funds for debit transaction. Current balance: %, requested: %', 
                v_account.balance, p_amount
                USING ERRCODE = '22003';
        END IF;
        v_new_balance := ROUND((v_account.balance - p_amount)::numeric, 2);
    END IF;

    -- Insert immutable transaction record
    INSERT INTO transactions (account_id, type, amount, description, reference_id, created_at)
    VALUES (p_account_id, p_type, ROUND(p_amount::numeric, 2), p_description, p_reference_id, NOW())
    RETURNING * INTO v_transaction;

    -- Update account balance
    UPDATE accounts
    SET balance = v_new_balance
    WHERE id = p_account_id;

    -- Return JSON result
    RETURN jsonb_build_object(
        'transaction', row_to_json(v_transaction),
        'account_id', p_account_id,
        'previous_balance', v_account.balance,
        'new_balance', v_new_balance
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. ATOMIC BONUS FUNCTION: transfer_funds
-- Transfers money between two accounts atomically with deadlock-prevention ordering
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION transfer_funds(
    p_from_account_id UUID,
    p_to_account_id UUID,
    p_amount NUMERIC,
    p_description TEXT,
    p_reference_id VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_from_account accounts%ROWTYPE;
    v_to_account accounts%ROWTYPE;
    v_from_new_balance NUMERIC(15, 2);
    v_to_new_balance NUMERIC(15, 2);
    v_debit_tx transactions%ROWTYPE;
    v_credit_tx transactions%ROWTYPE;
    v_ref_debit VARCHAR(120);
    v_ref_credit VARCHAR(120);
BEGIN
    -- Cannot transfer to the same account
    IF p_from_account_id = p_to_account_id THEN
        RAISE EXCEPTION 'INVALID_TRANSFER: Sender and recipient accounts must be different'
            USING ERRCODE = '22023';
    END IF;

    -- Amount must be positive
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Transfer amount must be greater than zero'
            USING ERRCODE = '22023';
    END IF;

    -- Reference ID required
    IF p_reference_id IS NULL OR TRIM(p_reference_id) = '' THEN
        RAISE EXCEPTION 'INVALID_REFERENCE: Reference ID is required'
            USING ERRCODE = '22023';
    END IF;

    v_ref_debit := p_reference_id || '-DR';
    v_ref_credit := p_reference_id || '-CR';

    -- Check duplicate reference ID in sender or receiver account
    IF EXISTS (
        SELECT 1 FROM transactions 
        WHERE (account_id = p_from_account_id AND reference_id = v_ref_debit)
           OR (account_id = p_to_account_id AND reference_id = v_ref_credit)
    ) THEN
        RAISE EXCEPTION 'DUPLICATE_REFERENCE: Transfer reference ID has already been processed'
            USING ERRCODE = '23505';
    END IF;

    -- Lock accounts in deterministic order (smaller UUID first) to prevent deadlocks
    IF p_from_account_id < p_to_account_id THEN
        SELECT * INTO v_from_account FROM accounts WHERE id = p_from_account_id FOR UPDATE;
        SELECT * INTO v_to_account FROM accounts WHERE id = p_to_account_id FOR UPDATE;
    ELSE
        SELECT * INTO v_to_account FROM accounts WHERE id = p_to_account_id FOR UPDATE;
        SELECT * INTO v_from_account FROM accounts WHERE id = p_from_account_id FOR UPDATE;
    END IF;

    -- Check existence
    IF v_from_account.id IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: Sender account not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_to_account.id IS NULL THEN
        RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: Recipient account not found'
            USING ERRCODE = 'P0002';
    END IF;

    -- Check sufficient funds
    IF v_from_account.balance < p_amount THEN
        RAISE EXCEPTION 'INSUFFICIENT_FUNDS: Insufficient funds in sender account. Current balance: %, requested: %',
            v_from_account.balance, p_amount
            USING ERRCODE = '22003';
    END IF;

    v_from_new_balance := ROUND((v_from_account.balance - p_amount)::numeric, 2);
    v_to_new_balance := ROUND((v_to_account.balance + p_amount)::numeric, 2);

    -- Insert debit transaction for sender
    INSERT INTO transactions (account_id, type, amount, description, reference_id, created_at)
    VALUES (
        p_from_account_id, 
        'debit', 
        ROUND(p_amount::numeric, 2), 
        'Transfer to ' || COALESCE(v_to_account.account_holder_name, v_to_account.name) || ': ' || COALESCE(p_description, 'Fund transfer'),
        v_ref_debit, 
        NOW()
    )
    RETURNING * INTO v_debit_tx;

    -- Insert credit transaction for recipient
    INSERT INTO transactions (account_id, type, amount, description, reference_id, created_at)
    VALUES (
        p_to_account_id, 
        'credit', 
        ROUND(p_amount::numeric, 2), 
        'Transfer from ' || COALESCE(v_from_account.account_holder_name, v_from_account.name) || ': ' || COALESCE(p_description, 'Fund transfer'),
        v_ref_credit, 
        NOW()
    )
    RETURNING * INTO v_credit_tx;

    -- Update sender balance
    UPDATE accounts 
    SET balance = v_from_new_balance 
    WHERE id = p_from_account_id;

    -- Update recipient balance
    UPDATE accounts 
    SET balance = v_to_new_balance 
    WHERE id = p_to_account_id;

    -- Return JSON result
    RETURN jsonb_build_object(
        'transfer_reference', p_reference_id,
        'amount', ROUND(p_amount::numeric, 2),
        'from_account', jsonb_build_object(
            'account_id', p_from_account_id,
            'previous_balance', v_from_account.balance,
            'new_balance', v_from_new_balance,
            'transaction', row_to_json(v_debit_tx)
        ),
        'to_account', jsonb_build_object(
            'account_id', p_to_account_id,
            'previous_balance', v_to_account.balance,
            'new_balance', v_to_new_balance,
            'transaction', row_to_json(v_credit_tx)
        ),
        'created_at', NOW()
    );
END;
$$;
