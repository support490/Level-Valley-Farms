from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from decimal import Decimal
from datetime import date, datetime
from typing import Optional

from app.models.contracts import EggContract, ContractFlockAssignment, Buyer
from app.models.logistics import Shipment, ShipmentLine, ShipmentStatus
from app.models.inventory import EggSale, EggGrade
from app.models.flock import Flock
from app.schemas.contracts import (
    EggContractCreate, EggContractUpdate, ContractAssignmentCreate,
    BuyerCreate, BuyerUpdate,
)


# ── Buyers ──

async def create_buyer(db: AsyncSession, data: BuyerCreate):
    buyer = Buyer(**data.model_dump())
    db.add(buyer)
    await db.commit()
    await db.refresh(buyer)
    return _buyer_to_dict(buyer)


async def get_all_buyers(db: AsyncSession, active_only: bool = False):
    query = select(Buyer).order_by(Buyer.name)
    if active_only:
        query = query.where(Buyer.is_active == True)
    result = await db.execute(query)
    return [_buyer_to_dict(b) for b in result.scalars().all()]


async def get_buyer(db: AsyncSession, buyer_id: str):
    buyer = await db.get(Buyer, buyer_id)
    if not buyer:
        return None
    return _buyer_to_dict(buyer)


async def update_buyer(db: AsyncSession, buyer_id: str, data: BuyerUpdate):
    buyer = await db.get(Buyer, buyer_id)
    if not buyer:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(buyer, key, value)
    await db.commit()
    await db.refresh(buyer)
    return _buyer_to_dict(buyer)


def _buyer_to_dict(buyer: Buyer) -> dict:
    return {
        "id": buyer.id,
        "name": buyer.name,
        "contact_name": buyer.contact_name,
        "phone": buyer.phone,
        "email": buyer.email,
        "address": buyer.address,
        "notes": buyer.notes,
        "is_active": buyer.is_active,
        "created_at": buyer.created_at,
    }


# ── Contracts ──

async def get_all_contracts(db: AsyncSession, active_only: bool = False):
    query = select(EggContract).order_by(EggContract.contract_number)
    if active_only:
        query = query.where(EggContract.is_active == True)
    result = await db.execute(query)
    contracts = result.scalars().all()
    return [await _contract_to_dict(db, c) for c in contracts]


async def get_contract(db: AsyncSession, contract_id: str):
    contract = await db.get(EggContract, contract_id)
    if not contract:
        return None
    return await _contract_to_dict(db, contract)


async def create_contract(db: AsyncSession, data: EggContractCreate):
    existing = await db.execute(
        select(EggContract).where(EggContract.contract_number == data.contract_number)
    )
    if existing.scalar_one_or_none():
        raise ValueError(f"Contract number '{data.contract_number}' already exists")

    contract = EggContract(**data.model_dump())
    db.add(contract)
    await db.commit()
    await db.refresh(contract)
    return await _contract_to_dict(db, contract)


async def update_contract(db: AsyncSession, contract_id: str, data: EggContractUpdate):
    contract = await db.get(EggContract, contract_id)
    if not contract:
        return None

    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(contract, key, val)

    await db.commit()
    await db.refresh(contract)
    return await _contract_to_dict(db, contract)


async def delete_contract(db: AsyncSession, contract_id: str):
    contract = await db.get(EggContract, contract_id)
    if not contract:
        return False
    contract.is_active = False
    await db.commit()
    return True


