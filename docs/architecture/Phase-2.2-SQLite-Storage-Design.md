# Phase 2.2 — SQLite schema and migration design

**Status:** Reviewed design proposal only (2026-10-31)  
**Scope:** schema, runtime choice, and migration strategy. No application code,
SQLite adapter, service, Android component, or migration is implemented here.

## 1. Review basis and boundaries

Aether is currently a browser-based React/Vite application. Its persistence
adapter is Dexie over IndexedDB (`src/db/database.ts` and
`src/repositories/dexie.ts`). The domain types are in `src/domain/types.ts`;
the finance engine derives cash flow, holdings, loan schedules, and net worth
from canonical records rather than stored monthly rows. The current Dexie
stores are `accounts`, `categories`, `transactions`, `investments`, `trades`,
`valuations`, `loans`, `deletedTransactions`, `audit`, `imports`, and
`backups`.

This document designs a future SQLite-shaped model. It does not claim that
the new tables or fields exist in the current application. Existing behavior
and backup compatibility remain migration requirements.

## 2. Money and sign convention

All monetary columns contain integer paise. A single convention is used:

- A canonical cash `transaction.amount` is signed from the account's
  perspective: positive is money entering the account and negative is money
  leaving it.
- Income is positive; an expense is negative.
- A transfer has two `kind='transfer'` legs. The source account has a
  negative amount and the destination account has an equal positive amount.
  Transfers therefore change neither total cash nor cash-flow reports.
- An investment purchase has a negative cash settlement; a sale or dividend
  has a positive cash settlement. Trade principal and fees are stored
  separately as positive magnitudes, with the settlement transaction carrying
  the signed account effect.
- A loan repayment has a negative cash settlement. Principal and interest
  components are positive magnitudes of the repayment allocation. The
  outstanding balance is derived from the loan schedule or an explicitly
  captured balance, not inferred by counting arbitrary cash transactions.
- Fees and interest are never silently added to a second expense transaction.
  A settlement has one authoritative cash transaction and component rows that
  explain it.

The existing engine already interprets transaction signs this way: account
balances sum amounts, while expense/investment/loan-payment reports negate
negative amounts. This proposal preserves that behavior.

