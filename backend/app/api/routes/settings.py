from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import List, Optional
import json
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
