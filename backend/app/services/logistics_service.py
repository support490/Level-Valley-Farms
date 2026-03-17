from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from decimal import Decimal
from typing import Optional, List
from io import BytesIO

from app.models.logistics import (
    PickupJob, PickupItem, PickupStatus,
    Shipment, ShipmentLine, ShipmentStatus,
    Driver, Carrier,
    EggReturn, EggReturnLine, ReturnStatus,
)
from app.models.farm import Barn, Grower
from app.models.flock import Flock
from app.models.inventory import EggInventory, EggGrade
from app.models.contracts import EggContract
from app.schemas.logistics import (
    PickupJobCreate, PickupItemComplete,
    ShipmentCreate, ShipmentStatusUpdate, DeliveryConfirmation,
    DriverCreate, DriverUpdate,
    CarrierCreate, CarrierUpdate,
    EggReturnCreate,
)


# ── Auto-number generators ──

async def _next_pickup_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(PickupJob.id)))
    count = result.scalar() or 0
    return f"PU-{count + 1:06d}"


async def _next_shipment_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(Shipment.id)))
    count = result.scalar() or 0
    return f"SH-{count + 1:06d}"


async def _next_driver_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(Driver.id)))
    count = result.scalar() or 0
    return f"DR-{count + 1:04d}"


async def _next_return_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count(EggReturn.id)))
    count = result.scalar() or 0
    return f"RT-{count + 1:06d}"


async def _get_grade_label(db: AsyncSession, grade_value: str) -> str:
    result = await db.execute(
        select(EggGrade.label).where(EggGrade.value == grade_value)
    )
    label = result.scalar_one_or_none()
    return label or grade_value.replace("_", " ").title()


# ── Drivers ──

async def create_driver(db: AsyncSession, data: DriverCreate):
    driver_number = await _next_driver_number(db)
    driver = Driver(
        driver_number=driver_number,
        name=data.name,
        phone=data.phone,
        email=data.email,
        license_number=data.license_number,
        truck_type=data.truck_type,
        truck_plate=data.truck_plate,
        notes=data.notes,
    )
    db.add(driver)
    await db.commit()
    await db.refresh(driver)
    return _driver_to_dict(driver)


async def get_drivers(db: AsyncSession, active_only: bool = False):
    query = select(Driver).order_by(Driver.name)
    if active_only:
        query = query.where(Driver.is_active == True)
    result = await db.execute(query)
    return [_driver_to_dict(d) for d in result.scalars().all()]


async def get_driver(db: AsyncSession, driver_id: str):
    driver = await db.get(Driver, driver_id)
    if not driver:
        return None
    return _driver_to_dict(driver)


async def update_driver(db: AsyncSession, driver_id: str, data: DriverUpdate):
    driver = await db.get(Driver, driver_id)
    if not driver:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(driver, key, value)
    await db.commit()
    await db.refresh(driver)
    return _driver_to_dict(driver)


def _driver_to_dict(driver: Driver) -> dict:
    return {
        "id": driver.id,
        "driver_number": driver.driver_number,
        "name": driver.name,
        "phone": driver.phone,
        "email": driver.email,
        "license_number": driver.license_number,
        "truck_type": driver.truck_type,
        "truck_plate": driver.truck_plate,
        "is_active": driver.is_active,
        "notes": driver.notes,
        "created_at": driver.created_at,
    }


# ── Carriers ──

async def create_carrier(db: AsyncSession, data: CarrierCreate):
    carrier = Carrier(
        name=data.name,
        contact_name=data.contact_name,
        phone=data.phone,
        email=data.email,
        rate_per_mile=Decimal(str(data.rate_per_mile)) if data.rate_per_mile is not None else None,
        flat_rate=Decimal(str(data.flat_rate)) if data.flat_rate is not None else None,
        notes=data.notes,
    )
    db.add(carrier)
    await db.commit()
    await db.refresh(carrier)
    return _carrier_to_dict(carrier)


