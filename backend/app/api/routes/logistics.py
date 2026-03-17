from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.database import get_db
from app.schemas.logistics import (
    PickupJobCreate, PickupJobResponse, PickupItemComplete,
    ShipmentCreate, ShipmentResponse, ShipmentStatusUpdate, DeliveryConfirmation,
    DriverCreate, DriverUpdate, DriverResponse,
    CarrierCreate, CarrierUpdate, CarrierResponse,
    EggReturnCreate, EggReturnResponse,
)
from app.services import logistics_service

router = APIRouter(prefix="/logistics", tags=["logistics"])


# ── Drivers ──

@router.get("/drivers", response_model=List[DriverResponse])
async def list_drivers(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await logistics_service.get_drivers(db, active_only)


@router.get("/drivers/{driver_id}", response_model=DriverResponse)
async def get_driver(driver_id: str, db: AsyncSession = Depends(get_db)):
    driver = await logistics_service.get_driver(db, driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    return driver


@router.post("/drivers", response_model=DriverResponse, status_code=201)
async def create_driver(data: DriverCreate, db: AsyncSession = Depends(get_db)):
    return await logistics_service.create_driver(db, data)


@router.put("/drivers/{driver_id}", response_model=DriverResponse)
async def update_driver(driver_id: str, data: DriverUpdate, db: AsyncSession = Depends(get_db)):
    result = await logistics_service.update_driver(db, driver_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Driver not found")
    return result


# ── Carriers ──

@router.get("/carriers", response_model=List[CarrierResponse])
async def list_carriers(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await logistics_service.get_carriers(db, active_only)


@router.get("/carriers/{carrier_id}", response_model=CarrierResponse)
async def get_carrier(carrier_id: str, db: AsyncSession = Depends(get_db)):
    carrier = await logistics_service.get_carrier(db, carrier_id)
    if not carrier:
        raise HTTPException(status_code=404, detail="Carrier not found")
    return carrier


@router.post("/carriers", response_model=CarrierResponse, status_code=201)
async def create_carrier(data: CarrierCreate, db: AsyncSession = Depends(get_db)):
    return await logistics_service.create_carrier(db, data)


@router.put("/carriers/{carrier_id}", response_model=CarrierResponse)
async def update_carrier(carrier_id: str, data: CarrierUpdate, db: AsyncSession = Depends(get_db)):
    result = await logistics_service.update_carrier(db, carrier_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Carrier not found")
    return result


# ── Pickup Jobs ──

@router.get("/pickups", response_model=List[PickupJobResponse])
async def list_pickups(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await logistics_service.get_pickup_jobs(db, status)


@router.get("/pickups/calendar", response_model=List[PickupJobResponse])
async def get_pickups_calendar(
    start_date: str = Query(...),
    end_date: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    return await logistics_service.get_pickups_calendar(db, start_date, end_date)


@router.get("/pickups/{job_id}", response_model=PickupJobResponse)
async def get_pickup(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await logistics_service.get_pickup_job(db, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Pickup job not found")
    return job


@router.post("/pickups", response_model=PickupJobResponse, status_code=201)
async def create_pickup(data: PickupJobCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await logistics_service.create_pickup_job(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/pickups/{job_id}/complete", response_model=PickupJobResponse)
async def complete_pickup(
    job_id: str,
    items: List[PickupItemComplete],
    db: AsyncSession = Depends(get_db),
):
    try:
        return await logistics_service.complete_pickup(db, job_id, items)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/pickups/{job_id}/cancel")
async def cancel_pickup(job_id: str, db: AsyncSession = Depends(get_db)):
    try:
        if not await logistics_service.cancel_pickup(db, job_id):
            raise HTTPException(status_code=404, detail="Pickup job not found")
        return {"message": "Pickup cancelled"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Shipments ──

@router.get("/shipments", response_model=List[ShipmentResponse])
async def list_shipments(
    status: Optional[str] = Query(None),
    contract_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await logistics_service.get_shipments(db, status, contract_id)


@router.get("/shipments/{shipment_id}", response_model=ShipmentResponse)
async def get_shipment(shipment_id: str, db: AsyncSession = Depends(get_db)):
    shipment = await logistics_service.get_shipment(db, shipment_id)
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return shipment


@router.post("/shipments", response_model=ShipmentResponse, status_code=201)
async def create_shipment(data: ShipmentCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await logistics_service.create_shipment(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/shipments/{shipment_id}/status", response_model=ShipmentResponse)
async def update_shipment_status(
    shipment_id: str,
    data: ShipmentStatusUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await logistics_service.update_shipment_status(db, shipment_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return result


@router.post("/shipments/{shipment_id}/confirm-delivery", response_model=ShipmentResponse)
async def confirm_delivery(
    shipment_id: str,
    data: DeliveryConfirmation,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await logistics_service.confirm_delivery(db, shipment_id, data)
        if not result:
            raise HTTPException(status_code=404, detail="Shipment not found")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/shipments/{shipment_id}/bol-pdf")
async def download_bol_pdf(shipment_id: str, db: AsyncSession = Depends(get_db)):
    """Generate and download a BOL PDF for a shipment."""
    try:
        pdf_buffer = await logistics_service.generate_bol_pdf(db, shipment_id)
    except ImportError:
        raise HTTPException(status_code=500, detail="PDF generation requires reportlab. Install with: pip install reportlab")
    if not pdf_buffer:
        raise HTTPException(status_code=404, detail="Shipment not found")

    # Get shipment number for filename
    shipment = await logistics_service.get_shipment(db, shipment_id)
    filename = f"BOL-{shipment['bol_number']}-{shipment['shipment_number']}.pdf"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ── Egg Returns ──

@router.get("/returns", response_model=List[EggReturnResponse])
async def list_returns(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await logistics_service.get_egg_returns(db, status)


@router.get("/returns/{return_id}", response_model=EggReturnResponse)
async def get_return(return_id: str, db: AsyncSession = Depends(get_db)):
    result = await logistics_service.get_egg_return(db, return_id)
    if not result:
        raise HTTPException(status_code=404, detail="Return not found")
    return result


@router.post("/returns", response_model=EggReturnResponse, status_code=201)
async def create_return(data: EggReturnCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await logistics_service.create_egg_return(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