SQLite `INTEGER` is signed 64-bit, but JavaScript `number` exactly represents
integers only through `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991).
Until the domain changes to `bigint` or a decimal/string money type, the
adapter must reject any value or intermediate total outside
`[-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]`. This is an
application-level limit, not a SQLite limit; values above it require a
versioned money-type decision before implementation.

## 3. Core schema

The following is a representative SQLite schema. `STRICT` requires a runtime
that supports it; otherwise the adapter must enforce the same types and keep
the `CHECK(typeof(...))` constraints. Foreign keys must be enabled and
verified on every connection.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  type TEXT NOT NULL CHECK(type IN ('bank','cash','wallet','credit_card','brokerage')),
  opening_balance INTEGER NOT NULL CHECK(typeof(opening_balance)='integer'),
  opening_date TEXT NOT NULL
    CHECK(length(opening_date)=10 AND date(opening_date)=opening_date)
) STRICT;

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  is_custom INTEGER NOT NULL CHECK(is_custom IN (0,1))
) STRICT;

CREATE TABLE investments (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  type TEXT NOT NULL CHECK(type IN ('stock','etf','mutual_fund','fd','bond','other')),
  symbol TEXT
) STRICT;

CREATE TABLE loans (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  lender TEXT,
  principal INTEGER NOT NULL CHECK(typeof(principal)='integer'),
  annual_rate_percent REAL NOT NULL,
  start_date TEXT NOT NULL CHECK(length(start_date)=10 AND date(start_date)=start_date),
  tenure_months INTEGER NOT NULL CHECK(tenure_months > 0),
  emi INTEGER NOT NULL CHECK(typeof(emi)='integer'),
  product TEXT CHECK(product IS NULL OR product IN ('home','education','personal','vehicle','other')),
  known_outstanding_amount INTEGER,
  known_outstanding_as_of TEXT,
  CHECK((known_outstanding_amount IS NULL) = (known_outstanding_as_of IS NULL)),
  CHECK(known_outstanding_as_of IS NULL OR
        (length(known_outstanding_as_of)=10 AND date(known_outstanding_as_of)=known_outstanding_as_of))
) STRICT;

CREATE TABLE transfer_groups (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  description TEXT,
  metadata_json TEXT CHECK(metadata_json IS NULL OR json_valid(metadata_json)),
  status TEXT NOT NULL CHECK(status IN ('draft','completed','reversed'))
) STRICT;

CREATE TABLE transactions (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  date TEXT NOT NULL CHECK(length(date)=10 AND date(date)=date),
  amount INTEGER NOT NULL CHECK(typeof(amount)='integer'),
  description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('income','expense','transfer','investment','loan_payment')),
  category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  transfer_group_id TEXT REFERENCES transfer_groups(id) ON DELETE RESTRICT,
  loan_id TEXT REFERENCES loans(id) ON DELETE RESTRICT,
  investment_id TEXT REFERENCES investments(id) ON DELETE RESTRICT,
  import_hash TEXT,
  quality TEXT NOT NULL CHECK(quality IN ('confirmed','manual','estimate')),
  CHECK((kind='transfer') = (transfer_group_id IS NOT NULL))
) STRICT;
CREATE INDEX transactions_account_date ON transactions(account_id,date,id);
CREATE INDEX transactions_transfer_group ON transactions(transfer_group_id);

CREATE TRIGGER complete_transfer_group
BEFORE UPDATE OF status ON transfer_groups
WHEN NEW.status='completed'
 AND (
   (SELECT count(*) FROM transactions WHERE transfer_group_id=NEW.id) <> 2
   OR (SELECT count(DISTINCT account_id) FROM transactions WHERE transfer_group_id=NEW.id) <> 2
   OR (SELECT count(*) FROM transactions
       WHERE transfer_group_id=NEW.id AND kind='transfer') <> 2
   OR (SELECT count(*) FROM transactions
       WHERE transfer_group_id=NEW.id AND amount < 0) <> 1
   OR (SELECT count(*) FROM transactions
       WHERE transfer_group_id=NEW.id AND amount > 0) <> 1
   OR (SELECT COALESCE(sum(amount),1) FROM transactions
       WHERE transfer_group_id=NEW.id) <> 0
 )
BEGIN
  SELECT RAISE(ABORT, 'transfer group requires one negative and one positive opposite leg');
END;

CREATE TRIGGER insert_completed_transfer_group
BEFORE INSERT ON transfer_groups
WHEN NEW.status='completed'
BEGIN
  SELECT RAISE(ABORT, 'transfer group must be created as draft');
END;

CREATE TRIGGER insert_non_draft_transfer_leg
BEFORE INSERT ON transactions
WHEN NEW.transfer_group_id IS NOT NULL
 AND (SELECT status FROM transfer_groups WHERE id=NEW.transfer_group_id) IN ('completed','reversed')
BEGIN
  SELECT RAISE(ABORT, 'only draft transfer groups may receive legs');
END;

CREATE TRIGGER transfer_group_status_transition
BEFORE UPDATE OF status ON transfer_groups
WHEN NOT (
  (OLD.status='draft' AND NEW.status IN ('draft','completed'))
  OR (OLD.status='completed' AND NEW.status IN ('completed','reversed'))
  OR (OLD.status='reversed' AND NEW.status='reversed')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid transfer group status transition');
END;

CREATE TRIGGER update_non_draft_transfer_leg
BEFORE UPDATE ON transactions
WHEN (
  OLD.transfer_group_id IS NOT NULL
  AND (SELECT status FROM transfer_groups WHERE id=OLD.transfer_group_id) IN ('completed','reversed')
)
OR (
  NEW.transfer_group_id IS NOT NULL
  AND (SELECT status FROM transfer_groups WHERE id=NEW.transfer_group_id) IN ('completed','reversed')
)
BEGIN
  SELECT RAISE(ABORT, 'only draft transfer groups may have legs modified');
END;

CREATE TRIGGER delete_non_draft_transfer_leg
BEFORE DELETE ON transactions
WHEN OLD.transfer_group_id IS NOT NULL
 AND (SELECT status FROM transfer_groups WHERE id=OLD.transfer_group_id) IN ('completed','reversed')
BEGIN
  SELECT RAISE(ABORT, 'completed or reversed transfer legs cannot be deleted');
END;

CREATE TRIGGER edit_completed_transfer_leg
BEFORE UPDATE ON transactions
WHEN OLD.transfer_group_id IS NOT NULL
 AND (SELECT status FROM transfer_groups WHERE id=OLD.transfer_group_id)='completed'
BEGIN
  SELECT RAISE(ABORT, 'completed transfer legs cannot be edited');
END;

CREATE TRIGGER delete_completed_transfer_leg
BEFORE DELETE ON transactions
WHEN OLD.transfer_group_id IS NOT NULL
 AND (SELECT status FROM transfer_groups WHERE id=OLD.transfer_group_id)='completed'
BEGIN
  SELECT RAISE(ABORT, 'completed transfer legs cannot be deleted');
END;

CREATE TABLE trades (
  id TEXT PRIMARY KEY NOT NULL,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE RESTRICT,
  date TEXT NOT NULL CHECK(length(date)=10 AND date(date)=date),
  kind TEXT NOT NULL CHECK(kind IN ('buy','sell','sip','dividend')),
  units REAL NOT NULL CHECK(units >= 0),
  principal INTEGER NOT NULL CHECK(typeof(principal)='integer' AND principal >= 0),
  fees INTEGER NOT NULL CHECK(typeof(fees)='integer' AND fees >= 0),
  broker_dividend_cash_amount INTEGER CHECK(
    broker_dividend_cash_amount IS NULL OR
    (typeof(broker_dividend_cash_amount)='integer' AND broker_dividend_cash_amount > 0)
  ),
  CHECK((kind='dividend') = (broker_dividend_cash_amount IS NOT NULL))
) STRICT;

CREATE TABLE trade_settlements (
  trade_id TEXT PRIMARY KEY REFERENCES trades(id) ON DELETE RESTRICT,
  transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT,
  principal INTEGER NOT NULL CHECK(typeof(principal)='integer' AND principal >= 0),
  fees INTEGER NOT NULL CHECK(typeof(fees)='integer' AND fees >= 0),
  broker_dividend_cash_amount INTEGER CHECK(
    broker_dividend_cash_amount IS NULL OR
    (typeof(broker_dividend_cash_amount)='integer' AND broker_dividend_cash_amount > 0)
  ),
  CHECK(principal >= 0 AND fees >= 0)
) STRICT;

CREATE TRIGGER trade_settlement_kind
BEFORE INSERT ON trade_settlements
WHEN (SELECT kind FROM transactions WHERE id=NEW.transaction_id)
     <> 'investment'
BEGIN
  SELECT RAISE(ABORT, 'trade settlement requires an investment transaction');
END;

CREATE TRIGGER trade_settlement_fields
BEFORE INSERT ON trade_settlements
WHEN NOT EXISTS (
  SELECT 1
  FROM trades AS tr
  JOIN transactions AS tx ON tx.id=NEW.transaction_id
  WHERE tr.id=NEW.trade_id
    AND tx.investment_id=tr.investment_id
    AND NEW.principal=tr.principal
    AND NEW.fees=tr.fees
    AND (
      (tr.kind='dividend' AND NEW.broker_dividend_cash_amount=tr.broker_dividend_cash_amount)
      OR (tr.kind<>'dividend' AND NEW.broker_dividend_cash_amount IS NULL)
    )
    AND (
      (tr.kind IN ('buy','sip') AND tx.amount=-(tr.principal+tr.fees))
      OR (tr.kind='sell' AND tx.amount=tr.principal-tr.fees)
      OR (tr.kind='dividend'
          AND tx.kind='investment'
          AND tx.amount=tr.broker_dividend_cash_amount
          AND tx.amount > 0)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'trade settlement does not match trade or transaction');
END;

CREATE TRIGGER trade_settlement_delete
BEFORE DELETE ON trade_settlements
BEGIN
  SELECT RAISE(ABORT, 'trade settlement links cannot be deleted');
END;

CREATE TRIGGER trade_settlement_update
BEFORE UPDATE ON trade_settlements
WHEN NOT EXISTS (
  SELECT 1
  FROM trades AS tr
  JOIN transactions AS tx ON tx.id=NEW.transaction_id
  WHERE tr.id=NEW.trade_id
    AND tx.kind='investment'
    AND tx.investment_id=tr.investment_id
    AND NEW.principal=tr.principal
    AND NEW.fees=tr.fees
    AND (
      (tr.kind='dividend' AND NEW.broker_dividend_cash_amount=tr.broker_dividend_cash_amount)
      OR (tr.kind<>'dividend' AND NEW.broker_dividend_cash_amount IS NULL)
    )
    AND (
      (tr.kind IN ('buy','sip') AND tx.amount=-(tr.principal+tr.fees))
      OR (tr.kind='sell' AND tx.amount=tr.principal-tr.fees)
      OR (tr.kind='dividend'
          AND tx.amount=tr.broker_dividend_cash_amount
          AND tx.amount > 0)
    )
)
BEGIN
  SELECT RAISE(ABORT, 'trade settlement update does not match trade or transaction');
END;

CREATE TRIGGER trade_update_with_settlement
BEFORE UPDATE OF investment_id,kind,principal,fees,broker_dividend_cash_amount ON trades
WHEN EXISTS (SELECT 1 FROM trade_settlements WHERE trade_id=OLD.id)
 AND NOT EXISTS (
   SELECT 1
   FROM trade_settlements AS ts
   JOIN transactions AS tx ON tx.id=ts.transaction_id
   WHERE ts.trade_id=OLD.id
     AND tx.investment_id=NEW.investment_id
     AND ts.principal=NEW.principal
     AND ts.fees=NEW.fees
     AND (
       (NEW.kind='dividend'
        AND ts.broker_dividend_cash_amount=NEW.broker_dividend_cash_amount)
       OR (NEW.kind<>'dividend'
           AND NEW.broker_dividend_cash_amount IS NULL
           AND ts.broker_dividend_cash_amount IS NULL)
     )
     AND (
       (NEW.kind IN ('buy','sip') AND tx.amount=-(NEW.principal+NEW.fees))
       OR (NEW.kind='sell' AND tx.amount=NEW.principal-NEW.fees)
       OR (NEW.kind='dividend'
           AND tx.kind='investment'
           AND tx.amount=NEW.broker_dividend_cash_amount
           AND tx.amount > 0)
     )
 )
BEGIN
  SELECT RAISE(ABORT, 'trade update would invalidate settlement');
END;

CREATE TABLE loan_payments (
  id TEXT PRIMARY KEY NOT NULL,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE RESTRICT,
  payment_date TEXT NOT NULL CHECK(length(payment_date)=10 AND date(payment_date)=payment_date),
  principal_component INTEGER NOT NULL CHECK(typeof(principal_component)='integer' AND principal_component >= 0),
  interest_component INTEGER NOT NULL CHECK(typeof(interest_component)='integer' AND interest_component >= 0),
  outstanding_after INTEGER CHECK(outstanding_after IS NULL OR
    (typeof(outstanding_after)='integer' AND outstanding_after >= 0))
) STRICT;

CREATE TABLE loan_payment_settlements (
  payment_id TEXT PRIMARY KEY REFERENCES loan_payments(id) ON DELETE RESTRICT,
  transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE RESTRICT
) STRICT;

CREATE TRIGGER loan_payment_settlement_kind
BEFORE INSERT ON loan_payment_settlements
WHEN (SELECT kind FROM transactions WHERE id=NEW.transaction_id) <> 'loan_payment'
BEGIN
  SELECT RAISE(ABORT, 'loan payment settlement requires a loan_payment transaction');
END;

CREATE TRIGGER loan_payment_settlement_fields
BEFORE INSERT ON loan_payment_settlements
WHEN NOT EXISTS (
  SELECT 1
  FROM loan_payments AS lp
  JOIN transactions AS tx ON tx.id=NEW.transaction_id
  WHERE lp.id=NEW.payment_id
    AND tx.loan_id=lp.loan_id
    AND tx.amount < 0
    AND tx.amount=-(lp.principal_component+lp.interest_component)
)
BEGIN
  SELECT RAISE(ABORT, 'loan payment settlement does not match payment or transaction');
END;

CREATE TRIGGER loan_payment_settlement_delete
BEFORE DELETE ON loan_payment_settlements
BEGIN
  SELECT RAISE(ABORT, 'loan payment settlement links cannot be deleted');
END;

CREATE TRIGGER loan_payment_settlement_update
BEFORE UPDATE ON loan_payment_settlements
WHEN NOT EXISTS (
  SELECT 1
  FROM loan_payments AS lp
  JOIN transactions AS tx ON tx.id=NEW.transaction_id
  WHERE lp.id=NEW.payment_id
    AND tx.kind='loan_payment'
    AND tx.loan_id=lp.loan_id
    AND tx.amount < 0
    AND tx.amount=-(lp.principal_component+lp.interest_component)
)
BEGIN
  SELECT RAISE(ABORT, 'loan payment settlement update does not match payment or transaction');
END;

CREATE TRIGGER loan_payment_update_with_settlement
BEFORE UPDATE OF loan_id,principal_component,interest_component ON loan_payments
WHEN EXISTS (SELECT 1 FROM loan_payment_settlements WHERE payment_id=OLD.id)
 AND NOT EXISTS (
   SELECT 1
   FROM loan_payment_settlements AS lps
   JOIN transactions AS tx ON tx.id=lps.transaction_id
   WHERE lps.payment_id=OLD.id
     AND tx.loan_id=NEW.loan_id
     AND tx.amount < 0
     AND tx.amount=-(NEW.principal_component+NEW.interest_component)
 )
BEGIN
  SELECT RAISE(ABORT, 'loan payment update would invalidate settlement');
END;

CREATE TRIGGER transaction_update_trade_settlement
BEFORE UPDATE OF kind,investment_id,amount ON transactions
WHEN EXISTS (SELECT 1 FROM trade_settlements WHERE transaction_id=OLD.id)
 AND NOT EXISTS (
   SELECT 1
   FROM trade_settlements AS ts
   JOIN trades AS tr ON tr.id=ts.trade_id
   WHERE ts.transaction_id=OLD.id
     AND NEW.kind='investment'
     AND NEW.investment_id=tr.investment_id
     AND (
       (tr.kind IN ('buy','sip') AND NEW.amount=-(tr.principal+tr.fees))
       OR (tr.kind='sell' AND NEW.amount=tr.principal-tr.fees)
       OR (tr.kind='dividend'
           AND NEW.kind='investment'
           AND NEW.amount=tr.broker_dividend_cash_amount
           AND NEW.amount > 0)
     )
 )
BEGIN
  SELECT RAISE(ABORT, 'transaction update would invalidate trade settlement');
END;

CREATE TRIGGER transaction_update_loan_settlement
BEFORE UPDATE OF kind,loan_id,amount ON transactions
WHEN EXISTS (SELECT 1 FROM loan_payment_settlements WHERE transaction_id=OLD.id)
 AND NOT EXISTS (
   SELECT 1
   FROM loan_payment_settlements AS lps
   JOIN loan_payments AS lp ON lp.id=lps.payment_id
   WHERE lps.transaction_id=OLD.id
     AND NEW.kind='loan_payment'
     AND NEW.loan_id=lp.loan_id
     AND NEW.amount < 0
     AND NEW.amount=-(lp.principal_component+lp.interest_component)
 )
BEGIN
  SELECT RAISE(ABORT, 'transaction update would invalidate loan settlement');
END;

CREATE TRIGGER trade_settlement_not_loan_settlement
BEFORE INSERT ON trade_settlements
WHEN EXISTS (SELECT 1 FROM loan_payment_settlements WHERE transaction_id=NEW.transaction_id)
BEGIN
  SELECT RAISE(ABORT, 'cash transaction already has a loan settlement');
END;

CREATE TRIGGER loan_settlement_not_trade_settlement
BEFORE INSERT ON loan_payment_settlements
WHEN EXISTS (SELECT 1 FROM trade_settlements WHERE transaction_id=NEW.transaction_id)
BEGIN
  SELECT RAISE(ABORT, 'cash transaction already has a trade settlement');
END;

CREATE TABLE deleted_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  transaction_json TEXT NOT NULL CHECK(json_valid(transaction_json)),
  deleted_at TEXT NOT NULL
) STRICT;

CREATE TABLE audit (
  id TEXT PRIMARY KEY NOT NULL,
  action TEXT NOT NULL CHECK(action IN (
    'account.created','account.edited','account.archived','account.deleted',
    'category.created','category.edited','category.archived','category.deleted',
    'transaction.created','transaction.edited','transaction.deleted','transaction.restored',
    'transfer.created','transfer.reversed',
    'loan.created','loan.edited','loan.payment','loan.archived',
    'investment.created','investment.edited','trade.created','trade.corrected',
    'valuation.created','valuation.corrected','csv.imported',
    'backup.created','backup.restored','evidence.reviewed',
    'device.paired','device.revoked'
  )),
  occurred_at TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  actor_device_id TEXT,
  description TEXT NOT NULL,
  before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json))
) STRICT;
CREATE INDEX audit_occurred_at ON audit(occurred_at DESC,id);

CREATE TRIGGER audit_no_update
BEFORE UPDATE ON audit
BEGIN
  SELECT RAISE(ABORT, 'audit records are append-only');
END;

CREATE TRIGGER audit_no_delete
BEFORE DELETE ON audit
BEGIN
  SELECT RAISE(ABORT, 'audit deletion requires controlled retention/erasure procedure');
END;

CREATE TABLE imports (
  id TEXT PRIMARY KEY NOT NULL,
  filename TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  imported_count INTEGER NOT NULL CHECK(imported_count >= 0),
  skipped_count INTEGER NOT NULL CHECK(skipped_count >= 0),
  failed_count INTEGER NOT NULL CHECK(failed_count >= 0),
  skipped_reasons_json TEXT NOT NULL CHECK(json_valid(skipped_reasons_json))
) STRICT;

CREATE TABLE backups (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload))
) STRICT;
```

