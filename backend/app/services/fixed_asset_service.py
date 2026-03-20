from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
from datetime import date
from typing import Optional

from app.models.accounting import (
    FixedAsset, FixedAssetDepreciation,
    AssetCategory, DepreciationMethodEnum, DisposalMethod,
    JournalEntry, JournalLine, Account, AccountType,
)
from app.models.base import generate_uuid


# ── MACRS percentage tables (IRS half-year convention) ──

MACRS_TABLES = {
    "macrs_3": [33.33, 44.45, 14.81, 7.41],
    "macrs_5": [20.00, 32.00, 19.20, 11.52, 11.52, 5.76],
    "macrs_7": [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46],
    "macrs_10": [10.00, 18.00, 14.40, 11.52, 9.22, 7.37, 6.55, 6.55, 6.56, 6.55, 3.28],
    "macrs_15": [5.00, 9.50, 8.55, 7.70, 6.93, 6.23, 5.90, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 5.90, 5.91, 2.95],
}


# ── Auto-number ──

async def _next_asset_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(FixedAsset.id)))
    count = result.scalar() or 0
    return f"FA-{count + 1:05d}"


# ── Helper: asset to dict ──

def _asset_to_dict(asset: FixedAsset, include_schedule: bool = False) -> dict:
    d = {
        "id": asset.id,
        "asset_number": asset.asset_number,
        "name": asset.name,
        "description": asset.description,
        "category": asset.category.value if hasattr(asset.category, 'value') else asset.category,
        "acquisition_date": asset.acquisition_date,
        "acquisition_cost": float(asset.acquisition_cost),
        "salvage_value": float(asset.salvage_value),
        "useful_life_years": asset.useful_life_years,
        "depreciation_method": asset.depreciation_method.value if hasattr(asset.depreciation_method, 'value') else asset.depreciation_method,
        "location": asset.location,
        "flock_id": asset.flock_id,
        "serial_number": asset.serial_number,
        "vendor_name": asset.vendor_name,
        "is_disposed": asset.is_disposed,
        "disposal_date": asset.disposal_date,
        "disposal_amount": float(asset.disposal_amount) if asset.disposal_amount is not None else None,
        "disposal_method": (asset.disposal_method.value if hasattr(asset.disposal_method, 'value') else asset.disposal_method) if asset.disposal_method else None,
        "notes": asset.notes,
        "created_at": str(asset.created_at) if asset.created_at else None,
    }
    if include_schedule and hasattr(asset, 'depreciation_records'):
        d["depreciation_schedule"] = [
            {
                "id": rec.id,
                "period_date": rec.period_date,
                "depreciation_amount": float(rec.depreciation_amount),
                "accumulated_depreciation": float(rec.accumulated_depreciation),
                "book_value": float(rec.book_value),
                "journal_entry_id": rec.journal_entry_id,
                "is_posted": rec.is_posted,
            }
            for rec in asset.depreciation_records
        ]
    # Compute current totals from depreciation records
    if hasattr(asset, 'depreciation_records') and asset.depreciation_records:
        last_rec = asset.depreciation_records[-1]
        d["accumulated_depreciation"] = float(last_rec.accumulated_depreciation)
        d["book_value"] = float(last_rec.book_value)
    else:
        d["accumulated_depreciation"] = 0.0
        d["book_value"] = float(asset.acquisition_cost)
    return d


# ── CRUD ──

async def get_fixed_assets(
    db: AsyncSession,
    category: Optional[str] = None,
    is_disposed: Optional[bool] = None,
    active_only: bool = True,
) -> list:
    query = select(FixedAsset).order_by(FixedAsset.asset_number)
    if category:
        query = query.where(FixedAsset.category == category)
    if is_disposed is not None:
        query = query.where(FixedAsset.is_disposed == is_disposed)
    elif active_only:
        query = query.where(FixedAsset.is_disposed == False)
    result = await db.execute(query)
    assets = result.scalars().all()
    # Eagerly load depreciation for accumulated totals
    out = []
    for asset in assets:
        dep_result = await db.execute(
            select(FixedAssetDepreciation)
            .where(FixedAssetDepreciation.asset_id == asset.id)
            .order_by(FixedAssetDepreciation.period_date)
        )
        asset.depreciation_records = dep_result.scalars().all()
        out.append(_asset_to_dict(asset))
    return out


