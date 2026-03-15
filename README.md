# Level Valley Farms

Poultry farm management & accounting software for egg production operations. Tracks grower farms, pullet/layer barns, flock lifecycle (chick placement through egg sale), expenses by flock ID, egg inventory, production metrics, and comprehensive financial reporting.

**Tech Stack:** Python/FastAPI backend, React/Tailwind frontend, SQLite, double-entry accounting engine.

---

## Current Status (as of 2026-03-15)

### Completed

**Core Platform (IMPLEMENTATION_PLAN Phases 1-4)** — All done
- Grower, Barn, Flock CRUD with full service layer
- Double-entry accounting engine (chart of accounts, journal entries, quick expense, trial balance, account ledgers)
- Egg production tracking with charting
- Egg inventory (skids in/out/on-hand by flock and grade)
- Egg sales with auto-generated journal entries
- Contracts with flock assignments
- Logistics (pickup jobs, shipments with BOL)
- Reports (flock P&L, income statement, balance sheet)
- Dashboard with KPIs, alerts, recent activity, global search
- Settings page with audit log, app config, DB stats, export

**Flock Splitting & Cost Tracking (Custom)** — Done
- Flock ID format: `[Color][Type][GrowerInitials][MMDDYY][-suffix]` (e.g., `BPjd032625`)
- Flock types: Pullet and Layer with `bird_color` (Brown/White)
- Pullet-to-layer splitting over multiple days with cost-per-bird inheritance
- Layer barn merging from multiple pullet sources with weighted average cost
- Outside pullet purchases direct to layer barn with manual cost-per-bird
- Pullet sales with price-per-bird revenue tracking
- FlockSource junction table tracking merge lineage
- Flock closeout workflow (CLOSING status, remaining skids/cases tracking)

**README Phase 1: Farm Management Merge** — Done
- Growers & Barns merged into single "Farm Management" page
- Grower cards expand to show barns inline with current flock info
- Create Grower modal with nested barn array
- Standalone /barns route removed; redirects to /growers

**README Phase 2: Flock Lifecycle Overhaul** — Done
- Full flock detail page at `/flocks/:id` with 6 tabs
- Tabs: Overview, Production, Mortality, Financials, Lineage, Placements
- Age tracking (weeks old from hatch, weeks in lay)
- Lineage tab showing parent flock and source pullet flocks with cost breakdown
- Closeout banner and status tracking
- Flock numbers in list are clickable links to detail page

**README Phase 3: Production Intelligence** — Done
- Bulk production entry form (all active layer flocks at once)
- Breed standard curve overlay on production chart (Lohmann Brown, Hy-Line W-36, Lohmann LSL-Classic)
- Automated production alerts (>5% drop, low production, below breed standard, mortality spikes)
- Toggle to show/hide breed curve on chart

**README Phase 4: Inventory & Warehouse Enhancement** — Done
- Inventory by flock tab (grouped by flock with barn location and grade breakdown)
- Inventory aging tab (flags eggs >7 days, Critical/Aging/Fresh badges)
- Inventory value calculation at contract prices
- Inventory alerts (low stock <5 skids, aging >10 days)

**IMPL Phase 5 Partial: Recurring Expenses & Fiscal Periods** — Done
- RecurringEntry model (weekly/biweekly/monthly/quarterly/annually)
- Create/manage recurring expense templates with auto-generation
- "Generate Due Entries" button processes all overdue recurring entries
- FiscalPeriod model with auto-generation of 12 monthly periods
- Close/reopen periods (validates no unposted entries before closing)
- New Accounting tabs: Recurring, Fiscal Periods

---

### Remaining Work

#### README Enhancement Phases

**Phase 5: Logistics & Delivery Enhancement** — Not started
- Driver management (driver profiles, phone, truck info)
- Route optimization (group pickups by geographic proximity)
- Pickup scheduling calendar view (weekly/monthly)
- BOL print template (PDF generation with farm logo, line items, signatures)
- Shipment tracking with delivery confirmation and proof-of-delivery
- Return/rejection handling (eggs returned from buyer, re-enter inventory)
- Carrier rate tracking and freight cost per shipment