### Transfer integrity

`transfer_groups` gives a transfer a stable identity, creation time, optional
description/metadata, and lifecycle status. New groups start as `draft`;
`draft -> completed` is the only completion transition, and
`completed -> reversed` is the only normal terminal transition. A reversed
group cannot return to draft or completed. `transactions.transfer_group_id`
is the relationship to its legs. A completed group is valid only when a
repository transaction verifies exactly two legs, both with
`kind='transfer'`, different accounts, equal and opposite signed amounts, and
the same group ID. An incomplete group is not a completed transfer and must
not be included as one by reporting.

Ordinary foreign keys do **not** guarantee exactly two legs. The row checks
above enforce only that a transfer leg has a group. SQLite cannot express the
two-row cardinality and cross-row equality as an ordinary row `CHECK`.
The `complete_transfer_group` trigger rejects a transition to `completed`
unless exactly two rows exist, both are transfer legs, the accounts differ,
exactly one amount is strictly negative and one is strictly positive, and the
amounts sum to zero. This enforces equal and opposite nonzero legs. Repository code must insert the draft
group and both legs, validate all five rules, and complete the group in one
database transaction. A reconciliation query must report groups with a leg
count other than two, same-account legs, non-opposite amounts, or non-transfer
kinds.

Deletion policy is conservative: completed transfer legs are not independently
edited or deleted; the triggers reject both operations. A user-visible
reversal changes the group to `reversed` and retains the original legs plus an
audit record. Whether reversal also creates a new compensating transfer group
or uses explicit reversal rows is a product decision still requiring
confirmation; either option must preserve the original history. If a
compensating transfer is selected, it must be a separate transfer group with
its own two legs and an explicit link to the original group; it must never
modify or delete the original legs.

