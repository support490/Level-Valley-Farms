from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from decimal import Decimal
from typing import Optional

from app.models.feed import (
    Vendor, VendorType, FeedDelivery, FeedType,
    Medication, MedicationAdmin,
    PurchaseOrder, PurchaseOrderLine, POStatus,
)
from app.models.farm import Barn
from app.models.flock import Flock, FlockType, ProductionRecord
from app.schemas.feed import (
    VendorCreate, VendorUpdate,
    FeedDeliveryCreate,
    MedicationCreate, MedicationUpdate, MedicationAdminCreate,
    PurchaseOrderCreate, POStatusUpdate,
)


# ── Auto-number ──

async def _next_po_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(PurchaseOrder.id)))
    count = result.scalar() or 0
    return f"PO-{count + 1:06d}"


# ── Vendors ──

async def create_vendor(db: AsyncSession, data: VendorCreate):
    vendor = Vendor(**data.model_dump())
    db.add(vendor)
    await db.commit()
    await db.refresh(vendor)
    return _vendor_to_dict(vendor)


async def get_vendors(db: AsyncSession, active_only: bool = False, vendor_type: str = None):
    query = select(Vendor).order_by(Vendor.name)
    if active_only:
        query = query.where(Vendor.is_active == True)
    if vendor_type:
        query = query.where(Vendor.vendor_type == vendor_type)
    result = await db.execute(query)
    return [_vendor_to_dict(v) for v in result.scalars().all()]


async def update_vendor(db: AsyncSession, vendor_id: str, data: VendorUpdate):
    vendor = await db.get(Vendor, vendor_id)
    if not vendor:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(vendor, key, value)
    await db.commit()
    await db.refresh(vendor)
    return _vendor_to_dict(vendor)


def _vendor_to_dict(v: Vendor) -> dict:
    return {
        "id": v.id, "name": v.name,
        "vendor_type": v.vendor_type.value if hasattr(v.vendor_type, 'value') else v.vendor_type,
        "contact_name": v.contact_name, "phone": v.phone, "email": v.email,
        "address": v.address, "notes": v.notes, "is_active": v.is_active,
        "created_at": v.created_at,
    }


# ── Feed Deliveries ──

async def create_feed_delivery(db: AsyncSession, data: FeedDeliveryCreate):
    barn = await db.get(Barn, data.barn_id)
    if not barn:
        raise ValueError("Barn not found")

    total_cost = None
    if data.cost_per_ton is not None:
        total_cost = Decimal(str(data.tons)) * Decimal(str(data.cost_per_ton))

    delivery = FeedDelivery(
        ticket_number=data.ticket_number,
        barn_id=data.barn_id,
        flock_id=data.flock_id,
        vendor_id=data.vendor_id,
        delivery_date=data.delivery_date,
        feed_type=FeedType(data.feed_type),
        tons=Decimal(str(data.tons)),
        cost_per_ton=Decimal(str(data.cost_per_ton)) if data.cost_per_ton is not None else None,
        total_cost=total_cost,
        notes=data.notes,
    )
    db.add(delivery)
    await db.commit()
    await db.refresh(delivery)
    return await _delivery_to_dict(db, delivery)


async def get_feed_deliveries(db: AsyncSession, barn_id: str = None):
    query = select(FeedDelivery).order_by(FeedDelivery.delivery_date.desc())
    if barn_id:
        query = query.where(FeedDelivery.barn_id == barn_id)
    result = await db.execute(query)
    return [await _delivery_to_dict(db, d) for d in result.scalars().all()]


async def get_feed_inventory(db: AsyncSession):
    """Get feed tons on hand per barn (sum deliveries, no usage tracking yet)."""
    result = await db.execute(
        select(
            FeedDelivery.barn_id,
            FeedDelivery.feed_type,
            func.sum(FeedDelivery.tons).label("total_tons"),
            func.sum(FeedDelivery.total_cost).label("total_cost"),
            func.count(FeedDelivery.id).label("deliveries"),
            func.max(FeedDelivery.delivery_date).label("last_delivery"),
        )
        .group_by(FeedDelivery.barn_id, FeedDelivery.feed_type)
        .order_by(FeedDelivery.barn_id)
    )
    rows = result.all()
    inventory = []
    for row in rows:
        barn = await db.get(Barn, row[0])
        inventory.append({
            "barn_id": row[0],
            "barn_name": barn.name if barn else "",
            "feed_type": row[1].value if hasattr(row[1], 'value') else row[1],
            "total_tons_delivered": float(row[2] or 0),
            "total_cost": float(row[3] or 0),
            "num_deliveries": row[4],
            "last_delivery": row[5],
        })
    return inventory