async def get_carriers(db: AsyncSession, active_only: bool = False):
    query = select(Carrier).order_by(Carrier.name)
    if active_only:
        query = query.where(Carrier.is_active == True)
    result = await db.execute(query)
    return [_carrier_to_dict(c) for c in result.scalars().all()]


async def get_carrier(db: AsyncSession, carrier_id: str):
    carrier = await db.get(Carrier, carrier_id)
    if not carrier:
        return None
    return _carrier_to_dict(carrier)


async def update_carrier(db: AsyncSession, carrier_id: str, data: CarrierUpdate):
    carrier = await db.get(Carrier, carrier_id)
    if not carrier:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key in ("rate_per_mile", "flat_rate") and value is not None:
            value = Decimal(str(value))
        setattr(carrier, key, value)
    await db.commit()
    await db.refresh(carrier)
    return _carrier_to_dict(carrier)


def _carrier_to_dict(carrier: Carrier) -> dict:
    return {
        "id": carrier.id,
        "name": carrier.name,
        "contact_name": carrier.contact_name,
        "phone": carrier.phone,
        "email": carrier.email,
        "rate_per_mile": float(carrier.rate_per_mile) if carrier.rate_per_mile is not None else None,
        "flat_rate": float(carrier.flat_rate) if carrier.flat_rate is not None else None,
        "notes": carrier.notes,
        "is_active": carrier.is_active,
        "created_at": carrier.created_at,
    }


# ── Pickup Jobs ──

async def create_pickup_job(db: AsyncSession, data: PickupJobCreate):
    pickup_number = await _next_pickup_number(db)

    # Resolve driver name from driver_id if provided
    driver_name = data.driver_name
    if data.driver_id:
        driver = await db.get(Driver, data.driver_id)
        if not driver:
            raise ValueError(f"Driver not found: {data.driver_id}")
        driver_name = driver.name

    job = PickupJob(
        pickup_number=pickup_number,
        scheduled_date=data.scheduled_date,
        driver_name=driver_name,
        driver_id=data.driver_id,
        notes=data.notes,
    )
    db.add(job)
    await db.flush()

    for item_data in data.items:
        # Validate barn and flock exist
        barn = await db.get(Barn, item_data.barn_id)
        if not barn:
            raise ValueError(f"Barn not found: {item_data.barn_id}")
        flock = await db.get(Flock, item_data.flock_id)
        if not flock:
            raise ValueError(f"Flock not found: {item_data.flock_id}")

        item = PickupItem(
            pickup_job_id=job.id,
            barn_id=item_data.barn_id,
            flock_id=item_data.flock_id,
            skids_estimated=item_data.skids_estimated,
            notes=item_data.notes,
        )
        db.add(item)

    await db.commit()
    await db.refresh(job)
    return await _pickup_to_dict(db, job)


async def get_pickup_jobs(db: AsyncSession, status: str = None):
    query = select(PickupJob).order_by(PickupJob.scheduled_date.desc())
    if status:
        query = query.where(PickupJob.status == status)
    result = await db.execute(query)
    jobs = result.scalars().all()
    return [await _pickup_to_dict(db, j) for j in jobs]


async def get_pickup_job(db: AsyncSession, job_id: str):
    job = await db.get(PickupJob, job_id)
    if not job:
        return None
    return await _pickup_to_dict(db, job)


async def get_pickups_calendar(db: AsyncSession, start_date: str, end_date: str):
    """Get pickups in a date range for calendar view."""
    query = select(PickupJob).where(
        and_(
            PickupJob.scheduled_date >= start_date,
            PickupJob.scheduled_date <= end_date,
        )
    ).order_by(PickupJob.scheduled_date)
    result = await db.execute(query)
    jobs = result.scalars().all()
    return [await _pickup_to_dict(db, j) for j in jobs]


