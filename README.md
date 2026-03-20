# Level Valley Farms

Poultry farm management & accounting software for egg production operations. Tracks grower farms, pullet/layer barns, flock lifecycle (chick placement through egg sale), expenses by flock ID, egg inventory, production metrics, and comprehensive financial reporting.

**Tech Stack:** Python/FastAPI backend, React/Tailwind frontend, SQLite, double-entry accounting engine.

---

## Current Status (as of 2026-03-19)

### Feature Count: 276 total features planned

| Status | Count | Description |
|--------|-------|-------------|
| DONE (backend + frontend) | ~50 | Core platform + Tiers 1 & 2 complete |
| IN PROGRESS | ~237 | Tier 3 — building now |
| **TOTAL FEATURES** | **276** | |

### Architecture

- **56 accounting components** in `frontend/src/components/accounting/`
- **18,200+ lines** of accounting UI code
- **100+ API endpoints** across 10 route files
- **30+ database models** for double-entry accounting

---

### Completed — Core Platform (Phases 1-4)

- Grower/Barn/Flock CRUD, double-entry accounting engine
- Egg production tracking, inventory, sales, contracts, logistics
- Full flock lifecycle: placement, production, mortality, splitting, closeout
- Production intelligence with breed standard curves
- Logistics: drivers, carriers, pickup scheduling, BOL PDFs, delivery confirmation
- Contract & sales intelligence with fulfillment tracking
- Feed tracking: inventory, tickets, feed conversion, medications, purchase orders
- JWT authentication, role-based access, audit trail
- Dark/light theme, CSV import/export, JSON backup

### Completed — Accounting Phase 1: AP & AR

- Bills (AP) with partial payments, due dates, payment methods
- Customer invoices (AR) with auto-generation from shipments
- AP/AR aging reports (30/60/90/120+ buckets)
- Bank account tracking, grower payment calculator

### Completed — Accounting Phase 2: Budgeting & Cost Analysis

- Annual budgets, variance reports, cost centers, depreciation
- Break-even analysis, margin analysis per contract
- Cash flow statement, financial KPIs dashboard

### Completed — Accounting Phase 3: Advanced & Compliance

- Year-end closing, retained earnings, Schedule F (farm income)
- 1099 tracking, period comparison, ratio analysis
- QuickBooks-compatible CSV export

### Completed — Tier 1: Frontend UI for Existing Backend (24 features)

**Reports (7)**
- General Ledger — date range, accounts with collapsible transaction detail, running balances
- Audit Trail — date/entity filters, color-coded action log
- AR Aging Detail — summary cards + grouped by egg buyer
- AP Aging Detail — grouped by vendor (feed mills, growers, vets)
- Customer (Egg Buyer) Balances
- Vendor Balances
- Flock P&L — per-bird and per-dozen metrics

**Flock Integration (7)**
- Flock Cost Dashboard — active flock cards with burn rate, cost breakdown bars
- EnterBills auto-suggest flocks when vendor selected
- EnterBills split expense across multiple flocks modal
- Allocate Shared Expense — by bird count / equal / custom
- Flock Closeout — 3-step flow with P&L preview
- Grower Settlement — calculation preview + execute (creates bill)
- Flock Budget — entry + variance with color-coded progress bars

**Transaction Forms (4)**
- Vendor Credits — list/create, apply-to-bill, void
- Item Receipts — feed/supply receipts, convert-to-bill
- Grower Payment Formula Editor — per-grower rates with live preview
- Feed Delivery → Bill button on feed tickets

**PDF, Logo, Email (3)**
- PrintView — reusable print-ready layout for invoices, estimates, checks
- Logo Upload — company logo in Settings
- SMTP Configuration — email settings in Settings
- Invoice/Estimate email and print buttons wired to backend

**Navigation**
- QBToolbar: Flock menu + 15+ new menu items across all sections

### Completed — Tier 2: New Transaction Types & Automation (18 features)

**Transaction Types (7) — full stack: models, endpoints, JE creation, React UI**
- Sales Receipts — cash egg sale, no invoice needed
- Refund Receipts — returned/damaged egg refunds
- Credit Card Charges — farm CC purchases with expense lines
- Credit Card Credits — CC returns
- Customer Deposits — upfront egg buyer deposits, apply-to-invoice
- Finance Charges — auto-assess late fees on overdue invoices
- Inventory Adjustments — egg inventory count adjustments

**Automation (4)**
- Recurring Transactions — templates for invoices/bills/checks, auto-generate when due
- Memorized Transactions — save any transaction for one-click reuse
- Copy Transaction — duplicate any invoice, bill, check, or estimate (API)
- Auto-numbering across all transaction types

**Batch Operations (3)**
- Batch Invoicing — 3-step wizard for weekly egg invoicing across all buyers
- Batch Void — select and void multiple transactions at once
- Batch Create Invoices — API for programmatic bulk creation

**Navigation**
- QBToolbar: Tools menu (Batch Invoicing, Batch Void, Memorized), plus all Tier 2 items under Customers/Banking/Accounts menus

---

## Tier 3: In Progress

The following feature groups are being built now. All features are farm-tailored for egg farming/poultry operations.

| Feature Group | # Features | Status |
|--------------|-----------|--------|
| Customer Statements | 5 | Building |
| Additional Reports (~70) | 70 | Building |
| UI/UX Enhancements | 15 | Building |
| Settings Enhancements | 10 | Building |
| Fixed Assets & Depreciation | 7 | Planned |
| Inventory Management | 13 | Planned |
| Sales Tax | 9 | Planned |
| Payroll & Employees | 15 | Planned |
| Time Tracking | 6 | Planned |
| Mileage | 5 | Planned |
| User Permissions | 7 | Planned |
| Bank Feeds | 9 | Planned |
| Import/Export | 13 | Planned |
| Forms & Templates | 10 | Planned |
| Email Enhancements | 6 | Planned |
| Reconciliation | 7 | Planned |
| Multi-Currency | 3 | Planned |
| Class & Location | 6 | Planned |

---

## Key Design Decisions

1. **Flock ID format** — `[Color][Type][GrowerInitials][MMDDYY][-suffix]` auto-generated from bird color, flock type, grower contact name initials, and hatch date.

2. **Pullet → Layer split** — Pullet flocks split into layer barns. Each split creates or merges into a layer flock with weighted average cost-per-bird.

3. **Cost-per-bird inheritance** — Pullet expenses / surviving birds = inherited cost. FlockSource table tracks full lineage.

4. **Double-entry accounting** — Every transaction creates balanced debit/credit journal entries. All 14 transaction types generate proper JEs.

5. **Flock closeout workflow** — User enters sale revenue, disposal cost, remaining feed value. System shows accumulated cost summary and calculates net P&L.

6. **Glass UI theme** — Dark background with translucent, blurred cards and blue glow accents. Light mode via toggle. QuickBooks 2017-inspired toolbar navigation.

7. **SQLite for simplicity** — Single-file database, no server setup. Upgradeable to PostgreSQL by changing one config line.

8. **Farm-first terminology** — Customer = egg buyer, Vendor = feed mill/grower/vet/supplier. Flock selector on every transaction. Cost metrics show per-bird and per-dozen.
