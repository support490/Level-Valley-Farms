# Level Valley Farms

Poultry farm management & accounting software for egg production operations. Tracks grower farms, pullet/layer barns, flock lifecycle (chick placement through egg sale), expenses by flock ID, egg inventory, production metrics, and comprehensive financial reporting.

**Tech Stack:** Python/FastAPI backend, React/Tailwind frontend, SQLite, double-entry accounting engine.

---

## Current Status (as of 2026-03-16)

### Completed

**Core Platform (IMPLEMENTATION_PLAN Phases 1-4)** — Grower/Barn/Flock CRUD, double-entry accounting engine, egg production tracking, egg inventory, egg sales, contracts, logistics, reports, dashboard, settings.

**Flock Splitting & Cost Tracking** — Flock ID auto-generation, pullet-to-layer splitting with cost-per-bird inheritance, layer barn merging, outside purchases, pullet sales, FlockSource lineage, closeout workflow.

**Farm Management Merge** — Growers & Barns merged into single page with expandable cards and inline barns.

**Flock Lifecycle Overhaul** — Full flock detail page with 6 tabs (Overview, Production, Mortality, Financials, Lineage, Placements), age tracking, closeout banner.

**Production Intelligence** — Bulk production entry, breed standard curve overlay (Lohmann Brown, Hy-Line W-36, LSL-Classic), automated alerts, toggle breed curve.

**Inventory & Warehouse Enhancement** — Inventory by flock, aging tab, value calculation, inventory alerts.

**Recurring Expenses & Fiscal Periods** — RecurringEntry model, auto-generation, FiscalPeriod close/reopen, Accounting tabs.

**Logistics & Delivery Enhancement** — Driver management, carrier management, pickup scheduling calendar (week/month), BOL PDF generation (reportlab), delivery confirmation with proof-of-delivery, return/rejection handling with inventory re-entry, freight cost tracking. Six logistics tabs.

**Contract & Sales Intelligence** — Dedicated /contracts page with dashboard (fulfillment progress bars), contract P&L modal, buyer management, price history tracking, contract renewal alerts (30/60/90 days), spot sale tracking, volume commitment tracking.

**Reporting & Analytics Engine** — Reports page with 7 tabs, grower performance scorecard, farm-wide P&L (monthly/quarterly/yearly with bar charts), cost per dozen trend analysis (line charts), flock comparison report (ranked by profitability), CSV export for all reports.

**Feed & Input Tracking** — Dedicated /feed page with 6 tabs: feed inventory, feed tickets, feed conversion (lbs/dozen), medication inventory with reorder alerts, medication administration log, vendor management, purchase orders with status workflow.

**User Management & Workflow** — JWT authentication with login page, user roles (Owner/Manager/Driver/Grower), notification center with bell icon, audit trail with user attribution, activity feed per entity, mobile-responsive sidebar with hamburger menu.

**Integration & Polish** — CSV data import (growers, production), JSON backup download, dark/light theme toggle (persists to localStorage), loading spinner, CSS animations, import data tab in settings.

**Accounting Phase 1: AP & AR** — Done
- Bills (AP) with due date tracking, partial payment support, payment method (check/ACH/wire/cash/CC)
- Customer invoices (AR) with auto-generation from shipments, payment recording
- AP/AR aging reports (current/30/60/90/120+ day buckets with color-coded totals)
- Grower payment calculator (outstanding bills per grower)
- Bank account tracking (checking/savings/money market with balances)
- 5 new Accounting tabs: Bills (AP), Invoices (AR), AP/AR Aging, Bank Accounts, Grower Payments

**Accounting Phase 2: Budgeting & Cost Analysis** — Done
- Budget creation (annual by category with auto-distributed monthly amounts)
- Budget vs actual variance reports (by category by month, with year selector)
- Cost center tracking (expenses by flock and by grower)
- Depreciation schedules (straight-line, book value calculation, months elapsed)
- Break-even analysis (cost/doz vs revenue/doz, break-even dozens, profitability indicator)
- Margin analysis per contract (revenue, freight, net revenue, margin %)
- Cash flow statement (receipts vs disbursements by month with bar chart)
- Financial dashboard KPIs (revenue/expenses YTD, profit margin, cost/dozen, revenue/dozen)
- 8 new Accounting tabs: Budgets, Variance, Cost Centers, Depreciation, Break-Even, Margins, Cash Flow, KPIs

**Accounting Phase 3: Advanced & Compliance** — Done
- Year-end closing preview (revenue/expense totals, net income to retained earnings)
- Retained earnings auto-calculation (cumulative prior-year net income)
- Tax preparation support: Schedule F (farm income/expenses by category, net farm profit)
- 1099 tracking (vendors paid >= $600 threshold, payment counts)
- Financial statement comparison (period-over-period with % change for revenue, expenses, production)
- Ratio analysis (profit margin, expense ratio, current ratio, debt-to-equity, ROA)
- Audit preparation export (combined Schedule F + retained earnings + ratios + 1099 report)
- QuickBooks/Xero integration-ready CSV export (journal entries in QB-compatible format)
- 7 new Accounting tabs: Schedule F, 1099, Retained Earnings, Year-End Close, Compare Periods, Ratios, QB Export

---

## Key Design Decisions

1. **Flock ID format** — `[Color][Type][GrowerInitials][MMDDYY][-suffix]` auto-generated from bird color, flock type, grower contact name initials, and hatch date. Suffix added when duplicates exist.

2. **Pullet → Layer split** — Pullet flocks split into layer barns over multiple days. Each split creates or merges into a layer flock with weighted average cost-per-bird. The pullet flock ID is retired when all birds are moved or sold.

3. **Cost-per-bird inheritance** — Pullet expenses / surviving birds = inherited cost. When multiple pullet sources merge into one layer flock, costs are weighted by bird count. FlockSource table tracks full lineage.

4. **Double-entry accounting** — Every financial transaction creates balanced debit/credit journal entries. Quick-entry mode for daily use, full journal for power users.

5. **Flock closeout workflow** — When a layer flock is sold, user enters remaining egg inventory (skids/cases). System tracks until last skid is sold, then notifies for final report.

6. **Glass UI theme** — Dark background with translucent, blurred cards and subtle blue glow accents. Light mode available via toggle. All dropdowns use react-select with custom styling.

7. **SQLite for simplicity** — Single-file database, no server setup. Upgradeable to PostgreSQL by changing one config line.