The repository must create a draft group and both legs, validate their
accounts, kinds, and opposite amounts, and transition the group to completed
within one database transaction. Reversal and any separate compensating
transfer creation must likewise be atomic and must retain the original group
and legs. SQLite triggers enforce the row mutation boundaries, while the
repository owns the multi-row operation ordering and user-facing audit entry.

### Investment and loan settlement integrity

The current domain has `InvestmentTrade` and `Transaction` but no settlement
link, and has no separate `LoanPayment` type. The tables above are future
design additions, not claims about current behavior.

For an investment event, `trades` is the canonical investment event and
`trade_settlements` is its one-to-one supporting cash allocation. The linked
transaction is the only row that changes account cash. The proposed formulas
are:

- buy: `-(principal + fees)`;
- SIP: `-(principal + fees)`;
- sell: `principal - fees`;
- dividend: `broker_dividend_cash_amount`, a positive cash amount explicitly
  reported by the broker.

The buy, SIP, and sell formulas are the proposed settlement rules, but the
current engine does not define broker settlement semantics. Dividend
settlement does not use principal or fees: it uses only the explicitly
recorded `broker_dividend_cash_amount`. No dividend calculation formula is
invented here. Whether broker-reported principal already includes any fee or
tax for other trade kinds requires product confirmation.

Every settlement requires an existing trade and transaction, investment kind,
matching `investment_id`, matching principal and fees, and a formula-valid
amount. For a dividend, both the trade and settlement store the positive
`broker_dividend_cash_amount`; it must match exactly and the linked
`investment` transaction amount must equal it. Principal and fees remain
separate fields and do not determine the dividend cash amount. The primary key
on `trade_id` and unique `transaction_id` enforce one settlement per trade and
one trade per cash transaction. Insert and update triggers validate these
relationships, including changes to the trade's kind, investment, principal,
fees, or broker-reported dividend amount and changes to the transaction's
kind, investment, or amount. Repository code repeats the checks and creates or
corrects the trade, settlement, and transaction atomically.

Behavioral validation must include: a dividend with a positive broker amount
and equal positive investment transaction is accepted; a dividend with a
different transaction amount, zero/negative broker amount, non-investment
transaction kind, or different investment is rejected; and updates changing
any of those values are rejected. A second settlement for the same trade or
cash transaction is rejected by the primary/unique keys. The equivalent
buy/SIP/sell cases continue to use only principal and fees. A representative
dividend fixture is:

```text
INSERT trades (..., kind, principal, fees, broker_dividend_cash_amount)
  VALUES (..., 'dividend', 0, 0, 1250);
INSERT transactions (..., kind, investment_id, amount)
  VALUES (..., 'investment', <same-investment-id>, 1250);
INSERT trade_settlements
  (..., principal, fees, broker_dividend_cash_amount)
  VALUES (..., 0, 0, 1250);
```