**Phase 6: Contract & Sales Intelligence** — Not started
- Contract dashboard with fulfillment progress bars (shipped vs committed)
- Contract P&L (revenue vs costs per contract)
- Price history tracking per buyer
- Contract renewal alerts (30/60/90 days before expiry)
- Spot sale tracking (non-contract sales)
- Buyer management page
- Volume commitment tracking

**Phase 7: Reporting & Analytics Engine** — Not started
- Dashboard redesign with customizable widgets
- Grower performance scorecard
- Farm-wide P&L by month/quarter/year
- Cost per dozen trend analysis
- Flock comparison report (rank by profitability)
- PDF/CSV export for all reports
- Scheduled report generation

**Phase 8: Feed & Input Tracking** — Not started
- Feed inventory management (tons on hand, deliveries, usage)
- Feed ticket entry (delivery tickets from feed mill)
- Auto-calculate feed conversion (actual feed vs eggs produced)
- Feed cost per ton tracking
- Medication/vaccine inventory and administration tracking
- Supply vendor management
- Purchase order creation

**Phase 9: User Management & Workflow** — Not started
- JWT authentication (login, logout, password reset)
- Role-based access: Owner, Manager, Driver, Grower
- Approval workflows (expenses over threshold)
- Audit trail with user attribution
- Mobile-responsive optimization
- Notification center
- Activity feed per entity

**Phase 10: Integration & Polish** — Not started
- Data import tools (CSV/Excel upload)
- Backup/restore with scheduled auto-backup
- Dark/light theme toggle
- Loading states, empty states, animations
- Keyboard shortcuts
- Performance optimization (pagination, lazy loading)
- Onboarding wizard

#### Accounting Expansion Phases

**Accounting Phase 1: AP & AR** — Not started
- Vendor management with payment terms
- Bills/invoices received with due date tracking
- Bill payment tracking (partial payments, payment methods)
- Customer invoices auto-generated from shipments
- AP/AR aging reports (30/60/90/120 day buckets)
- Grower payment calculator
- Bank account tracking and reconciliation

**Accounting Phase 2: Budgeting & Cost Analysis** — Not started
- Budget creation (annual by category with monthly breakdown)
- Budget vs actual variance reports
- Cost center tracking (per flock, per barn, per grower)
- Depreciation schedules
- Break-even analysis
- Margin analysis per contract/flock/grade
- Cash flow statement
- Financial dashboard KPIs

**Accounting Phase 3: Advanced & Compliance** — Not started
- Multi-period closing with year-end closing entries
- Retained earnings auto-calculation
- Tax preparation support (Schedule F)
- 1099 tracking
- Financial statement comparison (period over period)
- Ratio analysis
- Audit preparation exports
- QuickBooks/Xero integration-ready exports

---

## Key Design Decisions

1. **Flock ID format** — `[Color][Type][GrowerInitials][MMDDYY][-suffix]` auto-generated from bird color, flock type, grower contact name initials, and hatch date. Suffix added when duplicates exist.

2. **Pullet → Layer split** — Pullet flocks split into layer barns over multiple days. Each split creates or merges into a layer flock with weighted average cost-per-bird. The pullet flock ID is retired when all birds are moved or sold.

3. **Cost-per-bird inheritance** — Pullet expenses / surviving birds = inherited cost. When multiple pullet sources merge into one layer flock, costs are weighted by bird count. FlockSource table tracks full lineage.

4. **Double-entry accounting** — Every financial transaction creates balanced debit/credit journal entries. Quick-entry mode for daily use, full journal for power users.

5. **Flock closeout workflow** — When a layer flock is sold, user enters remaining egg inventory (skids/cases). System tracks until last skid is sold, then notifies for final report.

6. **Glass UI theme** — Dark background with translucent, blurred cards and subtle blue glow accents. All dropdowns use react-select with custom dark glass styling.

7. **SQLite for simplicity** — Single-file database, no server setup. Upgradeable to PostgreSQL by changing one config line.
