# Level Valley Farms - Accounting Software Implementation Plan

## Project Overview
Full-featured SAGE 50-level double-entry accounting system for Level Valley Farms' chicken operations. Tracks grower farms, pullet/layer barns, flock lifecycle (chick placement through egg sale), expenses by flock ID, egg inventory, production metrics, and comprehensive financial reporting.

**Tech Stack:** Python/FastAPI backend, React/Tailwind frontend, SQLite (upgradeable to PostgreSQL), double-entry accounting engine.

---

## PHASE 1: Core Data Management (Growers, Barns, Flocks)
*Foundation layer — CRUD operations for all farm entities*

### Backend
- [ ] **Grower CRUD API** (`/api/growers`) — create, read, update, soft-delete grower farms with name, location, contact info
- [ ] **Barn CRUD API** (`/api/barns`) — create, read, update, soft-delete barns; set barn type (pullet/layer), bird capacity; link to grower
- [ ] **Flock CRUD API** (`/api/flocks`) — create flocks with auto-generated flock ID number, breed, hatch date, arrival date, initial bird count
- [ ] **Flock Placement API** (`/api/flocks/{id}/place`) — place a flock in a barn, updating barn bird counts
- [ ] **Bird Transfer API** (`/api/flocks/{id}/transfer`) — transfer birds from one barn to another (pullet → layer or barn → barn); update counts, create placement records, carry over flock ID
- [ ] **Mortality/Cull API** (`/api/flocks/{id}/mortality`) — record daily deaths & culls with cause; auto-decrement bird counts
- [ ] Pydantic schemas for all request/response models
- [ ] Service layer with business logic validation (capacity checks, transfer rules)
- [ ] Seed data script for default chart of accounts

### Frontend
- [ ] **Growers page** — list view with search, add/edit/delete modals, location display
- [ ] **Barns page** — list by grower, capacity bar visualization, add/edit/delete, filter by type (pullet/layer)
- [ ] **Flocks page** — list with status badges, flock detail view showing current barn, bird count, mortality history
- [ ] **Transfer wizard** — step-by-step flow: select flock → select source barn → select destination barn → confirm bird count → execute
- [ ] **Mortality entry form** — date, flock (SearchSelect), deaths, culls, cause
- [ ] All entity selectors use `SearchSelect` component (react-select with glass theme)

### Deliverables
- All grower/barn/flock data can be created, viewed, edited, deleted
- Birds can be transferred between barns with full audit trail
- Flock ID persists across all transfers
- Mortality tracking reduces bird counts automatically

---

## PHASE 2: Double-Entry Accounting Engine
*SAGE 50-level financial system with chart of accounts and journal entries*

### Backend
- [ ] **Chart of Accounts API** (`/api/accounts`) — full hierarchical chart of accounts (assets, liabilities, equity, revenue, expenses)
- [ ] **Default accounts seeder** — pre-populate standard poultry farm accounts:
  - Assets: Cash, Accounts Receivable, Egg Inventory, Bird Inventory
  - Liabilities: Accounts Payable, Grower Payables
  - Equity: Owner's Equity, Retained Earnings
  - Revenue: Egg Sales, Bird Sales
  - Expenses: Feed, Grower Payments, Veterinary/Service, Chick Purchases, Transport, Utilities
- [ ] **Journal Entry API** (`/api/journal-entries`) — create balanced journal entries (debits = credits validation), assign to flock ID, categorize by expense type
- [ ] **Journal posting** — post/unpost entries, update account balances
- [ ] **Expense Quick-Entry API** (`/api/expenses`) — simplified expense entry that auto-creates the journal entry behind the scenes:
  - Select expense category (feed, grower payment, flock cost, vet/service)
  - Select flock ID (SearchSelect)
  - Enter amount, date, description, reference #
  - System creates proper debit/credit journal entry
- [ ] **Trial Balance API** — generate trial balance at any date
- [ ] **Account balance queries** — running balances, period summaries
- [ ] Transaction validation: ensure debits = credits on every entry

### Frontend
- [ ] **Chart of Accounts page** — tree view of all accounts with balances, add/edit accounts
- [ ] **Journal Entry page** — list of entries with filters (date range, flock, category, posted/unposted); entry form with dynamic debit/credit lines
- [ ] **Quick Expense Entry** — simplified form: pick category, pick flock (SearchSelect), enter amount; system handles the accounting
- [ ] **Account Ledger view** — click any account to see all transactions
- [ ] Expense category breakdown per flock

