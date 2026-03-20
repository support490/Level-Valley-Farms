from fastapi import APIRouter, Depends, Query, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import List, Optional
import json
import csv
from io import StringIO, BytesIO
from datetime import datetime, timezone

from app.db.database import get_db
from app.models.settings import AuditLog, AppSetting
from app.models.farm import Grower, Barn
from app.models.flock import Flock
from app.models.accounting import Account, JournalEntry, JournalLine
from app.models.inventory import EggInventory, EggSale
from app.models.flock import ProductionRecord, MortalityRecord

router = APIRouter(prefix="/settings", tags=["settings"])


# ── App Settings ──

DEFAULT_SETTINGS = {
    "farm_name": ("Level Valley Farms", "Business name displayed on reports"),
    "fiscal_year_start": ("01-01", "Fiscal year start (MM-DD)"),
    "production_target": ("80", "Target production percentage"),
    "default_eggs_per_case": ("360", "Default eggs per case"),
    "mortality_alert_threshold": ("5", "Mortality % threshold for alerts"),
    "capacity_alert_threshold": ("95", "Barn capacity % threshold for alerts"),
    "warehouse_address": ("", "Warehouse physical address"),
    "warehouse_latitude": ("", "Warehouse latitude"),
    "warehouse_longitude": ("", "Warehouse longitude"),

    # Company Information
    "company_legal_name": ("", "Legal business name"),
    "company_ein": ("", "EIN / Tax ID"),
    "company_address": ("", "Full business address"),
    "company_phone": ("", "Business phone number"),
    "company_type": ("", "Business type (LLC, S-Corp, Sole Prop, Partnership)"),

    # Numbering Sequences
    "invoice_prefix": ("INV-", "Invoice number prefix"),
    "invoice_next_number": ("1001", "Next invoice number"),
    "bill_prefix": ("BILL-", "Bill number prefix"),
    "bill_next_number": ("1001", "Next bill number"),
    "check_prefix": ("CHK-", "Check number prefix"),
    "check_next_number": ("1001", "Next check number"),
    "journal_prefix": ("JE-", "Journal entry prefix"),
    "po_prefix": ("PO-", "Purchase order prefix"),
    "estimate_prefix": ("EST-", "Estimate number prefix"),
    "estimate_next_number": ("1001", "Next estimate number"),

    # Payment Terms
    "payment_terms": ('["Due on Receipt","Net 15","Net 30","Net 45","Net 60"]', "Available payment terms (JSON array)"),

    # Default Accounts
    "default_ar_account": ("1020", "Default Accounts Receivable account number"),
    "default_ap_account": ("2010", "Default Accounts Payable account number"),
    "default_undeposited_funds_account": ("1015", "Default Undeposited Funds account number"),
    "default_revenue_account": ("4010", "Default revenue account number"),
    "default_expense_account": ("", "Default expense GL account number"),

    # Accounting Preferences
    "accounting_basis": ("Accrual", "Accounting basis (Accrual or Cash)"),
    "close_books_date": ("", "Date through which books are closed"),
    "require_approval": ("false", "Require invoice approval before sending"),

    # Expense Categories
    "expense_categories": ('["Feed","Grower Payment","Flock Cost","Veterinary","Service","Chick Purchase","Transport","Utilities","Other"]', "Expense categories (JSON array)"),

    # Document Settings
    "invoice_footer_message": ("", "Custom text at bottom of invoices"),
    "invoice_payment_instructions": ("", "Payment instructions text for invoices"),
    "default_invoice_terms": ("Net 30", "Default payment terms for new invoices"),
    "default_bill_terms": ("Net 30", "Default payment terms for new bills"),
}


@router.get("/app")
async def get_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppSetting).order_by(AppSetting.key))
    settings = {s.key: {"value": s.value, "description": s.description} for s in result.scalars().all()}

    # Merge defaults for any missing keys
    for key, (default_val, desc) in DEFAULT_SETTINGS.items():
        if key not in settings:
            settings[key] = {"value": default_val, "description": desc}

    return settings


