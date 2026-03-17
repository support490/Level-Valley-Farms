from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.database import get_db
from app.schemas.feed import (
    VendorCreate, VendorUpdate, VendorResponse,
    FeedDeliveryCreate, FeedDeliveryResponse,
    MedicationCreate, MedicationUpdate, MedicationResponse,
    MedicationAdminCreate, MedicationAdminResponse,
    PurchaseOrderCreate, PurchaseOrderResponse, POStatusUpdate,
    FeedConversionEntry,
)
from app.services import feed_service

router = APIRouter(prefix="/feed", tags=["feed"])


# ── Vendors ──

@router.get("/vendors", response_model=List[VendorResponse])
async def list_vendors(
    active_only: bool = Query(False),
    vendor_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await feed_service.get_vendors(db, active_only, vendor_type)


@router.post("/vendors", response_model=VendorResponse, status_code=201)
async def create_vendor(data: VendorCreate, db: AsyncSession = Depends(get_db)):
    return await feed_service.create_vendor(db, data)


@router.put("/vendors/{vendor_id}", response_model=VendorResponse)
async def update_vendor(vendor_id: str, data: VendorUpdate, db: AsyncSession = Depends(get_db)):
    result = await feed_service.update_vendor(db, vendor_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return result


# ── Feed Deliveries ──

@router.get("/deliveries", response_model=List[FeedDeliveryResponse])
async def list_deliveries(
    barn_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await feed_service.get_feed_deliveries(db, barn_id)


@router.post("/deliveries", response_model=FeedDeliveryResponse, status_code=201)
async def create_delivery(data: FeedDeliveryCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await feed_service.create_feed_delivery(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/inventory")
async def feed_inventory(db: AsyncSession = Depends(get_db)):
    return await feed_service.get_feed_inventory(db)


@router.get("/conversion", response_model=List[FeedConversionEntry])
async def feed_conversion(db: AsyncSession = Depends(get_db)):
    return await feed_service.get_feed_conversion(db)


# ── Medications ──

@router.get("/medications", response_model=List[MedicationResponse])
async def list_medications(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    return await feed_service.get_medications(db, active_only)


@router.post("/medications", response_model=MedicationResponse, status_code=201)
async def create_medication(data: MedicationCreate, db: AsyncSession = Depends(get_db)):
    return await feed_service.create_medication(db, data)


@router.put("/medications/{med_id}", response_model=MedicationResponse)
async def update_medication(med_id: str, data: MedicationUpdate, db: AsyncSession = Depends(get_db)):
    result = await feed_service.update_medication(db, med_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Medication not found")
    return result


@router.post("/medications/administer", response_model=MedicationAdminResponse, status_code=201)
async def administer_medication(data: MedicationAdminCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await feed_service.administer_medication(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/medications/admins", response_model=List[MedicationAdminResponse])
async def list_admins(
    flock_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await feed_service.get_medication_admins(db, flock_id)


# ── Purchase Orders ──

@router.get("/purchase-orders", response_model=List[PurchaseOrderResponse])
async def list_purchase_orders(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await feed_service.get_purchase_orders(db, status)


@router.post("/purchase-orders", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(data: PurchaseOrderCreate, db: AsyncSession = Depends(get_db)):
    try:
        return await feed_service.create_purchase_order(db, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/purchase-orders/{po_id}/status", response_model=PurchaseOrderResponse)
async def update_po_status(po_id: str, data: POStatusUpdate, db: AsyncSession = Depends(get_db)):
    result = await feed_service.update_po_status(db, po_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return result