### Deliverables
- Full double-entry accounting with balanced journal entries
- Every expense tied to a flock ID
- Quick-entry mode for common expenses (feed, grower payments, vet costs)
- Trial balance generation
- Account ledgers with running balances

---

## PHASE 3: Egg Production & Inventory
*Daily production tracking, production percentage graphing, egg inventory at Level Valley*

### Backend
- [ ] **Production Entry API** (`/api/production`) — daily entry: flock, date, bird count, egg count; auto-calculate production % (eggs / birds * 100)
- [ ] **Production History API** — query production data by flock, date range; return time series for graphing
- [ ] **Egg Inventory API** (`/api/egg-inventory`) — track eggs received at Level Valley by flock ID, grade; cases in/out/on-hand
- [ ] **Egg Grading** — Grade A (large/medium/small), Grade B, cracked, reject
- [ ] **Egg Sale API** (`/api/egg-sales`) — record sales with buyer, grade, cases, price; auto-create revenue journal entry; link to flock ID
- [ ] **Inventory valuation** — FIFO or weighted average costing
- [ ] Production alerts — flag flocks below target production %

### Frontend
- [ ] **Production Entry page** — daily form: select flock, enter bird count & egg count; shows calculated production %
- [ ] **Production Dashboard** — real-time production % graph per flock (Recharts line chart), with date range selector
  - Overlay multiple flocks on same chart for comparison
  - Standard curve overlay showing expected production
  - Color-coded status (green = above target, yellow = marginal, red = below target)
- [ ] **Egg Inventory page** — current inventory by grade, cases on hand, receiving log, shipping log
- [ ] **Egg Sales page** — record sales, view sale history, totals by period
- [ ] **Inventory Summary cards** — total cases on hand, broken down by grade

### Deliverables
- Daily production tracking with automatic % calculation
- Interactive production graphs that update continuously
- Complete egg inventory tracking at Level Valley
- Sales tied to flocks and auto-posted to accounting
- Production comparison across flocks

---

## PHASE 4: Reporting & Financial Statements
*Comprehensive reports: flock P&L, financial statements, production analytics*

### Backend
- [ ] **Flock Report API** (`/api/reports/flock/{id}`) — complete flock lifecycle report:
  - All expenses by category (feed, grower, vet, etc.) with totals
  - All revenue (egg sales) with totals
  - Net profit/loss for the flock
  - Mortality summary (total deaths, culls, % lost)
  - Production history summary (avg production %, peak, current)
  - Barn placement history (timeline of where the flock has been)
- [ ] **Income Statement API** — revenue minus expenses for any date range, with category breakdowns
- [ ] **Balance Sheet API** — assets, liabilities, equity at any point in time
- [ ] **Trial Balance API** — all accounts with debit/credit balances
- [ ] **Production Report API** — production trends, flock comparisons, mortality rates
- [ ] **Grower Report API** — payments to each grower, their barn utilization, flock performance at their farms
- [ ] **Export to CSV/PDF** — all reports exportable
- [ ] Date range filtering on all reports

### Frontend
- [ ] **Flock Report page** — comprehensive single-flock view: select any flock (SearchSelect) and see everything — expenses, revenue, P&L, production graph, mortality, barn history
- [ ] **Financial Statements page**:
  - Income Statement with category drill-down
  - Balance Sheet
  - Trial Balance
- [ ] **Production Analytics page** — multi-flock production comparison, trend analysis, mortality charts
- [ ] **Grower Performance page** — per-grower summary of payments, flock outcomes, barn utilization
- [ ] **Report filters** — date range pickers, flock selector, grower selector, expense category filters
- [ ] Print-friendly layouts, CSV/PDF export buttons

### Deliverables
- Pull a complete report on any flock at any time showing all costs and revenue
- Standard financial statements (Income Statement, Balance Sheet, Trial Balance)
- Production analytics with visual charts
- Grower performance tracking
- All reports exportable

---

## PHASE 5: Polish, Settings & Advanced Features
*User experience refinement, settings, data integrity, and operational tools*