Changing `amount` to `1249`, changing `kind` to `expense`, changing
`investment_id`, or changing the broker amount to `1251` must fail on insert
or update. These are validation examples only; they do not define a dividend
calculation.

For a loan event, `loan_payments` is the canonical repayment allocation and
`loan_payment_settlements` links it to exactly one negative cash transaction.
The transaction must be `loan_payment`, reference the same loan, and equal
the negative sum of the nonnegative principal and interest components. This
reconciles the cash outflow without inventing additional accounting
components. If taxes, discounts, or other components are needed, they require
a later product decision. `outstanding_after` is a captured value when
provided; otherwise the engine-derived balance remains authoritative.

The primary key on `payment_id` and unique `transaction_id` enforce one
settlement per payment and one payment per cash transaction. Insert and update
triggers validate the loan, kind, negative amount, loan identity, and
component reconciliation. Repository code repeats the checks and creates or
corrects the payment, settlement, and transaction atomically. The triggers
cover both direct settlement updates and updates to linked payment/trade or
transaction fields.

Creation and correction of each event plus its settlement link are one
database transaction. Settlement links cannot be deleted independently:
removing a link would disable the transaction and event consistency triggers
and permit a mismatched cash amount. Correct financial history with an
explicit compensating event or a separately designed audited tombstone policy;
do not hard-delete a settlement link in this schema. A unique settlement link
prevents two cash rows from representing one event, and a cash transaction
cannot be linked to both settlement tables. The adapter must reject a duplicate
or mismatched link. No existing application behavior should be invented during
migration; rows without a determinable relationship remain unlinked and are
reported for review.

## 4. Captured evidence, review, and synchronization

Evidence provenance and replication history are different concepts and must
not share a table.

