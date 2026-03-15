# Level Valley Farms - Accounting Software Implementation Plan

## Project Overview
Full-featured SAGE 50-level double-entry accounting system for Level Valley Farms' chicken operations. Tracks grower farms, pullet/layer barns, flock lifecycle (chick placement through egg sale), expenses by flock ID, egg inventory, production metrics, and comprehensive financial reporting.

**Tech Stack:** Python/FastAPI backend, React/Tailwind frontend, SQLite (upgradeable to PostgreSQL), double-entry accounting engine.

---

## PHASE 1: Core Data Management (Growers, Barns, Flocks) — COMPLETE
*Foundation layer — CRUD operations for all farm entities*

### Backend
- [x] **Grower CRUD API** (`/api/growers`) — create, read, update, soft-delete grower farms with name, location, contact info
- [x] **Barn CRUD API** (`/api/barns`) — create, read, update, soft-delete barns; set barn type (pullet/layer), bird capacity; link to grower
- [x] **Flock CRUD API** (`/api/flocks`) — create flocks with auto-generated flock ID, breed, hatch date, arrival date, initial bird count
- [x] **Flock Placement API** (`/api/flocks/{id}/place`) — place a flock in a barn, updating barn bird counts
- [x] **Bird Transfer API** (`/api/flocks/{id}/transfer`) — transfer birds within same barn type; update counts, create placement records
- [x] **Flock Split API** (`/api/flocks/{id}/split`) — split birds from pullet to layer barn with cost-per-bird inheritance
- [x] **Pullet Sale API** (`/api/flocks/{id}/sell-pullets`) — sell pullets with price-per-bird revenue tracking
- [x] **Outside Purchase API** (`/api/flocks/purchase-outside`) — buy pullets directly into layer barn
- [x] **Flock Closeout API** (`/api/flocks/{id}/closeout`) — initiate closeout with remaining inventory tracking
- [x] **Mortality/Cull API** (`/api/flocks/mortality`) — record deaths & culls with cause; auto-decrement bird counts
- [x] Pydantic schemas for all request/response models
- [x] Service layer with business logic validation (capacity checks, transfer rules, split/merge logic)
- [x] Seed data script for demo data and default chart of accounts
- [x] FlockSource model for tracking pullet-to-layer merge lineage

### Frontend
- [x] **Farm Management page** — combined growers + barns with expandable cards showing barns inline
- [x] **Flocks page** — list with type/status badges, cost-per-bird column, type and status filters
- [x] **Flock Detail page** (`/flocks/:id`) — 6-tab view: Overview, Production, Mortality, Financials, Lineage, Placements
- [x] **Split wizard** — select pullet flock → destination layer barn → bird count → auto-generates layer flock ID
- [x] **Sell Pullets modal** — bird count, price per bird, buyer, total calculation
- [x] **Buy Outside Pullets modal** — direct to layer barn with cost-per-bird
- [x] **Closeout modal** — remaining skids/cases, closeout date
- [x] **Transfer modal** — source barn → destination barn (same type only)
- [x] **Mortality entry form** — date, flock, deaths, culls, cause
- [x] All entity selectors use `SearchSelect` component (react-select with glass theme)

---

## PHASE 2: Double-Entry Accounting Engine — COMPLETE
*SAGE 50-level financial system with chart of accounts and journal entries*

### Backend
- [x] **Chart of Accounts API** (`/api/accounts`) — full hierarchical chart of accounts
- [x] **Default accounts seeder** — standard poultry farm accounts (Assets, Liabilities, Equity, Revenue, Expenses)
- [x] **Journal Entry API** (`/api/journal-entries`) — create balanced journal entries, assign to flock ID
- [x] **Journal posting** — post/unpost entries, update account balances
- [x] **Expense Quick-Entry API** (`/api/expenses`) — simplified expense entry that auto-creates journal entry
- [x] **Trial Balance API** — generate trial balance at any date
- [x] **Account Ledger API** — running balances, period summaries
- [x] **Recurring Entry API** (`/api/accounting/recurring`) — templates with frequency, auto-generation
- [x] **Fiscal Period API** (`/api/accounting/fiscal-periods`) — monthly periods, close/reopen, auto-generate
- [x] Transaction validation: debits = credits on every entry

### Frontend
- [x] **Chart of Accounts page** — tree view of all accounts with balances, add/edit accounts
- [x] **Journal Entry page** — list with filters, entry form with dynamic debit/credit lines
- [x] **Quick Expense Entry** — simplified form: pick category, pick flock, enter amount
- [x] **Account Ledger view** — click any account to see all transactions
- [x] **Recurring Entries tab** — create/manage recurring templates, generate due entries
- [x] **Fiscal Periods tab** — generate monthly periods, close/reopen with validation

---

## PHASE 3: Egg Production & Inventory — COMPLETE
*Production tracking, production percentage graphing, egg inventory*