async def create_fixed_asset(db: AsyncSession, data: dict) -> dict:
    asset_number = data.get("asset_number")
    if not asset_number:
        asset_number = await _next_asset_number(db)

    try:
        cat = AssetCategory(data["category"])
    except ValueError:
        raise ValueError(f"Invalid category: {data['category']}")
    try:
        method = DepreciationMethodEnum(data["depreciation_method"])
    except ValueError:
        raise ValueError(f"Invalid depreciation method: {data['depreciation_method']}")

    asset = FixedAsset(
        asset_number=asset_number,
        name=data["name"],
        description=data.get("description"),
        category=cat,
        acquisition_date=data["acquisition_date"],
        acquisition_cost=Decimal(str(data["acquisition_cost"])),
        salvage_value=Decimal(str(data.get("salvage_value", 0))),
        useful_life_years=data["useful_life_years"],
        depreciation_method=method,
        location=data.get("location"),
        flock_id=data.get("flock_id"),
        serial_number=data.get("serial_number"),
        vendor_name=data.get("vendor_name"),
        notes=data.get("notes"),
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    asset.depreciation_records = []
    return _asset_to_dict(asset)


async def get_fixed_asset(db: AsyncSession, asset_id: str) -> Optional[dict]:
    asset = await db.get(FixedAsset, asset_id)
    if not asset:
        return None
    dep_result = await db.execute(
        select(FixedAssetDepreciation)
        .where(FixedAssetDepreciation.asset_id == asset.id)
        .order_by(FixedAssetDepreciation.period_date)
    )
    asset.depreciation_records = dep_result.scalars().all()
    return _asset_to_dict(asset, include_schedule=True)


async def update_fixed_asset(db: AsyncSession, asset_id: str, data: dict) -> Optional[dict]:
    asset = await db.get(FixedAsset, asset_id)
    if not asset:
        return None

    if "category" in data:
        try:
            data["category"] = AssetCategory(data["category"])
        except ValueError:
            raise ValueError(f"Invalid category: {data['category']}")
    if "depreciation_method" in data:
        try:
            data["depreciation_method"] = DepreciationMethodEnum(data["depreciation_method"])
        except ValueError:
            raise ValueError(f"Invalid depreciation method: {data['depreciation_method']}")

    for field, value in data.items():
        if field in ("acquisition_cost", "salvage_value"):
            value = Decimal(str(value))
        setattr(asset, field, value)

    await db.commit()
    await db.refresh(asset)
    dep_result = await db.execute(
        select(FixedAssetDepreciation)
        .where(FixedAssetDepreciation.asset_id == asset.id)
        .order_by(FixedAssetDepreciation.period_date)
    )
    asset.depreciation_records = dep_result.scalars().all()
    return _asset_to_dict(asset)


# ── Depreciation Calculation ──

def _calc_monthly_depreciation(
    method: str,
    cost: Decimal,
    salvage: Decimal,
    useful_life_years: int,
    current_book_value: Decimal,
    months_in_service: int,
) -> Decimal:
    """Calculate one month of depreciation."""
    method_val = method.value if hasattr(method, 'value') else method

    if method_val == "straight_line":
        annual = (cost - salvage) / Decimal(str(useful_life_years))
        monthly = annual / Decimal("12")
        # Don't depreciate below salvage
        if current_book_value - monthly < salvage:
            monthly = max(current_book_value - salvage, Decimal("0"))
        return monthly.quantize(Decimal("0.01"))

    elif method_val == "declining_balance":
        rate = Decimal("2") / Decimal(str(useful_life_years))
        annual = current_book_value * rate
        monthly = annual / Decimal("12")
        # Don't depreciate below salvage
        if current_book_value - monthly < salvage:
            monthly = max(current_book_value - salvage, Decimal("0"))
        return monthly.quantize(Decimal("0.01"))

    elif method_val.startswith("macrs_"):
        table = MACRS_TABLES.get(method_val, [])
        if not table:
            return Decimal("0")
        # Determine which year we're in (0-indexed)
        year_index = months_in_service // 12
        if year_index >= len(table):
            return Decimal("0")
        annual_pct = Decimal(str(table[year_index])) / Decimal("100")
        annual_amount = cost * annual_pct
        monthly = annual_amount / Decimal("12")
        # Don't depreciate below zero for MACRS (no salvage in MACRS)
        if current_book_value - monthly < Decimal("0"):
            monthly = max(current_book_value, Decimal("0"))
        return monthly.quantize(Decimal("0.01"))

    return Decimal("0")


async def _find_or_create_account(db: AsyncSession, account_number: str, name: str, account_type: AccountType) -> Account:
    """Find an account by number, create if missing."""
    result = await db.execute(select(Account).where(Account.account_number == account_number))
    account = result.scalar_one_or_none()
    if not account:
        account = Account(
            account_number=account_number,
            name=name,
            account_type=account_type,
            is_active=True,
        )
        db.add(account)
        await db.flush()
    return account


async def _create_depreciation_je(db: AsyncSession, asset: FixedAsset, amount: Decimal, period: str) -> str:
    """Create journal entry for depreciation: debit expense, credit accumulated depreciation."""
    depr_expense_acct = await _find_or_create_account(
        db, "6200", "Depreciation Expense", AccountType.EXPENSE
    )
    accum_depr_acct = await _find_or_create_account(
        db, "1590", "Accumulated Depreciation", AccountType.ASSET
    )

    je = JournalEntry(
        entry_date=date.today().isoformat(),
        description=f"Depreciation - {asset.name} ({period})",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    debit_line = JournalLine(
        journal_entry_id=je.id,
        account_id=depr_expense_acct.id,
        debit_amount=amount,
        credit_amount=Decimal("0"),
        description=f"Depreciation: {asset.name}",
    )
    credit_line = JournalLine(
        journal_entry_id=je.id,
        account_id=accum_depr_acct.id,
        debit_amount=Decimal("0"),
        credit_amount=amount,
        description=f"Accum. depreciation: {asset.name}",
    )
    db.add(debit_line)
    db.add(credit_line)

    # Update account balances
    depr_expense_acct.balance = depr_expense_acct.balance + amount
    accum_depr_acct.balance = accum_depr_acct.balance - amount  # contra-asset

    return je.id


async def depreciate_asset(db: AsyncSession, asset_id: str) -> dict:
    """Calculate and post one month of depreciation for an asset."""
    asset = await db.get(FixedAsset, asset_id)
    if not asset:
        raise ValueError("Fixed asset not found")
    if asset.is_disposed:
        raise ValueError("Cannot depreciate a disposed asset")

    current_period = date.today().strftime("%Y-%m")

    # Check if already depreciated this period
    existing = await db.execute(
        select(FixedAssetDepreciation).where(
            FixedAssetDepreciation.asset_id == asset_id,
            FixedAssetDepreciation.period_date == current_period,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Asset already depreciated for {current_period}")

    # Get existing depreciation records to compute accumulated
    dep_result = await db.execute(
        select(FixedAssetDepreciation)
        .where(FixedAssetDepreciation.asset_id == asset_id)
        .order_by(FixedAssetDepreciation.period_date)
    )
    existing_records = dep_result.scalars().all()

    accum = Decimal("0")
    if existing_records:
        accum = existing_records[-1].accumulated_depreciation

    current_bv = asset.acquisition_cost - accum
    months_in_service = len(existing_records)

    depr_amount = _calc_monthly_depreciation(
        asset.depreciation_method,
        asset.acquisition_cost,
        asset.salvage_value,
        asset.useful_life_years,
        current_bv,
        months_in_service,
    )

    if depr_amount <= 0:
        raise ValueError("Asset is fully depreciated")

    new_accum = accum + depr_amount
    new_bv = asset.acquisition_cost - new_accum

    # Create journal entry
    je_id = await _create_depreciation_je(db, asset, depr_amount, current_period)

    # Create depreciation record
    rec = FixedAssetDepreciation(
        asset_id=asset_id,
        period_date=current_period,
        depreciation_amount=depr_amount,
        accumulated_depreciation=new_accum,
        book_value=new_bv,
        journal_entry_id=je_id,
        is_posted=True,
    )
    db.add(rec)
    await db.commit()

    return {
        "asset_id": asset_id,
        "asset_name": asset.name,
        "period": current_period,
        "depreciation_amount": float(depr_amount),
        "accumulated_depreciation": float(new_accum),
        "book_value": float(new_bv),
        "journal_entry_id": je_id,
    }


async def depreciate_all(db: AsyncSession) -> dict:
    """Run monthly depreciation for all active (non-disposed) assets."""
    current_period = date.today().strftime("%Y-%m")

    result = await db.execute(
        select(FixedAsset).where(FixedAsset.is_disposed == False)
    )
    assets = result.scalars().all()

    depreciated_count = 0
    total_amount = Decimal("0")
    results = []

    for asset in assets:
        # Skip if already depreciated this period
        existing = await db.execute(
            select(FixedAssetDepreciation).where(
                FixedAssetDepreciation.asset_id == asset.id,
                FixedAssetDepreciation.period_date == current_period,
            )
        )
        if existing.scalar_one_or_none():
            continue

        # Get existing records
        dep_result = await db.execute(
            select(FixedAssetDepreciation)
            .where(FixedAssetDepreciation.asset_id == asset.id)
            .order_by(FixedAssetDepreciation.period_date)
        )
        existing_records = dep_result.scalars().all()

        accum = Decimal("0")
        if existing_records:
            accum = existing_records[-1].accumulated_depreciation

        current_bv = asset.acquisition_cost - accum
        months_in_service = len(existing_records)

        depr_amount = _calc_monthly_depreciation(
            asset.depreciation_method,
            asset.acquisition_cost,
            asset.salvage_value,
            asset.useful_life_years,
            current_bv,
            months_in_service,
        )

        if depr_amount <= 0:
            continue

        new_accum = accum + depr_amount
        new_bv = asset.acquisition_cost - new_accum

        je_id = await _create_depreciation_je(db, asset, depr_amount, current_period)

        rec = FixedAssetDepreciation(
            asset_id=asset.id,
            period_date=current_period,
            depreciation_amount=depr_amount,
            accumulated_depreciation=new_accum,
            book_value=new_bv,
            journal_entry_id=je_id,
            is_posted=True,
        )
        db.add(rec)

        depreciated_count += 1
        total_amount += depr_amount
        results.append({
            "asset_id": asset.id,
            "asset_name": asset.name,
            "amount": float(depr_amount),
        })

    await db.commit()
    return {
        "period": current_period,
        "assets_depreciated": depreciated_count,
        "total_amount": float(total_amount),
        "details": results,
    }


async def dispose_asset(db: AsyncSession, asset_id: str, data: dict) -> dict:
    """Record disposal of a fixed asset with journal entry."""
    asset = await db.get(FixedAsset, asset_id)
    if not asset:
        raise ValueError("Fixed asset not found")
    if asset.is_disposed:
        raise ValueError("Asset is already disposed")

    try:
        disposal_method = DisposalMethod(data["disposal_method"])
    except ValueError:
        raise ValueError(f"Invalid disposal method: {data['disposal_method']}")

    disposal_amount = Decimal(str(data.get("disposal_amount", 0)))

    # Get accumulated depreciation
    dep_result = await db.execute(
        select(FixedAssetDepreciation)
        .where(FixedAssetDepreciation.asset_id == asset_id)
        .order_by(FixedAssetDepreciation.period_date)
    )
    records = dep_result.scalars().all()
    accum_depr = records[-1].accumulated_depreciation if records else Decimal("0")
    book_value = asset.acquisition_cost - accum_depr

    # Create disposal journal entry
    asset_acct = await _find_or_create_account(db, "1500", "Fixed Assets", AccountType.ASSET)
    accum_depr_acct = await _find_or_create_account(db, "1590", "Accumulated Depreciation", AccountType.ASSET)

    je = JournalEntry(
        entry_date=data["disposal_date"],
        description=f"Disposal of asset: {asset.name} ({disposal_method.value})",
        is_posted=True,
    )
    db.add(je)
    await db.flush()

    lines = []

    # Debit accumulated depreciation (remove contra)
    if accum_depr > 0:
        lines.append(JournalLine(
            journal_entry_id=je.id,
            account_id=accum_depr_acct.id,
            debit_amount=accum_depr,
            credit_amount=Decimal("0"),
            description=f"Remove accum. depr: {asset.name}",
        ))

    # Credit the fixed asset (remove asset at cost)
    lines.append(JournalLine(
        journal_entry_id=je.id,
        account_id=asset_acct.id,
        debit_amount=Decimal("0"),
        credit_amount=asset.acquisition_cost,
        description=f"Dispose asset: {asset.name}",
    ))

    # Debit cash for proceeds
    if disposal_amount > 0:
        cash_acct = await _find_or_create_account(db, "1000", "Cash", AccountType.ASSET)
        lines.append(JournalLine(
            journal_entry_id=je.id,
            account_id=cash_acct.id,
            debit_amount=disposal_amount,
            credit_amount=Decimal("0"),
            description=f"Proceeds from disposal: {asset.name}",
        ))

    # Gain or loss
    gain_loss = disposal_amount - book_value
    if gain_loss > 0:
        gain_acct = await _find_or_create_account(db, "4900", "Gain on Disposal of Assets", AccountType.REVENUE)
        lines.append(JournalLine(
            journal_entry_id=je.id,
            account_id=gain_acct.id,
            debit_amount=Decimal("0"),
            credit_amount=gain_loss,
            description=f"Gain on disposal: {asset.name}",
        ))
    elif gain_loss < 0:
        loss_acct = await _find_or_create_account(db, "6900", "Loss on Disposal of Assets", AccountType.EXPENSE)
        lines.append(JournalLine(
            journal_entry_id=je.id,
            account_id=loss_acct.id,
            debit_amount=abs(gain_loss),
            credit_amount=Decimal("0"),
            description=f"Loss on disposal: {asset.name}",
        ))

    for line in lines:
        db.add(line)

    # Mark asset as disposed
    asset.is_disposed = True
    asset.disposal_date = data["disposal_date"]
    asset.disposal_amount = disposal_amount
    asset.disposal_method = disposal_method

    await db.commit()
    await db.refresh(asset)

    dep_result2 = await db.execute(
        select(FixedAssetDepreciation)
        .where(FixedAssetDepreciation.asset_id == asset.id)
        .order_by(FixedAssetDepreciation.period_date)
    )
    asset.depreciation_records = dep_result2.scalars().all()

    return _asset_to_dict(asset)


async def get_summary(db: AsyncSession) -> dict:
    """Summary report of all fixed assets."""
    result = await db.execute(select(FixedAsset))
    assets = result.scalars().all()

    total_cost = Decimal("0")
    total_accum = Decimal("0")
    total_bv = Decimal("0")
    by_category = {}
    active_count = 0
    disposed_count = 0

    for asset in assets:
        dep_result = await db.execute(
            select(FixedAssetDepreciation)
            .where(FixedAssetDepreciation.asset_id == asset.id)
            .order_by(FixedAssetDepreciation.period_date)
        )
        records = dep_result.scalars().all()
        accum = records[-1].accumulated_depreciation if records else Decimal("0")
        bv = asset.acquisition_cost - accum

        total_cost += asset.acquisition_cost
        total_accum += accum
        total_bv += bv

        cat = asset.category.value if hasattr(asset.category, 'value') else asset.category
        if cat not in by_category:
            by_category[cat] = {"count": 0, "total_cost": 0, "accumulated_depreciation": 0, "book_value": 0}
        by_category[cat]["count"] += 1
        by_category[cat]["total_cost"] += float(asset.acquisition_cost)
        by_category[cat]["accumulated_depreciation"] += float(accum)
        by_category[cat]["book_value"] += float(bv)

        if asset.is_disposed:
            disposed_count += 1
        else:
            active_count += 1

    return {
        "total_cost": float(total_cost),
        "total_accumulated_depreciation": float(total_accum),
        "total_book_value": float(total_bv),
        "active_count": active_count,
        "disposed_count": disposed_count,
        "total_count": active_count + disposed_count,
        "by_category": by_category,
    }