```sql
CREATE TABLE capture_events (
  id TEXT PRIMARY KEY NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN
    ('google_pay_notification','bank_sms_notification','csv_import','manual_entry')),
  device_id TEXT,
  captured_at TEXT NOT NULL,
  raw_payload TEXT,
  normalized_payload TEXT CHECK(normalized_payload IS NULL OR json_valid(normalized_payload)),
  content_hash TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK(processing_status IN ('captured','processed','failed'))
) STRICT;

CREATE TRIGGER capture_event_evidence_immutable
BEFORE UPDATE OF id,source_type,device_id,captured_at,raw_payload,normalized_payload,content_hash
ON capture_events
WHEN NEW.id IS NOT OLD.id
  OR NEW.source_type IS NOT OLD.source_type
  OR NEW.device_id IS NOT OLD.device_id
  OR NEW.captured_at IS NOT OLD.captured_at
  OR NEW.raw_payload IS NOT OLD.raw_payload
  OR NEW.normalized_payload IS NOT OLD.normalized_payload
  OR NEW.content_hash IS NOT OLD.content_hash
BEGIN
  SELECT RAISE(ABORT, 'captured evidence is immutable');
END;

CREATE TRIGGER capture_event_initial_status
BEFORE INSERT ON capture_events
WHEN NEW.processing_status <> 'captured'
BEGIN
  SELECT RAISE(ABORT, 'new capture event must start captured');
END;

CREATE TRIGGER capture_event_create_processing
AFTER INSERT ON capture_events
BEGIN
  INSERT INTO capture_processing(capture_event_id,state)
  VALUES (NEW.id,'unprocessed');
END;

CREATE TRIGGER capture_event_no_delete
BEFORE DELETE ON capture_events
BEGIN
  SELECT RAISE(ABORT, 'capture event deletion requires controlled retention/erasure procedure');
END;

CREATE TABLE transaction_sources (
  capture_event_id TEXT NOT NULL REFERENCES capture_events(id) ON DELETE RESTRICT,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  association_type TEXT NOT NULL CHECK(association_type IN ('created','matched','supporting')),
  associated_at TEXT NOT NULL,
  PRIMARY KEY(capture_event_id, transaction_id)
) STRICT;
CREATE UNIQUE INDEX one_created_transaction_per_capture
  ON transaction_sources(capture_event_id)
  WHERE association_type='created';

CREATE TABLE review_inbox (
  id TEXT PRIMARY KEY NOT NULL,
  capture_event_id TEXT NOT NULL REFERENCES capture_events(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('pending','accepted','rejected','merged')),
  proposed_json TEXT NOT NULL CHECK(json_valid(proposed_json)),
  decision_at TEXT,
  decision_json TEXT CHECK(decision_json IS NULL OR json_valid(decision_json)),
  CHECK((state='pending' AND decision_at IS NULL) OR
        (state<>'pending' AND decision_at IS NOT NULL))
) STRICT;

CREATE TABLE capture_processing (
  capture_event_id TEXT PRIMARY KEY REFERENCES capture_events(id) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('unprocessed','processing','processed','rejected','merged')),
  created_transaction_id TEXT REFERENCES transactions(id) ON DELETE RESTRICT,
  review_inbox_id TEXT REFERENCES review_inbox(id) ON DELETE RESTRICT,
  processed_at TEXT,
  CHECK(
    (state IN ('unprocessed','processing') AND processed_at IS NULL)
    OR (state IN ('processed','rejected','merged') AND processed_at IS NOT NULL)
  ),
  CHECK(state NOT IN ('processed','merged') OR
        created_transaction_id IS NOT NULL OR review_inbox_id IS NOT NULL)
) STRICT;

CREATE TRIGGER capture_processing_insert_state
BEFORE INSERT ON capture_processing
WHEN NEW.state <> 'unprocessed'
  OR NEW.created_transaction_id IS NOT NULL
  OR NEW.review_inbox_id IS NOT NULL
  OR NEW.processed_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'capture processing must start unprocessed');
END;

CREATE TRIGGER capture_processing_identity_immutable
BEFORE UPDATE OF capture_event_id ON capture_processing
WHEN NEW.capture_event_id IS NOT OLD.capture_event_id
BEGIN
  SELECT RAISE(ABORT, 'capture processing event identity is immutable');
END;

CREATE TRIGGER capture_processing_delete
BEFORE DELETE ON capture_processing
BEGIN
  SELECT RAISE(ABORT, 'capture processing records cannot be deleted');
END;

CREATE TRIGGER capture_processing_state_transition
BEFORE UPDATE OF state ON capture_processing
WHEN NOT (
  (OLD.state='unprocessed' AND NEW.state IN ('unprocessed','processing'))
  OR (OLD.state='processing' AND NEW.state IN ('processing','processed','rejected','merged'))
  OR (OLD.state IN ('processed','rejected','merged') AND NEW.state=OLD.state)
)
BEGIN
  SELECT RAISE(ABORT, 'invalid capture processing state transition');
END;

CREATE TRIGGER capture_processing_terminal_validation
BEFORE UPDATE OF state,created_transaction_id,review_inbox_id,processed_at
ON capture_processing
WHEN NEW.state='rejected'
 AND (
   NEW.created_transaction_id IS NOT NULL
   OR NEW.review_inbox_id IS NOT NULL
   OR EXISTS (SELECT 1 FROM transaction_sources
              WHERE capture_event_id=NEW.capture_event_id)
 )
BEGIN
  SELECT RAISE(ABORT, 'rejected capture cannot have evidence associations');
END;

CREATE TRIGGER capture_processing_processed_validation
BEFORE UPDATE OF state,created_transaction_id,review_inbox_id,processed_at
ON capture_processing
WHEN NEW.state='processed'
 AND (
   NEW.created_transaction_id IS NULL
   OR NEW.review_inbox_id IS NOT NULL
   OR (SELECT count(*) FROM transaction_sources
       WHERE capture_event_id=NEW.capture_event_id
         AND association_type='created') <> 1
   OR NOT EXISTS (
       SELECT 1 FROM transaction_sources
       WHERE capture_event_id=NEW.capture_event_id
         AND transaction_id=NEW.created_transaction_id
         AND association_type='created'
   )
 )
BEGIN
  SELECT RAISE(ABORT, 'processed capture requires one matching created transaction');
END;

CREATE TRIGGER capture_processing_merged_validation
BEFORE UPDATE OF state,created_transaction_id,review_inbox_id,processed_at
ON capture_processing
WHEN NEW.state='merged'
 AND (
   NEW.created_transaction_id IS NOT NULL
   OR NEW.review_inbox_id IS NULL
   OR (SELECT state FROM review_inbox WHERE id=NEW.review_inbox_id) <> 'merged'
   OR (SELECT capture_event_id FROM review_inbox WHERE id=NEW.review_inbox_id) <> NEW.capture_event_id
   OR NOT EXISTS (
       SELECT 1 FROM transaction_sources
       WHERE capture_event_id=NEW.capture_event_id
         AND association_type IN ('matched','supporting')
   )
 )
BEGIN
  SELECT RAISE(ABORT, 'merged capture requires a merged review and existing transaction evidence');
END;

CREATE TRIGGER capture_processing_terminal_immutable
BEFORE UPDATE OF created_transaction_id,review_inbox_id,processed_at ON capture_processing
WHEN OLD.state IN ('processed','rejected','merged')
 AND (NEW.created_transaction_id IS NOT OLD.created_transaction_id
      OR NEW.review_inbox_id IS NOT OLD.review_inbox_id
      OR NEW.processed_at IS NOT OLD.processed_at)
BEGIN
  SELECT RAISE(ABORT, 'terminal capture processing record is immutable');
END;

CREATE TRIGGER capture_processing_created_reference
BEFORE UPDATE OF created_transaction_id ON capture_processing
WHEN NEW.created_transaction_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM transaction_sources
   WHERE capture_event_id=NEW.capture_event_id
     AND transaction_id=NEW.created_transaction_id
     AND association_type='created'
 )
BEGIN
  SELECT RAISE(ABORT, 'created transaction must match capture evidence');
END;

CREATE TRIGGER transaction_source_insert_validation
BEFORE INSERT ON transaction_sources
WHEN NOT EXISTS (
   SELECT 1 FROM capture_processing
   WHERE capture_event_id=NEW.capture_event_id AND state='processing'
 )
 OR (NEW.association_type='created'
     AND EXISTS (
       SELECT 1 FROM capture_processing
       WHERE capture_event_id=NEW.capture_event_id
         AND created_transaction_id IS NOT NULL
         AND created_transaction_id <> NEW.transaction_id
     ))
BEGIN
  SELECT RAISE(ABORT, 'capture evidence cannot be added in its current state');
END;

CREATE TRIGGER transaction_source_update_validation
BEFORE UPDATE ON transaction_sources
WHEN NOT EXISTS (
   SELECT 1 FROM capture_processing
   WHERE capture_event_id=OLD.capture_event_id AND state='processing'
 )
 OR NOT EXISTS (
   SELECT 1 FROM capture_processing
   WHERE capture_event_id=NEW.capture_event_id AND state='processing'
 )
 OR (NEW.association_type='created'
     AND EXISTS (
       SELECT 1 FROM capture_processing
       WHERE capture_event_id=NEW.capture_event_id
         AND created_transaction_id IS NOT NULL
         AND created_transaction_id <> NEW.transaction_id
     ))
BEGIN
  SELECT RAISE(ABORT, 'capture evidence cannot be changed in its current state');
END;

CREATE TRIGGER transaction_source_delete_validation
BEFORE DELETE ON transaction_sources
WHEN NOT EXISTS (
   SELECT 1 FROM capture_processing
   WHERE capture_event_id=OLD.capture_event_id AND state='processing'
 )
BEGIN
  SELECT RAISE(ABORT, 'terminal capture evidence cannot be deleted');
END;

CREATE TRIGGER review_inbox_insert_validation
BEFORE INSERT ON review_inbox
WHEN NOT EXISTS (
   SELECT 1 FROM capture_processing
   WHERE capture_event_id=NEW.capture_event_id AND state='processing'
 )
 OR NEW.state <> 'pending'
BEGIN
  SELECT RAISE(ABORT, 'review must start pending during capture processing');
END;

CREATE TRIGGER review_inbox_event_immutable
BEFORE UPDATE OF capture_event_id ON review_inbox
WHEN NEW.capture_event_id IS NOT OLD.capture_event_id
BEGIN
  SELECT RAISE(ABORT, 'review capture event identity is immutable');
END;

CREATE TRIGGER review_inbox_update_validation
BEFORE UPDATE ON review_inbox
WHEN OLD.state IN ('accepted','rejected','merged')
 OR NOT EXISTS (
   SELECT 1 FROM capture_processing
   WHERE capture_event_id=NEW.capture_event_id AND state='processing'
 )
BEGIN
  SELECT RAISE(ABORT, 'capture review can only change during matching processing state');
END;

CREATE TRIGGER review_inbox_delete_validation
BEFORE DELETE ON review_inbox
WHEN OLD.state IN ('accepted','rejected','merged')
 OR EXISTS (
   SELECT 1 FROM capture_processing
   WHERE review_inbox_id=OLD.id AND state='merged'
 )
BEGIN
  SELECT RAISE(ABORT, 'terminal or merged capture review cannot be deleted');
END;

CREATE TRIGGER capture_event_processing_status
AFTER UPDATE OF state ON capture_processing
BEGIN
  UPDATE capture_events
  SET processing_status = CASE
    WHEN NEW.state IN ('processed','merged') THEN 'processed'
    WHEN NEW.state='rejected' THEN 'failed'
    ELSE processing_status
  END
  WHERE id=NEW.capture_event_id;
END;

CREATE TRIGGER capture_event_status_consistency
BEFORE UPDATE OF processing_status ON capture_events
WHEN NOT EXISTS (
   SELECT 1 FROM capture_processing
   WHERE capture_event_id=OLD.id
     AND (
       (state IN ('unprocessed','processing') AND NEW.processing_status='captured')
       OR (state IN ('processed','merged') AND NEW.processing_status='processed')
       OR (state='rejected' AND NEW.processing_status='failed')
     )
 )
BEGIN
  SELECT RAISE(ABORT, 'capture event status requires matching processing state');
END;

CREATE TABLE sync_events (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  device_sequence INTEGER NOT NULL CHECK(device_sequence > 0),
  operation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('create','update','delete','import')),
  base_revision TEXT,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_state TEXT NOT NULL CHECK(sync_state IN ('queued','sent','acknowledged','rejected')),
  UNIQUE(device_id, device_sequence),
  UNIQUE(device_id, operation_id)
) STRICT;
CREATE INDEX sync_events_queue ON sync_events(device_id,device_sequence,sync_state);
CREATE TRIGGER sync_event_payload_immutable
BEFORE UPDATE ON sync_events
WHEN NEW.id IS NOT OLD.id
  OR NEW.device_id IS NOT OLD.device_id
  OR NEW.device_sequence IS NOT OLD.device_sequence
  OR NEW.operation_id IS NOT OLD.operation_id
  OR NEW.entity_type IS NOT OLD.entity_type
  OR NEW.entity_id IS NOT OLD.entity_id
  OR NEW.operation IS NOT OLD.operation
  OR NEW.base_revision IS NOT OLD.base_revision
  OR NEW.payload_json IS NOT OLD.payload_json
  OR NEW.content_hash IS NOT OLD.content_hash
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'sync event payload and identity are immutable');
END;

CREATE TRIGGER sync_event_no_delete
BEFORE DELETE ON sync_events
BEGIN
  SELECT RAISE(ABORT, 'sync event deletion requires controlled retention/erasure procedure');
END;
```

