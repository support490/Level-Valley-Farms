# Fix `.map()` Errors + Add Accounting Settings Tab

## Context
1. The `I.map is not a function` TypeError still appears on the **Reports page** - the previous fixes only covered accounting components
2. The Settings page has no accounting-specific configuration - needs company logo, invoice settings, and check printing layout settings

---

## Part 1: Fix Remaining `.map()` Errors

### 1. `frontend/src/components/reports/FlockReport.jsx` (PRIMARY CULPRIT)
Line 22 sets `flocks` from API without fallback, then line 25 calls `flocks.map()` unconditionally on every render - immediate crash if API returns null.

| Line | Current | Fix |
|------|---------|-----|
| 22 | `setFlocks(res.data)` | `setFlocks(res.data \|\| [])` |
| 156 | `report.expenses_by_category.map(...)` | `(report.expenses_by_category \|\| []).map(...)` |
| 164 | `report.expenses_by_category.length === 0` | `(report.expenses_by_category \|\| []).length === 0` |
| 262 | `report.expenses_by_category.length > 0` | `(report.expenses_by_category \|\| []).length > 0` |
| 280 | `report.expenses_by_category.map(...)` | `(report.expenses_by_category \|\| []).map(...)` |
| 288 | `report.expenses_by_category.map(...)` | `(report.expenses_by_category \|\| []).map(...)` |
| 341 | `report.placement_history.map(...)` | `(report.placement_history \|\| []).map(...)` |

### 2. `frontend/src/pages/Reports.jsx`
| Line | Current | Fix |
|------|---------|-----|
| 40 | `setScorecard(res.data)` | `setScorecard(res.data \|\| [])` |
| 48 | `setCostTrend(res.data)` | `setCostTrend(res.data \|\| [])` |
| 52 | `setFlockComp(res.data)` | `setFlockComp(res.data \|\| [])` |
| 244 | `<BarChart data={farmPnl.periods}>` | `<BarChart data={farmPnl.periods \|\| []}>` |
| 265 | `farmPnl.periods.map(...)` | `(farmPnl.periods \|\| []).map(...)` |

### 3. `frontend/src/components/reports/IncomeStatement.jsx`
| Line | Current | Fix |
|------|---------|-----|
| 57 | `data.revenue.length > 0` | `(data.revenue \|\| []).length > 0` |
| 59 | `data.revenue.map(...)` | `(data.revenue \|\| []).map(...)` |
| 78 | `data.expenses.length > 0` | `(data.expenses \|\| []).length > 0` |
| 80 | `data.expenses.map(...)` | `(data.expenses \|\| []).map(...)` |

### 4. `frontend/src/components/reports/BalanceSheet.jsx`
| Line | Current | Fix |
|------|---------|-----|
| 29 | `section.accounts.length > 0` | `(section.accounts \|\| []).length > 0` |
| 31 | `section.accounts.map(...)` | `(section.accounts \|\| []).map(...)` |

### 5. `frontend/src/pages/FlockDetail.jsx`
| Line | Current | Fix |
|------|---------|-----|
| 335 | `report.expenses_by_category.map(...)` | `(report.expenses_by_category \|\| []).map(...)` |
| 343 | `report.expenses_by_category.length === 0` | `(report.expenses_by_category \|\| []).length === 0` |
| 360 | `report.expenses_by_category.length > 0` | `(report.expenses_by_category \|\| []).length > 0` |
| 368 | `report.expenses_by_category.map(...)` | `(report.expenses_by_category \|\| []).map(...)` |
| 374 | `report.expenses_by_category.map(...)` | `(report.expenses_by_category \|\| []).map(...)` |

---

## Part 2: Add Accounting Settings (inside Accounting page)

Settings live within the Accounting page, accessible from the QBToolbar menu.

### Backend: `backend/app/api/routes/settings.py`
Add new default settings keys and logo upload/serve endpoints:

**New DEFAULT_SETTINGS entries:**
```python
# Invoice settings
"invoice_prefix": ("INV-", "Invoice number prefix"),
"invoice_next_number": ("1001", "Next invoice number"),
"invoice_default_terms": ("Net 30", "Default payment terms"),
"invoice_footer_text": ("Thank you for your business.", "Footer text on invoices"),
"invoice_notes": ("", "Default invoice notes"),

# Check printing settings
"check_format": ("voucher", "Check format: voucher (top check + 2 stubs) or standard"),
"check_company_name": ("Level Valley Farms", "Company name on checks"),
"check_company_address": ("", "Company address on checks"),
"check_next_number": ("1001", "Next check number"),

# Company branding
"company_logo_path": ("", "Path to uploaded company logo"),
"company_phone": ("", "Company phone number"),
"company_email": ("", "Company email for documents"),
"company_tax_id": ("", "Tax ID / EIN for documents"),
```

**New endpoint — logo upload:** `POST /settings/logo` — save to `backend/uploads/` directory, store path in AppSetting

**New endpoint — serve logo:** `GET /settings/logo` — return the logo file or 404

### Frontend: New `frontend/src/components/accounting/AccountingSettings.jsx`
A new component with 3 glass-card sections:

**Section 1 — Company Logo:**
- File upload input (accept image/*) with drag-and-drop zone
- Preview of current logo
- Upload/Remove buttons

**Section 2 — Invoice Settings:**
- Invoice # Prefix, Next Invoice Number
- Default Payment Terms (dropdown)
- Footer Text, Default Notes (textareas)
- Company Phone, Email, Tax ID

**Section 3 — Check Printing:**
- Check Format dropdown (Voucher / Standard)
- Company Name on Checks, Company Address
- Next Check Number

All fields save via the existing `PUT /settings/app` key-value endpoint. Save button at bottom.

### Wire into Accounting page:

**`frontend/src/components/accounting/QBToolbar.jsx`** — add to the "Accounts" menu:
```js
{ id: 'acct-settings', label: 'Preferences' }
```

**`frontend/src/pages/Accounting.jsx`** — add:
```js
import AccountingSettings from '../components/accounting/AccountingSettings'
// ...
{view === 'acct-settings' && <AccountingSettings />}
```

### Frontend API: `frontend/src/api/settings.js`
Add:
```js
export const uploadLogo = (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/settings/logo', fd) }
export const getLogoUrl = () => '/api/settings/logo'
```

### Wire settings into print/invoice components:
- **CheckPrint.jsx**: Read `check_company_name`, `check_company_address`, logo from settings to display on printed checks
- **CreateInvoices.jsx**: Read `invoice_prefix`, `invoice_default_terms`, `invoice_footer_text` from settings as defaults

---

## Verification
1. `npx vite build` — clean build
2. Reports page — no console errors on any tab (Flock Report, Income Statement, Balance Sheet, Scorecard, Farm P&L, Cost Trends, Flock Comparison)
3. Flock Detail page — financials tab renders without error
4. Settings > Accounting tab — logo upload, invoice settings, check settings all save and persist
5. Check printing shows company name/address/logo from settings
6. New invoices use prefix and default terms from settings
