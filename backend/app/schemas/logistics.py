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
    destination: Optional[str] = None
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
    destination: Optional[str]
    status: str
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