@router.put("/app")
async def update_settings(data: dict, db: AsyncSession = Depends(get_db)):
    for key, value in data.items():
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        setting = result.scalar_one_or_none()
        desc = DEFAULT_SETTINGS.get(key, (None, ""))[1]

        if setting:
            setting.value = str(value)
        else:
            db.add(AppSetting(key=key, value=str(value), description=desc))

    await _log_action(db, "update", "settings", None, f"Updated settings: {', '.join(data.keys())}")
    await db.commit()
    return {"message": "Settings updated"}


# ── Audit Log ──

@router.get("/audit-log")
async def get_audit_log(
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    entity_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(AuditLog).order_by(AuditLog.created_at.desc())
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    logs = result.scalars().all()

    count_result = await db.execute(select(func.count(AuditLog.id)))
    total = count_result.scalar() or 0

    return {
        "total": total,
        "logs": [
            {
                "id": l.id,
                "action": l.action,
                "entity_type": l.entity_type,
                "entity_id": l.entity_id,
                "description": l.description,
                "details": l.details,
                "user": l.user,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
    }


# ── Database Stats ──

@router.get("/db-stats")
async def database_stats(db: AsyncSession = Depends(get_db)):
    stats = {}
    for model, name in [
        (Grower, "growers"), (Barn, "barns"), (Flock, "flocks"),
        (Account, "accounts"), (JournalEntry, "journal_entries"),
        (JournalLine, "journal_lines"), (ProductionRecord, "production_records"),
        (MortalityRecord, "mortality_records"), (EggInventory, "egg_inventory"),
        (EggSale, "egg_sales"), (AuditLog, "audit_logs"),
    ]:
        result = await db.execute(select(func.count(model.id)))
        stats[name] = result.scalar() or 0
    return stats


# ── Data Export ──

@router.get("/export")
async def export_data(db: AsyncSession = Depends(get_db)):
    """Export all data as JSON for backup."""
    data = {}

    # Growers
    result = await db.execute(select(Grower))
    data["growers"] = [{c.key: getattr(g, c.key) for c in g.__table__.columns} for g in result.scalars().all()]

    # Barns
    result = await db.execute(select(Barn))
    data["barns"] = [{c.key: getattr(b, c.key) for c in b.__table__.columns} for b in result.scalars().all()]

    # Flocks
    result = await db.execute(select(Flock))
    flocks = []
    for f in result.scalars().all():
        d = {c.key: getattr(f, c.key) for c in f.__table__.columns}
        d["status"] = d["status"].value if hasattr(d["status"], "value") else d["status"]
        flocks.append(d)
    data["flocks"] = flocks

    # Accounts
    result = await db.execute(select(Account))
    accounts = []
    for a in result.scalars().all():
        d = {c.key: getattr(a, c.key) for c in a.__table__.columns}
        d["account_type"] = d["account_type"].value if hasattr(d["account_type"], "value") else d["account_type"]
        d["balance"] = float(d["balance"])
        accounts.append(d)
    data["accounts"] = accounts

    # Journal entries + lines
    result = await db.execute(select(JournalEntry))
    entries = []
    for je in result.scalars().all():
        d = {c.key: getattr(je, c.key) for c in je.__table__.columns}
        d["expense_category"] = d["expense_category"].value if hasattr(d.get("expense_category"), "value") else d.get("expense_category")
        entries.append(d)
    data["journal_entries"] = entries

    result = await db.execute(select(JournalLine))
    data["journal_lines"] = [
        {**{c.key: getattr(l, c.key) for c in l.__table__.columns}, "debit": float(l.debit), "credit": float(l.credit)}
        for l in result.scalars().all()
    ]

    return data


async def _log_action(db: AsyncSession, action: str, entity_type: str, entity_id: str, description: str, details: str = None):
    log = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        details=details,
    )
    db.add(log)


# ── CSV Import ──

@router.post("/import/csv")
async def import_csv(
    file: UploadFile = File(...),
    entity_type: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Import data from CSV. Supports: growers, flocks, production."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    content = await file.read()
    text = content.decode('utf-8')
    reader = csv.DictReader(StringIO(text))
    rows = list(reader)

    if not rows:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    imported = 0
    errors = []

    if entity_type == "growers":
        for i, row in enumerate(rows):
            try:
                name = row.get('name', '').strip()
                if not name:
                    errors.append(f"Row {i+1}: name is required")
                    continue
                grower = Grower(
                    name=name,
                    location=row.get('location', '').strip() or 'Unknown',
                    contact_name=row.get('contact_name', '').strip() or None,
                    contact_phone=row.get('contact_phone', row.get('phone', '')).strip() or None,
                    contact_email=row.get('contact_email', row.get('email', '')).strip() or None,
                    notes=row.get('notes', '').strip() or None,
                )
                db.add(grower)
                imported += 1
            except Exception as e:
                errors.append(f"Row {i+1}: {str(e)}")

    elif entity_type == "production":
        for i, row in enumerate(rows):
            try:
                flock_number = row.get('flock_number', '').strip()
                if not flock_number:
                    errors.append(f"Row {i+1}: flock_number required")
                    continue
                result = await db.execute(
                    select(Flock).where(Flock.flock_number == flock_number)
                )
                flock = result.scalar_one_or_none()
                if not flock:
                    errors.append(f"Row {i+1}: flock '{flock_number}' not found")
                    continue
                bird_count = int(row.get('bird_count', 0))
                egg_count = int(row.get('egg_count', 0))
                prod_pct = round((egg_count / bird_count * 100), 2) if bird_count > 0 else 0
                record = ProductionRecord(
                    flock_id=flock.id,
                    record_date=row.get('record_date', row.get('date', '')).strip(),
                    bird_count=bird_count,
                    egg_count=egg_count,
                    production_pct=prod_pct,
                    cracked=int(row.get('cracked', 0)),
                    floor_eggs=int(row.get('floor_eggs', 0)),
                )
                db.add(record)
                imported += 1
            except Exception as e:
                errors.append(f"Row {i+1}: {str(e)}")

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported entity type: {entity_type}. Use: growers, production")

    if imported > 0:
        await _log_action(db, "import", entity_type, None,
                          f"CSV import: {imported} {entity_type} imported from {file.filename}")
        await db.commit()

    return {
        "imported": imported,
        "errors": errors,
        "total_rows": len(rows),
    }


# ── Backup Download ──

@router.get("/backup")
async def download_backup(db: AsyncSession = Depends(get_db)):
    """Download full database as JSON backup file."""
    # Reuse existing export logic
    data = {}

    result = await db.execute(select(Grower))
    data["growers"] = [{c.key: getattr(g, c.key) for c in g.__table__.columns} for g in result.scalars().all()]

    result = await db.execute(select(Barn))
    data["barns"] = [{c.key: getattr(b, c.key) for c in b.__table__.columns} for b in result.scalars().all()]

    result = await db.execute(select(Flock))
    flocks = []
    for f in result.scalars().all():
        d = {c.key: getattr(f, c.key) for c in f.__table__.columns}
        d["status"] = d["status"].value if hasattr(d["status"], "value") else d["status"]
        flocks.append(d)
    data["flocks"] = flocks

    result = await db.execute(select(Account))
    accounts = []
    for a in result.scalars().all():
        d = {c.key: getattr(a, c.key) for c in a.__table__.columns}
        d["account_type"] = d["account_type"].value if hasattr(d["account_type"], "value") else d["account_type"]
        d["balance"] = float(d["balance"])
        accounts.append(d)
    data["accounts"] = accounts

    result = await db.execute(select(JournalEntry))
    entries = []
    for je in result.scalars().all():
        d = {c.key: getattr(je, c.key) for c in je.__table__.columns}
        d["expense_category"] = d["expense_category"].value if hasattr(d.get("expense_category"), "value") else d.get("expense_category")
        entries.append(d)
    data["journal_entries"] = entries

    # Serialize datetime objects
    def default_serializer(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return str(obj)

    json_bytes = json.dumps(data, indent=2, default=default_serializer).encode('utf-8')
    filename = f"lvf-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"

    return StreamingResponse(
        iter([json_bytes]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