### Backend
- [ ] **User authentication** — login/logout, JWT tokens, role-based access (admin, manager, data entry)
- [ ] **Audit log** — track who changed what and when
- [ ] **Data backup/restore API** — export/import full database
- [ ] **Dashboard aggregation API** — summary stats (active flocks, total birds, avg production %, inventory value, outstanding payables)
- [ ] **Fiscal period management** — period close, year-end closing entries
- [ ] **Recurring expenses** — set up recurring journal entries (e.g., monthly grower payments)
- [ ] **Search API** — global search across growers, barns, flocks, transactions
- [ ] Input validation hardening, error handling, edge cases

### Frontend
- [ ] **Settings page**:
  - Manage users & roles
  - Configure expense categories
  - Set production targets per breed
  - Fiscal year settings
  - Backup & restore
- [ ] **Dashboard enhancements**:
  - Live stat cards with real data
  - Production overview graph (all active flocks)
  - Recent transactions feed
  - Alerts panel (low production, high mortality, capacity warnings)
- [ ] **Global search bar** — search flocks, growers, barns, transactions from anywhere
- [ ] **Notification system** — alerts for anomalies (production drop, unusual mortality)
- [ ] **Dark UI polish** — animations, transitions, loading states, empty states
- [ ] **Responsive design** — tablet-friendly for barn-side data entry
- [ ] **Keyboard shortcuts** — quick navigation between sections
- [ ] Comprehensive error handling and user feedback (toasts, confirmations)

### Deliverables
- Secure multi-user system with audit trail
- Polished, production-ready UI
- Operational dashboard with real-time insights
- Data backup and restore
- Fiscal period management

---

## File Structure

```
Level Valley Farms/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/          # FastAPI route handlers
│   │   │       ├── growers.py
│   │   │       ├── barns.py
│   │   │       ├── flocks.py
│   │   │       ├── accounting.py
│   │   │       ├── production.py
│   │   │       ├── inventory.py
│   │   │       └── reports.py
│   │   ├── core/
│   │   │   └── config.py        # App settings
│   │   ├── db/
│   │   │   └── database.py      # SQLAlchemy async engine & session
│   │   ├── models/              # SQLAlchemy ORM models
│   │   │   ├── base.py          # Mixins & helpers
│   │   │   ├── farm.py          # Grower, Barn, FlockPlacement
│   │   │   ├── flock.py         # Flock, MortalityRecord, ProductionRecord
│   │   │   ├── accounting.py    # Account, JournalEntry, JournalLine
│   │   │   └── inventory.py     # EggInventory, EggSale
│   │   ├── schemas/             # Pydantic request/response schemas
│   │   ├── services/            # Business logic layer
│   │   ├── reports/             # Report generation logic
│   │   └── main.py              # FastAPI app entry point
│   ├── alembic/                 # DB migrations
│   ├── tests/
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js        # Axios HTTP client
│   │   ├── components/
│   │   │   ├── common/          # SearchSelect, modals, tables, forms
│   │   │   ├── layout/          # Sidebar, Layout shell
│   │   │   ├── dashboard/       # Stat cards, charts
│   │   │   ├── farms/           # Grower components
│   │   │   ├── barns/           # Barn components
│   │   │   ├── flocks/          # Flock components, transfer wizard
│   │   │   ├── accounting/      # Journal entries, chart of accounts
│   │   │   ├── inventory/       # Egg inventory, sales
│   │   │   └── reports/         # Report views, charts
│   │   ├── contexts/            # React context providers
│   │   ├── hooks/               # Custom React hooks
│   │   ├── pages/               # Page-level components
│   │   ├── styles/
│   │   │   └── index.css        # Tailwind + glass UI styles
│   │   ├── utils/               # Helpers, formatters
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
└── IMPLEMENTATION_PLAN.md
```

---

## Key Design Decisions

1. **Flock ID is the backbone** — every expense, production record, egg batch, and sale links back to a flock ID. This enables the "pull a report on any flock at any time" requirement.

2. **Double-entry accounting** — every financial transaction creates balanced debit/credit journal entries. No single-entry shortcuts. Account balances are always derivable from journal lines.

3. **Quick-entry + full journal** — users get a simple expense form for daily use, but behind the scenes it creates proper journal entries. Power users can also create manual journal entries directly.

4. **Transfer = close placement + open placement** — when birds move barns, the old placement is closed and a new one opened. The flock ID never changes. All historical expenses remain linked.

5. **SQLite for simplicity** — single-file database, no server setup. Can be upgraded to PostgreSQL by changing one config line when scale demands it.

6. **Glass UI theme** — dark background with translucent, blurred cards and subtle blue glow accents. All dropdowns use react-select with custom dark glass styling.