### Backend
- [x] **Production Entry API** (`/api/production`) — entry with bird/egg counts, auto-calculate production %
- [x] **Bulk Production API** (`/api/production/bulk`) — record multiple flocks at once
- [x] **Production History API** — query by flock, date range; return time series
- [x] **Production Alerts API** (`/api/production/alerts`) — detect drops, low production, below breed standard, mortality spikes
- [x] **Breed Curves API** (`/api/production/breed-curves`) — Lohmann Brown, Hy-Line W-36, Lohmann LSL-Classic
- [x] **Egg Inventory API** (`/api/egg-inventory`) — track eggs by flock ID, grade; skids in/out/on-hand
- [x] **Inventory by Flock API** — grouped by flock with barn location
- [x] **Inventory Aging API** — flag eggs sitting >X days
- [x] **Inventory Value API** — calculate value at contract prices
- [x] **Inventory Alerts API** — low stock and aging warnings
- [x] **Egg Sale API** (`/api/egg-sales`) — record sales, auto-create revenue journal entry
- [x] **Egg Grading** — configurable grades (Grade A Large/Medium/Small, Grade B, Cracked, Reject)

### Frontend
- [x] **Production page** — single entry + bulk entry form for all active layer flocks
- [x] **Production chart** — multi-flock overlay, breed standard curve toggle, 80% target line
- [x] **Production alerts panel** — production drops, low production, breed standard, mortality spikes
- [x] **Egg Inventory page** — tabs: By Grade, By Flock, Aging, Receiving Log, Sales, Contracts, Grades
- [x] **Inventory value card** — estimated value at contract prices
- [x] **Inventory alerts** — low stock and aging warnings

---

## PHASE 4: Reporting & Financial Statements — COMPLETE
*Comprehensive reports: flock P&L, financial statements, production analytics*

### Backend
- [x] **Flock Report API** — complete lifecycle report with expenses, revenue, P&L, mortality, production, placements, lineage
- [x] **Income Statement API** — revenue minus expenses with category breakdowns
- [x] **Balance Sheet API** — assets, liabilities, equity
- [x] **Trial Balance API** — all accounts with debit/credit balances
- [x] Date range filtering on all reports

### Frontend
- [x] **Flock Report page** — comprehensive single-flock view with expense table, pie chart, revenue, production chart, placements
- [x] **Financial Statements page** — Income Statement, Balance Sheet, Trial Balance
- [x] **Report filters** — date range pickers, flock selector

---

## PHASE 5: Polish, Settings & Advanced Features — PARTIALLY COMPLETE

### Backend
- [ ] **User authentication** — login/logout, JWT tokens, role-based access
- [x] **Audit log** — track who changed what and when
- [x] **Data backup/restore API** — export full database as JSON
- [x] **Dashboard aggregation API** — summary stats, alerts, recent activity
- [x] **Fiscal period management** — period close, year-end closing entries
- [x] **Recurring expenses** — set up recurring journal entries with auto-generation
- [x] **Search API** — global search across growers, barns, flocks, transactions
- [ ] Input validation hardening, error handling, edge cases

### Frontend
- [ ] **Settings page**: Manage users & roles, configure expense categories, production targets per breed
- [x] **Settings page**: General settings, database stats, audit log, export
- [x] **Dashboard**: Live stat cards, production overview, recent activity, alerts
- [x] **Global search bar** — Ctrl+K search across all entities
- [ ] **Notification system** — in-app alerts for anomalies
- [ ] **Dark UI polish** — animations, transitions, loading states, empty states
- [ ] **Responsive design** — tablet-friendly for barn-side data entry
- [ ] **Keyboard shortcuts** — quick navigation
- [x] Error handling and user feedback (toasts, confirmations)

---

## Key Design Decisions

1. **Flock ID format** — `[Color][Type][GrowerInitials][MMDDYY][-suffix]` auto-generated from bird color (B/W), flock type (P/L), grower initials, and hatch date. Suffix added for duplicates.

2. **Pullet → Layer split** — Pullet flocks split into layer barns over multiple days. Each split creates or merges into a layer flock with weighted average cost-per-bird. FlockSource table tracks lineage.

3. **Cost-per-bird inheritance** — Pullet expenses / surviving birds = inherited cost. Layer flocks show this as a line item. Multiple sources merge with weighted average.

4. **Double-entry accounting** — Every financial transaction creates balanced debit/credit journal entries. Quick-entry for daily use, full journal for power users.

5. **Flock closeout workflow** — When sold, user enters remaining egg inventory. System tracks until last skid sold, then marks flock as fully closed.

6. **Glass UI theme** — Dark background with translucent, blurred cards and subtle blue glow accents.

7. **SQLite for simplicity** — Single-file database, upgradeable to PostgreSQL.