async def complete_pickup(db: AsyncSession, job_id: str, items: List[PickupItemComplete]):
    """Mark a pickup as completed. For each item, set actual skids and grade,
    then auto-receive those skids into the egg warehouse inventory."""
    job = await db.get(PickupJob, job_id)
    if not job:
        raise ValueError("Pickup job not found")
    if job.status != PickupStatus.PENDING:
        raise ValueError(f"Pickup is already {job.status.value}")

    try:
        for item_data in items:
            item = await db.get(PickupItem, item_data.item_id)
            if not item or item.pickup_job_id != job_id:
                raise ValueError(f"Pickup item not found: {item_data.item_id}")

            item.skids_actual = item_data.skids_actual
            item.grade = item_data.grade

            # Auto-receive into egg warehouse inventory
            if item_data.skids_actual > 0:
                # Get current on-hand for this flock+grade
                current_on_hand = await _get_warehouse_on_hand(db, item.flock_id, item_data.grade)
                new_on_hand = current_on_hand + item_data.skids_actual

                inv_record = EggInventory(
                    flock_id=item.flock_id,
                    record_date=job.scheduled_date,
                    grade=item_data.grade,
                    skids_in=item_data.skids_actual,
                    skids_out=0,
                    skids_on_hand=new_on_hand,
                    dozens_per_skid=900,
                    notes=f"Auto-received from pickup {job.pickup_number}",
                )
                db.add(inv_record)

        job.status = PickupStatus.COMPLETED
        job.completed_date = job.scheduled_date
        await db.commit()
        return await _pickup_to_dict(db, job)
    except Exception:
        await db.rollback()
        raise


async def cancel_pickup(db: AsyncSession, job_id: str):
    job = await db.get(PickupJob, job_id)
    if not job:
        return False
    if job.status != PickupStatus.PENDING:
        raise ValueError(f"Cannot cancel a {job.status.value} pickup")
    job.status = PickupStatus.CANCELLED
    await db.commit()
    return True


# ── Shipments ──

async def create_shipment(db: AsyncSession, data: ShipmentCreate):
    shipment_number = await _next_shipment_number(db)

    # Validate contract if provided
    contract = None
    if data.contract_id:
        contract = await db.get(EggContract, data.contract_id)
        if not contract:
            raise ValueError("Contract not found")

    # Resolve carrier name from carrier_id if provided
    carrier_name = data.carrier
    if data.carrier_id:
        carrier_obj = await db.get(Carrier, data.carrier_id)
        if not carrier_obj:
            raise ValueError(f"Carrier not found: {data.carrier_id}")
        carrier_name = carrier_obj.name

    shipment = Shipment(
        shipment_number=shipment_number,
        bol_number=data.bol_number,
        contract_id=data.contract_id,
        ship_date=data.ship_date,
        buyer=data.buyer,
        carrier=carrier_name,
        carrier_id=data.carrier_id,
        destination=data.destination,
        freight_cost=Decimal(str(data.freight_cost)) if data.freight_cost is not None else None,
        notes=data.notes,
    )
    db.add(shipment)
    await db.flush()

    for line_data in data.lines:
        # Validate inventory availability
        if line_data.flock_id:
            on_hand = await _get_warehouse_on_hand(db, line_data.flock_id, line_data.grade)
            if line_data.skids > on_hand:
                grade_label = await _get_grade_label(db, line_data.grade)
                raise ValueError(f"Only {on_hand} skids of {grade_label} available for this flock")

        price = Decimal(str(line_data.price_per_dozen)) if line_data.price_per_dozen else None
        # Use contract price if available and no line price specified
        if not price and contract and contract.price_per_dozen:
            price = contract.price_per_dozen

        line = ShipmentLine(
            shipment_id=shipment.id,
            flock_id=line_data.flock_id,
            grade=line_data.grade,
            skids=line_data.skids,
            dozens_per_skid=line_data.dozens_per_skid,
            price_per_dozen=price,
            notes=line_data.notes,
        )
        db.add(line)

        # Deduct from warehouse inventory
        if line_data.flock_id:
            current_on_hand = await _get_warehouse_on_hand(db, line_data.flock_id, line_data.grade)
            new_on_hand = current_on_hand - line_data.skids

            inv_record = EggInventory(
                flock_id=line_data.flock_id,
                record_date=data.ship_date,
                grade=line_data.grade,
                skids_in=0,
                skids_out=line_data.skids,
                skids_on_hand=new_on_hand,
                dozens_per_skid=line_data.dozens_per_skid,
                notes=f"Shipped on {shipment_number} BOL#{data.bol_number}",
            )
            db.add(inv_record)

    await db.commit()
    await db.refresh(shipment)
    return await _shipment_to_dict(db, shipment)


