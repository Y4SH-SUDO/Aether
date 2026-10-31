# Aether financial domain model

## Purpose

Aether stores canonical personal-finance records locally and keeps financial calculations independent from the storage engine. Amounts are represented as integer paise (`Money`); dates are ISO calendar dates (`ISODate`, `YYYY-MM-DD`). The domain does not depend on React, Dexie, IndexedDB, or browser APIs.

## Entities

### Accounts and categories

- **Account** is a money location such as a bank account, cash wallet, credit card, or brokerage account. `openingBalance` is the balance at `openingDate`.
- **Category** is a transaction classification. Built-in categories have `isCustom: false`; user-created categories have `isCustom: true`.

### Transactions

- **Transaction** is the canonical cash-flow record. A positive `amount` is money in and a negative amount is money out.
- `kind` distinguishes income, expense, transfer, investment, and loan-payment records.
- Every transaction belongs to an account and may reference a category, loan, investment, import hash, or transfer pair.
- A transfer is represented by two transactions with the same `transferPairId` and equal opposite amounts. The pair belongs to different accounts.
- `quality` records whether a value is confirmed, manually entered, or estimated.

### Investments

- **Investment** identifies an owned asset or instrument.
- **InvestmentTrade** records buys, sells, SIPs, and dividends, including units, amount, and fees.
- **Valuation** records a dated unit price and its quality. Investment summaries derive holdings and values from trades and the latest applicable valuation.

### Loans

- **Loan** records principal, lender, rate, start date, tenure, EMI, and optional product and known-outstanding information.
- Loan schedules, interest, payoff projections, and loan-payment summaries are derived by the finance engine; they are not duplicated as stored monthly rows.

### Reliability records

- **DeletedTransaction** retains a deleted transaction for undo/restore without changing its original identity.
- **AuditEntry** records meaningful user-facing changes and optional before/after transaction snapshots.
- **ImportHistory** records each CSV import and its imported, skipped, and failed counts.
- **LocalBackup** stores a bounded, timestamped JSON snapshot used for local recovery.

Backup JSON versions 1 and 2 contain the seven canonical financial tables listed by the backup format. Deleted transaction recovery records are intentionally not exported; restoring a backup atomically clears the recovery bin so undo cannot resurrect records from the replaced dataset.

## Relationships and invariants

1. Transaction `accountId`, `loanId`, `investmentId`, and category references must resolve when present.
2. Transfer pairs must balance to zero and must use distinct accounts.
3. Import hashes identify imported rows for duplicate detection; duplicate detection never silently removes an existing canonical record.
4. Money values are integer paise throughout the domain and calculation engine.
5. Backup validation completes before existing data is replaced.
6. Demo and My Data are separate repository instances and separate IndexedDB databases. Demo reset can only affect the demo repository.

## Repository boundary

Features depend on `FinancialRepository`, which exposes domain operations and returns domain entities. They do not know about tables, Dexie transactions, IndexedDB names, or backup implementation details.

`DexieFinancialRepository` is the current adapter. It translates repository operations into the existing `AetherDB` schema and preserves atomic writes for account creation, transaction creation/deletion/restore, CSV import, and backup restore. A future sync or server adapter can implement the same interface without changing React features or finance-engine functions.

The database schema remains versioned in `src/db/database.ts`. The `src/db/types.ts` module is a compatibility re-export; canonical domain types live in `src/domain/types.ts`.