async def get_feed_conversion(db: AsyncSession):
    """Calculate feed conversion for each layer flock: lbs feed per dozen eggs."""
    flocks_result = await db.execute(
        select(Flock).where(Flock.flock_type == FlockType.LAYER).order_by(Flock.flock_number)
    )
    flocks = flocks_result.scalars().all()
    conversions = []

    for flock in flocks:
        # Total feed delivered to this flock
        feed_result = await db.execute(
            select(
                func.coalesce(func.sum(FeedDelivery.tons), 0),
                func.coalesce(func.sum(FeedDelivery.total_cost), 0),
            ).where(FeedDelivery.flock_id == flock.id)
        )
        feed_row = feed_result.one()
        total_tons = float(feed_row[0])
        total_feed_cost = float(feed_row[1])
        total_lbs = total_tons * 2000

        # Total eggs produced
        egg_result = await db.execute(
            select(func.coalesce(func.sum(ProductionRecord.egg_count), 0)).where(
                ProductionRecord.flock_id == flock.id
            )
        )
        total_eggs = int(egg_result.scalar() or 0)
        total_dozens = total_eggs / 12 if total_eggs > 0 else 0

        feed_conversion = round(total_lbs / total_dozens, 2) if total_dozens > 0 else 0
        feed_cost_per_dozen = round(total_feed_cost / total_dozens, 4) if total_dozens > 0 else 0

        if total_tons > 0 or total_eggs > 0:
            conversions.append({
                "flock_id": flock.id,
                "flock_number": flock.flock_number,
                "total_feed_tons": round(total_tons, 3),
                "total_feed_lbs": round(total_lbs, 1),
                "total_eggs": total_eggs,
                "total_dozens": round(total_dozens, 1),
                "feed_conversion": feed_conversion,
                "feed_cost_per_dozen": feed_cost_per_dozen,
            })

    return conversions


async def _delivery_to_dict(db: AsyncSession, d: FeedDelivery) -> dict:
    barn = await db.get(Barn, d.barn_id)
    flock = await db.get(Flock, d.flock_id) if d.flock_id else None
    vendor = await db.get(Vendor, d.vendor_id) if d.vendor_id else None
    return {
        "id": d.id, "ticket_number": d.ticket_number,
        "barn_id": d.barn_id, "barn_name": barn.name if barn else "",
        "flock_id": d.flock_id, "flock_number": flock.flock_number if flock else "",
        "vendor_id": d.vendor_id, "vendor_name": vendor.name if vendor else "",
        "delivery_date": d.delivery_date,
        "feed_type": d.feed_type.value if hasattr(d.feed_type, 'value') else d.feed_type,
        "tons": float(d.tons), "cost_per_ton": float(d.cost_per_ton) if d.cost_per_ton else None,
        "total_cost": float(d.total_cost) if d.total_cost else None,
        "notes": d.notes, "created_at": d.created_at,
    }


# ── Medications ──

async def create_medication(db: AsyncSession, data: MedicationCreate):
    med = Medication(
        name=data.name, unit=data.unit,
        quantity_on_hand=Decimal(str(data.quantity_on_hand)),
        reorder_level=Decimal(str(data.reorder_level)) if data.reorder_level is not None else None,
        cost_per_unit=Decimal(str(data.cost_per_unit)) if data.cost_per_unit is not None else None,
        vendor_id=data.vendor_id, notes=data.notes,
    )
    db.add(med)
    await db.commit()
    await db.refresh(med)
    return await _med_to_dict(db, med)


async def get_medications(db: AsyncSession, active_only: bool = False):
    query = select(Medication).order_by(Medication.name)
    if active_only:
        query = query.where(Medication.is_active == True)
    result = await db.execute(query)
    return [await _med_to_dict(db, m) for m in result.scalars().all()]


async def update_medication(db: AsyncSession, med_id: str, data: MedicationUpdate):
    med = await db.get(Medication, med_id)
    if not med:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        if key in ("quantity_on_hand", "reorder_level", "cost_per_unit") and value is not None:
            value = Decimal(str(value))
        setattr(med, key, value)
    await db.commit()
    await db.refresh(med)
    return await _med_to_dict(db, med)


async def administer_medication(db: AsyncSession, data: MedicationAdminCreate):
    med = await db.get(Medication, data.medication_id)
    if not med:
        raise ValueError("Medication not found")
    flock = await db.get(Flock, data.flock_id)
    if not flock:
        raise ValueError("Flock not found")

    admin = MedicationAdmin(
        flock_id=data.flock_id, medication_id=data.medication_id,
        admin_date=data.admin_date, dosage=Decimal(str(data.dosage)),
        administered_by=data.administered_by, notes=data.notes,
    )
    db.add(admin)

    # Deduct from inventory
    med.quantity_on_hand = max(Decimal("0"), med.quantity_on_hand - Decimal(str(data.dosage)))
    await db.commit()
    await db.refresh(admin)
    return await _admin_to_dict(db, admin)


