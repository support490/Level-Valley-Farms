from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date


def _validate_date_str(v: str, field_name: str) -> str:
    if not v:
        raise ValueError(f"{field_name} is required")
    try:
        date.fromisoformat(v)
    except (ValueError, TypeError):
        raise ValueError(f"{field_name} must be a valid date in YYYY-MM-DD format")
    return v


# ── Drivers ──

class DriverCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = None
    email: Optional[str] = None
    license_number: Optional[str] = None
    truck_type: Optional[str] = None
    truck_plate: Optional[str] = None
    notes: Optional[str] = None


class DriverUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    phone: Optional[str] = None
    email: Optional[str] = None
    license_number: Optional[str] = None
    truck_type: Optional[str] = None
    truck_plate: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class DriverResponse(BaseModel):
    id: str
    driver_number: str
    name: str
    phone: Optional[str]
    email: Optional[str]
    license_number: Optional[str]
    truck_type: Optional[str]
    truck_plate: Optional[str]
    is_active: bool
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Carriers ──

class CarrierCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    rate_per_mile: Optional[float] = Field(None, ge=0)
    flat_rate: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class CarrierUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    rate_per_mile: Optional[float] = Field(None, ge=0)
    flat_rate: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class CarrierResponse(BaseModel):
    id: str
    name: str
    contact_name: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    rate_per_mile: Optional[float]
    flat_rate: Optional[float]
    notes: Optional[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Pickup Jobs ──

class PickupItemCreate(BaseModel):
    barn_id: str = Field(..., min_length=1)
    flock_id: str = Field(..., min_length=1)
    skids_estimated: int = Field(..., ge=0)
    notes: Optional[str] = None


class PickupItemComplete(BaseModel):
    """Used when completing a pickup - driver sets actual skids and grade."""
    item_id: str = Field(..., min_length=1)
    skids_actual: int = Field(..., ge=0)
    grade: str = Field(..., min_length=1)


class PickupJobCreate(BaseModel):
    scheduled_date: str
    driver_name: Optional[str] = None
    driver_id: Optional[str] = None
    notes: Optional[str] = None
    items: List[PickupItemCreate] = Field(..., min_length=1)

    @field_validator("scheduled_date")
    @classmethod
    def validate_date(cls, v):
        return _validate_date_str(v, "scheduled_date")


class PickupItemResponse(BaseModel):
    id: str
    pickup_job_id: str
    barn_id: str
    barn_name: str = ""
    flock_id: str
    flock_number: str = ""
    skids_estimated: int
    skids_actual: Optional[int]
    grade: Optional[str]
    grade_label: str = ""
    notes: Optional[str]

    model_config = {"from_attributes": True}


class PickupJobResponse(BaseModel):
    id: str
    pickup_number: str
    scheduled_date: str
    driver_name: Optional[str]
    driver_id: Optional[str]
    driver: Optional[DriverResponse] = None
    status: str
    completed_date: Optional[str]
    notes: Optional[str]
    items: List[PickupItemResponse] = []
    total_estimated_skids: int = 0
    total_actual_skids: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Shipments ──

class ShipmentLineCreate(BaseModel):
    flock_id: Optional[str] = None
    grade: str = Field(..., min_length=1)
    skids: int = Field(..., gt=0)
    dozens_per_skid: int = Field(900, gt=0)
    price_per_dozen: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = None


class ShipmentCreate(BaseModel):
    bol_number: str = Field(..., min_length=1, max_length=100)
    contract_id: Optional[str] = None
    ship_date: str
    buyer: str = Field(..., min_length=1, max_length=200)
    carrier: Optional[str] = None
    carrier_id: Optional[str] = None
    destination: Optional[str] = None
    freight_cost: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None
    lines: List[ShipmentLineCreate] = Field(..., min_length=1)

    @field_validator("ship_date")
    @classmethod
    def validate_date(cls, v):
        return _validate_date_str(v, "ship_date")


class ShipmentLineResponse(BaseModel):
    id: str
    shipment_id: str
    flock_id: Optional[str]
    flock_number: str = ""
    grade: str
    grade_label: str = ""
    skids: int
    dozens_per_skid: int
    total_dozens: int = 0
    price_per_dozen: Optional[float]
    line_total: float = 0
    notes: Optional[str]

    model_config = {"from_attributes": True}


class ShipmentResponse(BaseModel):
    id: str
    shipment_number: str
    bol_number: str
    contract_id: Optional[str]
    contract_number: str = ""
    ship_date: str
    buyer: str
    carrier: Optional[str]
    carrier_id: Optional[str]
    carrier_name: str = ""
    destination: Optional[str]
    status: str
    freight_cost: Optional[float]
    delivered_date: Optional[str]
    signed_by: Optional[str]
    pod_notes: Optional[str]
    notes: Optional[str]
    lines: List[ShipmentLineResponse] = []
    total_skids: int = 0
    total_dozens: int = 0
    total_amount: float = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class ShipmentStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v not in ("pending", "shipped", "delivered", "cancelled"):
            raise ValueError("status must be one of: pending, shipped, delivered, cancelled")
        return v


class DeliveryConfirmation(BaseModel):
    delivered_date: str
    signed_by: Optional[str] = None
    pod_notes: Optional[str] = None

    @field_validator("delivered_date")
    @classmethod
    def validate_date(cls, v):
        return _validate_date_str(v, "delivered_date")


# ── Egg Returns ──

class EggReturnLineCreate(BaseModel):
    flock_id: Optional[str] = None
    grade: str = Field(..., min_length=1)
    skids: int = Field(..., gt=0)
    dozens_per_skid: int = Field(900, gt=0)
    notes: Optional[str] = None


class EggReturnCreate(BaseModel):
    shipment_id: Optional[str] = None
    return_date: str
    buyer: str = Field(..., min_length=1, max_length=200)
    reason: Optional[str] = None
    notes: Optional[str] = None
    lines: List[EggReturnLineCreate] = Field(..., min_length=1)

    @field_validator("return_date")
    @classmethod
    def validate_date(cls, v):
        return _validate_date_str(v, "return_date")


class EggReturnLineResponse(BaseModel):
    id: str
    egg_return_id: str
    flock_id: Optional[str]
    flock_number: str = ""
    grade: str
    grade_label: str = ""
    skids: int
    dozens_per_skid: int
    total_dozens: int = 0
    notes: Optional[str]

    model_config = {"from_attributes": True}


class EggReturnResponse(BaseModel):
    id: str
    return_number: str
    shipment_id: Optional[str]
    shipment_number: str = ""
    return_date: str
    buyer: str
    reason: Optional[str]
    status: str
    processed_date: Optional[str]
    notes: Optional[str]
    lines: List[EggReturnLineResponse] = []
    total_skids: int = 0
    total_dozens: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}