async def assign_flock(db: AsyncSession, data: ContractAssignmentCreate):
    contract = await db.get(EggContract, data.contract_id)
    if not contract:
        raise ValueError("Contract not found")
    if not contract.is_active:
        raise ValueError("Contract is not active")

    flock = await db.get(Flock, data.flock_id)
    if not flock:
        raise ValueError("Flock not found")

    existing = await db.execute(
        select(ContractFlockAssignment).where(
            ContractFlockAssignment.contract_id == data.contract_id,
            ContractFlockAssignment.flock_id == data.flock_id,
        )
    )
    if existing.scalar_one_or_none():
        raise ValueError("Flock is already assigned to this contract")

    count_result = await db.execute(
        select(func.count(ContractFlockAssignment.id)).where(
            ContractFlockAssignment.contract_id == data.contract_id
        )
    )
    current_count = count_result.scalar()
    if current_count >= contract.num_flocks:
        raise ValueError(f"Contract already has {current_count}/{contract.num_flocks} flocks assigned")

    assignment = ContractFlockAssignment(
        contract_id=data.contract_id,
        flock_id=data.flock_id,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return await _contract_to_dict(db, contract)


async def unassign_flock(db: AsyncSession, contract_id: str, flock_id: str):
    result = await db.execute(
        select(ContractFlockAssignment).where(
            ContractFlockAssignment.contract_id == contract_id,
            ContractFlockAssignment.flock_id == flock_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        return False
    await db.delete(assignment)
    await db.commit()
    return True


async def get_contracts_for_flock(db: AsyncSession, flock_id: str):
    result = await db.execute(
        select(ContractFlockAssignment).where(
            ContractFlockAssignment.flock_id == flock_id
        )
    )
    assignments = result.scalars().all()
    contracts = []
    for a in assignments:
        contract = await db.get(EggContract, a.contract_id)
        if contract:
            contracts.append(await _contract_to_dict(db, contract))
    return contracts


# ── Contract Intelligence ──

async def get_contract_dashboard(db: AsyncSession):
    """Get fulfillment progress for all active contracts."""
    result = await db.execute(
        select(EggContract).where(EggContract.is_active == True).order_by(EggContract.contract_number)
    )
    contracts = result.scalars().all()
    dashboard = []

    today = date.today().isoformat()

    for contract in contracts:
        # Get shipment stats for this contract
        ship_result = await db.execute(
            select(
                func.count(func.distinct(Shipment.id)),
                func.coalesce(func.sum(ShipmentLine.skids * ShipmentLine.dozens_per_skid), 0),
            )
            .select_from(Shipment)
            .join(ShipmentLine, ShipmentLine.shipment_id == Shipment.id)
            .where(
                Shipment.contract_id == contract.id,
                Shipment.status != ShipmentStatus.CANCELLED,
            )
        )
        row = ship_result.one()
        num_shipments = row[0] or 0
        volume_shipped = int(row[1] or 0)

        # Revenue
        rev_result = await db.execute(
            select(
                func.coalesce(
                    func.sum(ShipmentLine.skids * ShipmentLine.dozens_per_skid * ShipmentLine.price_per_dozen), 0
                )
            )
            .select_from(Shipment)
            .join(ShipmentLine, ShipmentLine.shipment_id == Shipment.id)
            .where(
                Shipment.contract_id == contract.id,
                Shipment.status != ShipmentStatus.CANCELLED,
                ShipmentLine.price_per_dozen.isnot(None),
            )
        )
        total_revenue = float(rev_result.scalar() or 0)

        # Fulfillment percentage
        committed = contract.volume_committed_dozens
        fulfillment_pct = 0
        if committed and committed > 0:
            fulfillment_pct = round((volume_shipped / committed) * 100, 1)

        # Days remaining
        days_remaining = None
        if contract.end_date:
            try:
                end = date.fromisoformat(contract.end_date)
                days_remaining = (end - date.today()).days
            except ValueError:
                pass

        # Assigned flocks count
        assign_result = await db.execute(
            select(func.count(ContractFlockAssignment.id)).where(
                ContractFlockAssignment.contract_id == contract.id
            )
        )
        assigned_count = assign_result.scalar() or 0

        dashboard.append({
            "id": contract.id,
            "contract_number": contract.contract_number,
            "buyer": contract.buyer,
            "grade": contract.grade,
            "price_per_dozen": float(contract.price_per_dozen) if contract.price_per_dozen else None,
            "start_date": contract.start_date,
            "end_date": contract.end_date,
            "is_active": contract.is_active,
            "volume_committed_dozens": contract.volume_committed_dozens,
            "volume_shipped_dozens": volume_shipped,
            "fulfillment_pct": fulfillment_pct,
            "total_revenue": total_revenue,
            "num_shipments": num_shipments,
            "assigned_flocks": assigned_count,
            "num_flocks": contract.num_flocks,
            "days_remaining": days_remaining,
        })

    return dashboard


async def get_contract_pnl(db: AsyncSession, contract_id: str):
    """Get P&L for a specific contract: revenue from shipments."""
    contract = await db.get(EggContract, contract_id)
    if not contract:
        return None

    # Get all non-cancelled shipments for this contract
    result = await db.execute(
        select(Shipment).where(
            Shipment.contract_id == contract_id,
            Shipment.status != ShipmentStatus.CANCELLED,
        ).order_by(Shipment.ship_date.desc())
    )
    shipments = result.scalars().all()

    shipment_details = []
    total_revenue = Decimal("0")
    total_dozens = 0

    for shipment in shipments:
        lines_result = await db.execute(
            select(ShipmentLine).where(ShipmentLine.shipment_id == shipment.id)
        )
        lines = lines_result.scalars().all()

        ship_dozens = 0
        ship_revenue = Decimal("0")
        for line in lines:
            line_dozens = line.skids * line.dozens_per_skid
            ship_dozens += line_dozens
            if line.price_per_dozen:
                ship_revenue += Decimal(str(line.skids)) * Decimal(str(line.dozens_per_skid)) * line.price_per_dozen

        total_dozens += ship_dozens
        total_revenue += ship_revenue

        shipment_details.append({
            "shipment_id": shipment.id,
            "shipment_number": shipment.shipment_number,
            "ship_date": shipment.ship_date,
            "status": shipment.status.value if hasattr(shipment.status, 'value') else shipment.status,
            "total_dozens": ship_dozens,
            "revenue": float(ship_revenue),
            "freight_cost": float(shipment.freight_cost) if shipment.freight_cost else None,
        })

    return {
        "contract_id": contract.id,
        "contract_number": contract.contract_number,
        "buyer": contract.buyer,
        "total_revenue": float(total_revenue),
        "total_shipped_dozens": total_dozens,
        "num_shipments": len(shipments),
        "price_per_dozen": float(contract.price_per_dozen) if contract.price_per_dozen else None,
        "shipments": shipment_details,
    }


async def get_price_history(db: AsyncSession, buyer_name: str = None):
    """Get price history from shipment lines, grouped by buyer and date."""
    query = (
        select(
            Shipment.ship_date,
            Shipment.buyer,
            ShipmentLine.grade,
            ShipmentLine.price_per_dozen,
            Shipment.shipment_number,
        )
        .join(ShipmentLine, ShipmentLine.shipment_id == Shipment.id)
        .where(
            Shipment.status != ShipmentStatus.CANCELLED,
            ShipmentLine.price_per_dozen.isnot(None),
        )
        .order_by(Shipment.ship_date.desc())
    )
    if buyer_name:
        query = query.where(Shipment.buyer == buyer_name)

    result = await db.execute(query)
    rows = result.all()

    entries = []
    for row in rows:
        grade_label = ""
        if row[2]:
            gl_result = await db.execute(
                select(EggGrade.label).where(EggGrade.value == row[2])
            )
            grade_label = gl_result.scalar_one_or_none() or row[2].replace("_", " ").title()

        entries.append({
            "date": row[0],
            "buyer": row[1],
            "grade": row[2] or "",
            "grade_label": grade_label,
            "price_per_dozen": float(row[3]),
            "source": "shipment",
            "reference": row[4],
        })

    # Also include direct egg sales
    sale_query = (
        select(EggSale)
        .order_by(EggSale.sale_date.desc())
    )
    if buyer_name:
        sale_query = sale_query.where(EggSale.buyer == buyer_name)

    sale_result = await db.execute(sale_query)
    for sale in sale_result.scalars().all():
        grade_label = ""
        if sale.grade:
            gl_result = await db.execute(
                select(EggGrade.label).where(EggGrade.value == sale.grade)
            )
            grade_label = gl_result.scalar_one_or_none() or sale.grade.replace("_", " ").title()

        entries.append({
            "date": sale.sale_date,
            "buyer": sale.buyer,
            "grade": sale.grade or "",
            "grade_label": grade_label,
            "price_per_dozen": float(sale.price_per_dozen) if sale.price_per_dozen else 0,
            "source": "sale",
            "reference": f"Sale #{sale.id[:8]}",
        })

    # Sort combined by date descending
    entries.sort(key=lambda x: x["date"], reverse=True)
    return entries


async def get_contract_alerts(db: AsyncSession):
    """Get contracts expiring within 30/60/90 days."""
    today = date.today()
    alerts = []

    result = await db.execute(
        select(EggContract).where(
            EggContract.is_active == True,
            EggContract.end_date.isnot(None),
        )
    )
    contracts = result.scalars().all()

    for contract in contracts:
        try:
            end = date.fromisoformat(contract.end_date)
        except (ValueError, TypeError):
            continue

        days_remaining = (end - today).days

        if days_remaining < 0:
            alerts.append({
                "contract_id": contract.id,
                "contract_number": contract.contract_number,
                "buyer": contract.buyer,
                "alert_type": "expired",
                "severity": "danger",
                "message": f"{contract.contract_number} expired {abs(days_remaining)} days ago",
                "end_date": contract.end_date,
                "days_remaining": days_remaining,
            })
        elif days_remaining <= 30:
            alerts.append({
                "contract_id": contract.id,
                "contract_number": contract.contract_number,
                "buyer": contract.buyer,
                "alert_type": "expiring_30",
                "severity": "danger",
                "message": f"{contract.contract_number} expires in {days_remaining} days",
                "end_date": contract.end_date,
                "days_remaining": days_remaining,
            })
        elif days_remaining <= 60:
            alerts.append({
                "contract_id": contract.id,
                "contract_number": contract.contract_number,
                "buyer": contract.buyer,
                "alert_type": "expiring_60",
                "severity": "warning",
                "message": f"{contract.contract_number} expires in {days_remaining} days",
                "end_date": contract.end_date,
                "days_remaining": days_remaining,
            })
        elif days_remaining <= 90:
            alerts.append({
                "contract_id": contract.id,
                "contract_number": contract.contract_number,
                "buyer": contract.buyer,
                "alert_type": "expiring_90",
                "severity": "info",
                "message": f"{contract.contract_number} expires in {days_remaining} days",
                "end_date": contract.end_date,
                "days_remaining": days_remaining,
            })

    # Sort by days remaining (most urgent first)
    alerts.sort(key=lambda x: x["days_remaining"])
    return alerts


async def get_spot_sales(db: AsyncSession):
    """Get shipments that are NOT tied to a contract (spot sales)."""
    result = await db.execute(
        select(Shipment).where(
            Shipment.contract_id.is_(None),
            Shipment.status != ShipmentStatus.CANCELLED,
        ).order_by(Shipment.ship_date.desc())
    )
    shipments = result.scalars().all()

    spot_sales = []
    for shipment in shipments:
        lines_result = await db.execute(
            select(ShipmentLine).where(ShipmentLine.shipment_id == shipment.id)
        )
        lines = lines_result.scalars().all()

        total_skids = sum(l.skids for l in lines)
        total_dozens = sum(l.skids * l.dozens_per_skid for l in lines)
        total_amount = sum(
            float(Decimal(str(l.skids)) * Decimal(str(l.dozens_per_skid)) * l.price_per_dozen)
            for l in lines if l.price_per_dozen
        )

        spot_sales.append({
            "shipment_id": shipment.id,
            "shipment_number": shipment.shipment_number,
            "ship_date": shipment.ship_date,
            "buyer": shipment.buyer,
            "status": shipment.status.value if hasattr(shipment.status, 'value') else shipment.status,
            "total_skids": total_skids,
            "total_dozens": total_dozens,
            "total_amount": total_amount,
        })

    return spot_sales


# ── Helpers ──

async def _contract_to_dict(db: AsyncSession, contract: EggContract) -> dict:
    result = await db.execute(
        select(ContractFlockAssignment).where(
            ContractFlockAssignment.contract_id == contract.id
        )
    )
    assignments = result.scalars().all()
    assigned_flocks = []
    for a in assignments:
        flock = await db.get(Flock, a.flock_id)
        if flock:
            assigned_flocks.append({
                "assignment_id": a.id,
                "flock_id": flock.id,
                "flock_number": flock.flock_number,
            })

    return {
        "id": contract.id,
        "contract_number": contract.contract_number,
        "buyer": contract.buyer,
        "buyer_id": contract.buyer_id,
        "description": contract.description,
        "num_flocks": contract.num_flocks,
        "start_date": contract.start_date,
        "end_date": contract.end_date,
        "price_per_dozen": float(contract.price_per_dozen) if contract.price_per_dozen else None,
        "grade": contract.grade,
        "volume_committed_dozens": contract.volume_committed_dozens,
        "notes": contract.notes,
        "is_active": contract.is_active,
        "created_at": contract.created_at,
        "updated_at": contract.updated_at,
        "assigned_flocks": assigned_flocks,
    }