async def get_medication_admins(db: AsyncSession, flock_id: str = None):
    query = select(MedicationAdmin).order_by(MedicationAdmin.admin_date.desc())
    if flock_id:
        query = query.where(MedicationAdmin.flock_id == flock_id)
    result = await db.execute(query)
    return [await _admin_to_dict(db, a) for a in result.scalars().all()]


async def _med_to_dict(db: AsyncSession, m: Medication) -> dict:
    vendor = await db.get(Vendor, m.vendor_id) if m.vendor_id else None
    return {
        "id": m.id, "name": m.name, "unit": m.unit,
        "quantity_on_hand": float(m.quantity_on_hand),
        "reorder_level": float(m.reorder_level) if m.reorder_level is not None else None,
        "cost_per_unit": float(m.cost_per_unit) if m.cost_per_unit is not None else None,
        "vendor_id": m.vendor_id, "vendor_name": vendor.name if vendor else "",
        "notes": m.notes, "is_active": m.is_active, "created_at": m.created_at,
    }


async def _admin_to_dict(db: AsyncSession, a: MedicationAdmin) -> dict:
    flock = await db.get(Flock, a.flock_id)
    med = await db.get(Medication, a.medication_id)
    return {
        "id": a.id, "flock_id": a.flock_id,
        "flock_number": flock.flock_number if flock else "",
        "medication_id": a.medication_id,
        "medication_name": med.name if med else "",
        "admin_date": a.admin_date, "dosage": float(a.dosage),
        "administered_by": a.administered_by, "notes": a.notes,
        "created_at": a.created_at,
    }


# ── Purchase Orders ──

async def create_purchase_order(db: AsyncSession, data: PurchaseOrderCreate):
    vendor = await db.get(Vendor, data.vendor_id)
    if not vendor:
        raise ValueError("Vendor not found")

    po_number = await _next_po_number(db)
    total = Decimal("0")
    for line in data.lines:
        if line.unit_price is not None:
            total += Decimal(str(line.quantity)) * Decimal(str(line.unit_price))

    po = PurchaseOrder(
        po_number=po_number, vendor_id=data.vendor_id,
        order_date=data.order_date, expected_date=data.expected_date,
        total_amount=total, notes=data.notes,
    )
    db.add(po)
    await db.flush()

    for line_data in data.lines:
        line_total = None
        if line_data.unit_price is not None:
            line_total = Decimal(str(line_data.quantity)) * Decimal(str(line_data.unit_price))
        line = PurchaseOrderLine(
            po_id=po.id, description=line_data.description,
            quantity=Decimal(str(line_data.quantity)), unit=line_data.unit,
            unit_price=Decimal(str(line_data.unit_price)) if line_data.unit_price is not None else None,
            total=line_total, notes=line_data.notes,
        )
        db.add(line)

    await db.commit()
    await db.refresh(po)
    return await _po_to_dict(db, po)


async def get_purchase_orders(db: AsyncSession, status: str = None):
    query = select(PurchaseOrder).order_by(PurchaseOrder.order_date.desc())
    if status:
        query = query.where(PurchaseOrder.status == status)
    result = await db.execute(query)
    return [await _po_to_dict(db, po) for po in result.scalars().all()]


async def update_po_status(db: AsyncSession, po_id: str, data: POStatusUpdate):
    po = await db.get(PurchaseOrder, po_id)
    if not po:
        return None
    po.status = POStatus(data.status)
    await db.commit()
    await db.refresh(po)
    return await _po_to_dict(db, po)


async def _po_to_dict(db: AsyncSession, po: PurchaseOrder) -> dict:
    vendor = await db.get(Vendor, po.vendor_id)
    lines_result = await db.execute(
        select(PurchaseOrderLine).where(PurchaseOrderLine.po_id == po.id)
    )
    lines = [{
        "id": l.id, "po_id": l.po_id, "description": l.description,
        "quantity": float(l.quantity), "unit": l.unit,
        "unit_price": float(l.unit_price) if l.unit_price else None,
        "total": float(l.total) if l.total else None, "notes": l.notes,
    } for l in lines_result.scalars().all()]

    return {
        "id": po.id, "po_number": po.po_number,
        "vendor_id": po.vendor_id, "vendor_name": vendor.name if vendor else "",
        "order_date": po.order_date, "expected_date": po.expected_date,
        "status": po.status.value if hasattr(po.status, 'value') else po.status,
        "total_amount": float(po.total_amount) if po.total_amount else None,
        "notes": po.notes, "lines": lines, "created_at": po.created_at,
    }