async def get_shipments(db: AsyncSession, status: str = None, contract_id: str = None):
    query = select(Shipment).order_by(Shipment.ship_date.desc())
    if status:
        query = query.where(Shipment.status == status)
    if contract_id:
        query = query.where(Shipment.contract_id == contract_id)
    result = await db.execute(query)
    shipments = result.scalars().all()
    return [await _shipment_to_dict(db, s) for s in shipments]


async def get_shipment(db: AsyncSession, shipment_id: str):
    shipment = await db.get(Shipment, shipment_id)
    if not shipment:
        return None
    return await _shipment_to_dict(db, shipment)


async def update_shipment_status(db: AsyncSession, shipment_id: str, data: ShipmentStatusUpdate):
    shipment = await db.get(Shipment, shipment_id)
    if not shipment:
        return None
    shipment.status = ShipmentStatus(data.status)
    await db.commit()
    await db.refresh(shipment)
    return await _shipment_to_dict(db, shipment)


async def confirm_delivery(db: AsyncSession, shipment_id: str, data: DeliveryConfirmation):
    """Mark a shipment as delivered with proof-of-delivery info."""
    shipment = await db.get(Shipment, shipment_id)
    if not shipment:
        return None
    if shipment.status == ShipmentStatus.CANCELLED:
        raise ValueError("Cannot confirm delivery of a cancelled shipment")

    shipment.status = ShipmentStatus.DELIVERED
    shipment.delivered_date = data.delivered_date
    shipment.signed_by = data.signed_by
    shipment.pod_notes = data.pod_notes
    await db.commit()
    await db.refresh(shipment)
    return await _shipment_to_dict(db, shipment)


# ── Egg Returns ──

async def create_egg_return(db: AsyncSession, data: EggReturnCreate):
    """Create an egg return and re-enter skids into warehouse inventory."""
    return_number = await _next_return_number(db)

    # Validate shipment if provided
    if data.shipment_id:
        shipment = await db.get(Shipment, data.shipment_id)
        if not shipment:
            raise ValueError("Shipment not found")

    egg_return = EggReturn(
        return_number=return_number,
        shipment_id=data.shipment_id,
        return_date=data.return_date,
        buyer=data.buyer,
        reason=data.reason,
        notes=data.notes,
    )
    db.add(egg_return)
    await db.flush()

    for line_data in data.lines:
        line = EggReturnLine(
            egg_return_id=egg_return.id,
            flock_id=line_data.flock_id,
            grade=line_data.grade,
            skids=line_data.skids,
            dozens_per_skid=line_data.dozens_per_skid,
            notes=line_data.notes,
        )
        db.add(line)

        # Re-enter into warehouse inventory
        if line_data.flock_id:
            current_on_hand = await _get_warehouse_on_hand(db, line_data.flock_id, line_data.grade)
            new_on_hand = current_on_hand + line_data.skids

            inv_record = EggInventory(
                flock_id=line_data.flock_id,
                record_date=data.return_date,
                grade=line_data.grade,
                skids_in=line_data.skids,
                skids_out=0,
                skids_on_hand=new_on_hand,
                dozens_per_skid=line_data.dozens_per_skid,
                notes=f"Returned from {data.buyer} - {return_number}",
            )
            db.add(inv_record)

    egg_return.status = ReturnStatus.PROCESSED
    egg_return.processed_date = data.return_date
    await db.commit()
    await db.refresh(egg_return)
    return await _return_to_dict(db, egg_return)


