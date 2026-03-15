from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.database import get_db
from app.schemas.logistics import (
    PickupJobCreate, PickupJobResponse, PickupItemComplete,
    ShipmentCreate, ShipmentResponse, ShipmentStatusUpdate,
)
from app.services import logistics_service

router = APIRouter(prefix="/logistics", tags=["logistics"])


# ── Pickup Jobs ──

@router.get("/pickups", response_model=List[PickupJobResponse])
async def list_pickups(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await logistics_service.get_pickup_jobs(db, status)


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