A captured payment notification is stored unchanged in `capture_events` with
its stable event ID. An `AFTER INSERT` trigger creates exactly one `capture_processing` row keyed
by that event ID in the same transaction; its primary key prevents duplicate
processing rows, and repository code must not insert a second row. Its only valid state transitions are
`unprocessed -> processing`, then `processing -> processed`, `rejected`, or
`merged`; terminal states cannot return to processing. A worker claims
`unprocessed` by changing it to `processing` in a write transaction. A retry
seeing `processing`, `processed`, `rejected`, or `merged` must not create
another canonical transaction. Content hashes help find likely duplicates but
are not identities. Acceptance creates at most one canonical transaction and a
`created` association; matching or supporting evidence records an association
to an existing transaction. The partial unique index prevents one event from
creating multiple canonical transactions. Multiple distinct evidence events
may support one transaction.

Ambiguous matches create a pending `review_inbox` row and set processing state
to `processing` (or leave it `unprocessed` until claimed). A `processed`
capture has exactly one `created` association, and
`capture_processing.created_transaction_id` must equal that association's
transaction ID. A `merged` capture has no created transaction, has a merged
review decision, and has a `matched` or `supporting` association to an
existing canonical transaction. A rejected capture has no transaction
associations and cannot acquire one later. The processing, review, and
association triggers reject inconsistent combinations and terminal mutations.
Accept, reject, merge, and reassociate decisions update the review and
processing rows together. Rejection retains the capture evidence and decision;
merge retains evidence and points it at the existing transaction.

`capture_events` and `capture_processing` rows cannot be deleted during normal
operation, and the processing row's `capture_event_id` is immutable, because
these rows are the evidence and state-machine identity.
Captured payload, source, timestamp, hash, and identity fields are immutable;
only the processing status can be changed, through the processing state
machine. Terminal processing references and timestamps cannot be rewritten.
Associations require an existing processing row explicitly in `processing`;
missing rows are rejected rather than relying on SQL `NULL` comparison
behavior. Terminal review decisions (`accepted`, `rejected`, or `merged`)
cannot be deleted. A review referenced by a merged processing row is also
protected from deletion, preserving the merge decision and its evidence
history. New capture events must begin with `processing_status='captured'`;
later status changes are driven by the processing state machine.

Event creation and its initial processing row are atomic through the
`AFTER INSERT` trigger. Processing claim, canonical transaction creation,
created association, and processing completion must be one local database
transaction. The repository must insert the canonical transaction and
`created` source association before setting `created_transaction_id` and
transitioning to `processed`; the trigger then verifies the reference. For a
merge, it must create the pending review, add the existing-transaction
association, mark the review `merged`, and transition processing to `merged`
atomically. For rejection, it must record the decision and transition to
`rejected` without an association. SQLite write serialization plus the state
transition trigger prevents concurrent workers from both claiming the same
event; repository retries must re-read the state after a constraint failure.

Separately, a device mutation to a canonical entity is written to
`sync_events` in the same local transaction as the mutation. The stable event
ID is the primary key; `device_id` identifies the device, `device_sequence`
is a monotonic per-device operation sequence, and `operation_id` is the
client-generated idempotency identity for retries. Uniqueness is enforced on
`(device_id, device_sequence)` and `(device_id, operation_id)`, not on
content hash. Retrying the same operation must reuse the same event ID and
operation ID; a conflicting payload for that identity is rejected. Two
legitimate identical payloads get different operation IDs and sequences.
Acknowledgement changes only synchronization state. The allowed transitions
are `queued -> sent`, `sent -> acknowledged`, and `sent -> rejected`; an
explicit retry may move `rejected -> queued`. Repeating the current state is
allowed as an idempotent no-op. All other transitions, including moving an
acknowledged event backward, are rejected by repository logic; this lifecycle
is repository-enforced rather than encoded in SQL triggers. Sync event rows
cannot be deleted during normal operation. Capture provenance and sync history
are retained as append-only records; a controlled, audited retention or
privacy-erasure path may delete them only under a product/security policy that
is still unresolved. No permanent undeletability is claimed. Sync events do not
replace capture provenance, and a captured notification is not automatically
a replication event.

## 5. Audit coverage and deletion policy

Audit records are append-only, user-readable records of meaningful operations;
sync events are replication records; capture events are evidence. The audit
action set must cover:

| Area | Audited operations |
|---|---|
| Accounts | create, edit, archive, delete |
| Categories | create, edit, archive, delete |
| Transactions | create, edit, delete, restore |
| Transfers | create, correction/reversal, failed or incomplete cleanup where user-visible |
| Loans | create, edit, payment, archive |
| Investments | create, edit |
| Trades | create, correction |
| Valuations | create, correction |
| Imports | start/completion, counts, failures, duplicate/review decisions |
| Backups | creation, export, restore, failed restore |
| Evidence | accept, reject, merge, and manual reassociation |
| Devices | pairing, revocation, and key/credential rotation when implemented |

Each entry records action, actor/device where available, UTC time, entity
type/id, and before/after snapshots or a redacted diff. Secrets and raw
notification payloads do not belong in ordinary audit snapshots. Financial
records are not physically destroyed merely to hide history: deletion creates
an audit record and either a recoverable tombstone/snapshot or a documented
retention expiry. The current undo bin remains separate from audit and is
cleared on backup restore as it is today. Exact retention duration, hard
deletion/export erasure, and legal/privacy requirements are unresolved
product decisions. Audit rows have SQL `BEFORE UPDATE` and `BEFORE DELETE`
guards and are append-only during normal operation. Controlled, audited
retention or privacy erasure remains an unresolved product/security policy;
these guards do not claim permanent undeletability.

## 6. Runtime and compatibility decision

Node.js `node:sqlite` is not available inside the current browser Vite bundle.
The realistic options are:

| Option | Compatibility and trade-offs |
|---|---|
| SQLite WASM + OPFS | Best browser-local fit and can preserve local-first behavior. Requires a WASM build, worker/concurrency design, OPFS support testing on Windows browsers and Android WebView/browser versions, and a new backup strategy. Larger maintenance and security surface than Dexie. |
| Desktop shell + native SQLite | Strong Windows filesystem/backup integration and native SQLite performance. Requires a desktop product boundary, installer/updater, IPC/security model, and a separate Android plan; it is not a drop-in Vite change. |
| Node.js SQLite service | Suitable for a desktop companion or hosted/local service. Requires a service lifecycle, API/authentication, backup ownership, and an approved architecture. It does not provide browser-only offline persistence by itself. |
| Keep Dexie | Highest current compatibility, including Windows and Android browsers, and preserves existing local-first behavior and backup code. It avoids migration risk but does not provide SQL interoperability or native SQLite tooling. |

**Recommendation:** keep Dexie as the browser persistence layer for the
immediate roadmap and treat SQLite as a future platform-specific adapter,
unless the product explicitly chooses a desktop shell or SQLite-WASM/OPFS
target. Before implementation, the required decision is: *which runtime owns
the SQLite file on Windows and Android, and must the app remain browser-only
and offline-first?* Without that decision, minimum SQLite version, backup
implementation, encryption boundary, and migration cutover cannot be
responsibly finalized.

If SQLite-WASM/OPFS is selected, test the chosen build for `STRICT`, JSON
functions, foreign keys, transactions, and the required backup/export API.
If a native runtime is selected, pin its bundled SQLite version and verify
those same features. WAL is optional and must be benchmarked; when enabled,
the `-wal` sidecar is part of the database state. No version claim is made
here beyond the features required by the selected runtime.

## 7. Dexie mapping and migration

The seven current canonical stores map as follows: `accounts`, `categories`,
`transactions`, `investments`, `trades`, `valuations`, and `loans` map to the
same-named core tables with snake_case columns. `deletedTransactions` maps to
an undo table containing the original transaction JSON; `audit`, `imports`,
and `backups` map to reliability tables with JSON columns. The current backup
format intentionally exports only the seven canonical stores, so a migration
snapshot must separately preserve all eleven Dexie stores if undo, audit,
imports, and local backups are retained.

Migration stages:

1. Inventory the Dexie database, schema version, counts, IDs, and data scope.
2. Export and validate the existing backup format; independently validate
   dates, integer paise range, enum values, foreign keys, and transfers.
3. Create a user-downloadable backup and a separate full eleven-store
   migration snapshot. Never run against actual user data during this design
   phase.
4. Import parent rows first, then canonical children, then reliability rows,
   preserving IDs, signs, null/optional semantics, and canonical JSON.
5. Run `PRAGMA foreign_key_check`, `PRAGMA integrity_check`, row validation,
   transfer reconciliation, ID/count/hash comparisons, and unchanged-engine
   summaries for balances, cash flow, loans, investments, and net worth.
6. Cut over only after a quiesced final copy and successful reconciliation
   under the selected runtime. Keep Dexie untouched for the rollback window.
7. Roll back by retaining the failed SQLite file and diagnostics. Do not
   silently discard acknowledged writes; recover forward unless lossless parity
   is proven.

An incomplete or ambiguous transfer, settlement relationship, or evidence
match blocks automatic cutover rather than being guessed or silently repaired.

## 8. Open decisions

- Select the SQLite runtime and confirm Windows/Android offline and backup
  requirements.
- Confirm trade settlement formulas and whether fees are included in each
  broker's reported principal.
- Add a domain-level loan-payment model and decide how taxes/other components
  affect settlement totals.
- Choose transfer reversal representation and retention/hard-deletion rules.
- Define audit retention, device identity/revocation, sync conflicts,
  encryption, privacy, and tombstone policy before sync implementation.
- Decide whether reliability tables migrate into SQLite or remain in an
  archival JSON export.

## 9. SQL regression verification

The two complete SQL blocks were executed together against a fresh in-memory SQLite database with foreign keys enabled (SQLite 3.49.1; Python sqlite3 runtime). Focused scenarios passed for valid transfer completion and rejection of an incomplete transfer; valid trade and loan settlement links and rejection of mismatched links; capture-event automatic processing-row creation, duplicate prevention, event/processing deletion rejection, and status/orphan prevention; audit update/delete rejection; sync-event deletion and payload rewrite rejection; and queued-to-sent-to-acknowledged progression. `PRAGMA foreign_key_check` returned no rows and `PRAGMA integrity_check` returned `ok`. This is a schema regression check and does not select a production SQLite runtime.

## 10. Official references

- SQLite foreign keys: https://www.sqlite.org/foreignkeys.html
- SQLite data types: https://www.sqlite.org/datatype3.html
- SQLite STRICT tables: https://www.sqlite.org/stricttables.html
- SQLite transactions: https://www.sqlite.org/lang_transaction.html
- SQLite WAL: https://www.sqlite.org/wal.html
- SQLite backup API: https://www.sqlite.org/backup.html
- SQLite integrity check: https://www.sqlite.org/pragma.html#pragma_integrity_check
- Dexie stores and migrations: https://dexie.org/docs/Version/Version.stores/
  and https://dexie.org/docs/Version/Version.upgrade/
- Node.js SQLite API: https://nodejs.org/api/sqlite.html