async def get_egg_returns(db: AsyncSession, status: str = None):
    query = select(EggReturn).order_by(EggReturn.return_date.desc())
    if status:
        query = query.where(EggReturn.status == status)
    result = await db.execute(query)
    returns = result.scalars().all()
    return [await _return_to_dict(db, r) for r in returns]


async def get_egg_return(db: AsyncSession, return_id: str):
    egg_return = await db.get(EggReturn, return_id)
    if not egg_return:
        return None
    return await _return_to_dict(db, egg_return)


# ── BOL PDF Generation ──

async def generate_bol_pdf(db: AsyncSession, shipment_id: str) -> Optional[BytesIO]:
    """Generate a Bill of Lading PDF for a shipment."""
    shipment = await db.get(Shipment, shipment_id)
    if not shipment:
        return None

    shipment_data = await _shipment_to_dict(db, shipment)

    # Use reportlab for PDF generation
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.5*inch)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle('BolTitle', parent=styles['Heading1'], fontSize=18, alignment=1, spaceAfter=6)
    subtitle_style = ParagraphStyle('BolSubtitle', parent=styles['Normal'], fontSize=10, alignment=1, textColor=colors.grey)
    header_style = ParagraphStyle('BolHeader', parent=styles['Heading3'], fontSize=11, spaceAfter=4, spaceBefore=12)
    normal_style = styles['Normal']

    elements = []

    # Title
    elements.append(Paragraph("BILL OF LADING", title_style))
    elements.append(Paragraph("Level Valley Farms", subtitle_style))
    elements.append(Spacer(1, 12))

    # Header info table
    header_data = [
        ["BOL #:", shipment_data['bol_number'], "Shipment #:", shipment_data['shipment_number']],
        ["Ship Date:", shipment_data['ship_date'], "Status:", shipment_data['status'].upper()],
        ["Buyer:", shipment_data['buyer'], "Carrier:", shipment_data['carrier'] or '—'],
        ["Destination:", shipment_data['destination'] or '—', "Contract:", shipment_data['contract_number'] or '—'],
    ]
    if shipment_data.get('freight_cost'):
        header_data.append(["Freight Cost:", f"${shipment_data['freight_cost']:.2f}", "", ""])

    header_table = Table(header_data, colWidths=[1.2*inch, 2.3*inch, 1.2*inch, 2.3*inch])
    header_table.setStyle(TableStyle([
        ('FONT', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONT', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 16))

    # Line items
    elements.append(Paragraph("Shipment Lines", header_style))
    line_header = ["#", "Flock", "Grade", "Skids", "Doz/Skid", "Total Dozens", "$/Doz", "Line Total"]
    line_data = [line_header]
    for i, line in enumerate(shipment_data['lines'], 1):
        line_data.append([
            str(i),
            line['flock_number'] or '—',
            line['grade_label'],
            str(line['skids']),
            str(line['dozens_per_skid']),
            f"{line['total_dozens']:,}",
            f"${line['price_per_dozen']:.4f}" if line['price_per_dozen'] else '—',
            f"${line['line_total']:.2f}" if line['line_total'] else '—',
        ])

    line_table = Table(line_data, colWidths=[0.4*inch, 1.1*inch, 1.1*inch, 0.6*inch, 0.7*inch, 1*inch, 0.8*inch, 1*inch])
    line_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e293b')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold', 8),
        ('FONT', (0, 1), (-1, -1), 'Helvetica', 9),
        ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(line_table)
    elements.append(Spacer(1, 8))

    # Totals
    totals_data = [
        ["", "", "Total Skids:", str(shipment_data['total_skids'])],
        ["", "", "Total Dozens:", f"{shipment_data['total_dozens']:,}"],
        ["", "", "Total Amount:", f"${shipment_data['total_amount']:.2f}"],
    ]
    totals_table = Table(totals_data, colWidths=[2*inch, 2*inch, 1.5*inch, 1.5*inch])
    totals_table.setStyle(TableStyle([
        ('FONT', (2, 0), (2, -1), 'Helvetica-Bold', 9),
        ('FONT', (3, 0), (3, -1), 'Helvetica', 9),
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('LINEABOVE', (2, 0), (-1, 0), 1, colors.grey),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 30))

    # Signature blocks
    elements.append(Paragraph("Signatures", header_style))
    sig_data = [
        ["Shipped By: ______________________________", "Date: ______________"],
        ["", ""],
        ["Received By: ______________________________", "Date: ______________"],
    ]
    sig_table = Table(sig_data, colWidths=[4*inch, 3*inch])
    sig_table.setStyle(TableStyle([
        ('FONT', (0, 0), (-1, -1), 'Helvetica', 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    elements.append(sig_table)

    if shipment_data.get('notes'):
        elements.append(Spacer(1, 16))
        elements.append(Paragraph("Notes", header_style))
        elements.append(Paragraph(shipment_data['notes'], normal_style))

    doc.build(elements)
    buffer.seek(0)
    return buffer


# ── Helpers ──

async def _get_warehouse_on_hand(db: AsyncSession, flock_id: str, grade: str) -> int:
    """Get current skids on hand in warehouse for a flock+grade."""
    result = await db.execute(
        select(EggInventory.skids_on_hand)
        .where(EggInventory.flock_id == flock_id, EggInventory.grade == grade)
        .order_by(EggInventory.record_date.desc(), EggInventory.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return row if row is not None else 0


async def _pickup_to_dict(db: AsyncSession, job: PickupJob) -> dict:
    items_result = await db.execute(
        select(PickupItem).where(PickupItem.pickup_job_id == job.id)
    )
    items = items_result.scalars().all()

    item_dicts = []
    total_estimated = 0
    total_actual = 0
    for item in items:
        barn = await db.get(Barn, item.barn_id)
        flock = await db.get(Flock, item.flock_id)
        grade_label = await _get_grade_label(db, item.grade) if item.grade else ""

        total_estimated += item.skids_estimated
        if item.skids_actual is not None:
            total_actual += item.skids_actual

        item_dicts.append({
            "id": item.id,
            "pickup_job_id": item.pickup_job_id,
            "barn_id": item.barn_id,
            "barn_name": barn.name if barn else "",
            "flock_id": item.flock_id,
            "flock_number": flock.flock_number if flock else "",
            "skids_estimated": item.skids_estimated,
            "skids_actual": item.skids_actual,
            "grade": item.grade,
            "grade_label": grade_label,
            "notes": item.notes,
        })

    # Get driver info if linked
    driver_dict = None
    if job.driver_id:
        driver = await db.get(Driver, job.driver_id)
        if driver:
            driver_dict = _driver_to_dict(driver)

    return {
        "id": job.id,
        "pickup_number": job.pickup_number,
        "scheduled_date": job.scheduled_date,
        "driver_name": job.driver_name,
        "driver_id": job.driver_id,
        "driver": driver_dict,
        "status": job.status.value if hasattr(job.status, 'value') else job.status,
        "completed_date": job.completed_date,
        "notes": job.notes,
        "items": item_dicts,
        "total_estimated_skids": total_estimated,
        "total_actual_skids": total_actual,
        "created_at": job.created_at,
    }


async def _shipment_to_dict(db: AsyncSession, shipment: Shipment) -> dict:
    lines_result = await db.execute(
        select(ShipmentLine).where(ShipmentLine.shipment_id == shipment.id)
    )
    lines = lines_result.scalars().all()

    line_dicts = []
    total_skids = 0
    total_dozens = 0
    total_amount = Decimal("0")

    for line in lines:
        flock = await db.get(Flock, line.flock_id) if line.flock_id else None
        grade_label = await _get_grade_label(db, line.grade)
        line_dozens = line.skids * line.dozens_per_skid
        line_total = Decimal(str(line.skids)) * Decimal(str(line.dozens_per_skid)) * line.price_per_dozen if line.price_per_dozen else Decimal("0")

        total_skids += line.skids
        total_dozens += line_dozens
        total_amount += line_total

        line_dicts.append({
            "id": line.id,
            "shipment_id": line.shipment_id,
            "flock_id": line.flock_id,
            "flock_number": flock.flock_number if flock else "",
            "grade": line.grade,
            "grade_label": grade_label,
            "skids": line.skids,
            "dozens_per_skid": line.dozens_per_skid,
            "total_dozens": line_dozens,
            "price_per_dozen": float(line.price_per_dozen) if line.price_per_dozen else None,
            "line_total": float(line_total),
            "notes": line.notes,
        })

    # Get contract number if applicable
    contract_number = ""
    if shipment.contract_id:
        contract = await db.get(EggContract, shipment.contract_id)
        contract_number = contract.contract_number if contract else ""

    # Get carrier name if linked
    carrier_name = ""
    if shipment.carrier_id:
        carrier = await db.get(Carrier, shipment.carrier_id)
        carrier_name = carrier.name if carrier else ""

    return {
        "id": shipment.id,
        "shipment_number": shipment.shipment_number,
        "bol_number": shipment.bol_number,
        "contract_id": shipment.contract_id,
        "contract_number": contract_number,
        "ship_date": shipment.ship_date,
        "buyer": shipment.buyer,
        "carrier": shipment.carrier,
        "carrier_id": shipment.carrier_id,
        "carrier_name": carrier_name,
        "destination": shipment.destination,
        "status": shipment.status.value if hasattr(shipment.status, 'value') else shipment.status,
        "freight_cost": float(shipment.freight_cost) if shipment.freight_cost is not None else None,
        "delivered_date": shipment.delivered_date,
        "signed_by": shipment.signed_by,
        "pod_notes": shipment.pod_notes,
        "notes": shipment.notes,
        "lines": line_dicts,
        "total_skids": total_skids,
        "total_dozens": total_dozens,
        "total_amount": float(total_amount),
        "created_at": shipment.created_at,
    }


async def _return_to_dict(db: AsyncSession, egg_return: EggReturn) -> dict:
    lines_result = await db.execute(
        select(EggReturnLine).where(EggReturnLine.egg_return_id == egg_return.id)
    )
    lines = lines_result.scalars().all()

    line_dicts = []
    total_skids = 0
    total_dozens = 0

    for line in lines:
        flock = await db.get(Flock, line.flock_id) if line.flock_id else None
        grade_label = await _get_grade_label(db, line.grade)
        line_dozens = line.skids * line.dozens_per_skid

        total_skids += line.skids
        total_dozens += line_dozens

        line_dicts.append({
            "id": line.id,
            "egg_return_id": line.egg_return_id,
            "flock_id": line.flock_id,
            "flock_number": flock.flock_number if flock else "",
            "grade": line.grade,
            "grade_label": grade_label,
            "skids": line.skids,
            "dozens_per_skid": line.dozens_per_skid,
            "total_dozens": line_dozens,
            "notes": line.notes,
        })

    # Get shipment number if linked
    shipment_number = ""
    if egg_return.shipment_id:
        shipment = await db.get(Shipment, egg_return.shipment_id)
        shipment_number = shipment.shipment_number if shipment else ""

    return {
        "id": egg_return.id,
        "return_number": egg_return.return_number,
        "shipment_id": egg_return.shipment_id,
        "shipment_number": shipment_number,
        "return_date": egg_return.return_date,
        "buyer": egg_return.buyer,
        "reason": egg_return.reason,
        "status": egg_return.status.value if hasattr(egg_return.status, 'value') else egg_return.status,
        "processed_date": egg_return.processed_date,
        "notes": egg_return.notes,
        "lines": line_dicts,
        "total_skids": total_skids,
        "total_dozens": total_dozens,
        "created_at": egg_return.created_at,
    }
