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


# ── Vendors ──

class VendorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    vendor_type: str = "other"
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class VendorUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    vendor_type: Optional[str] = None
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class VendorResponse(BaseModel):
    id: str
    name: str
    vendor_type: str
    contact_name: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Feed Deliveries ──

class FeedDeliveryCreate(BaseModel):
    ticket_number: str = Field(..., min_length=1)
    barn_id: str = Field(..., min_length=1)
    flock_id: Optional[str] = None
    vendor_id: Optional[str] = None
    delivery_date: str
    feed_type: str = "layer"
    tons: float = Field(..., gt=0)
    cost_per_ton: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None

    @field_validator("delivery_date")
    @classmethod
    def validate_date(cls, v):
        return _validate_date_str(v, "delivery_date")


class FeedDeliveryResponse(BaseModel):
    id: str
    ticket_number: str
    barn_id: str
    barn_name: str = ""
    flock_id: Optional[str]
    flock_number: str = ""
    vendor_id: Optional[str]
    vendor_name: str = ""
    delivery_date: str
    feed_type: str
    tons: float
    cost_per_ton: Optional[float]
    total_cost: Optional[float]
    notes: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Medications ──

class MedicationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    unit: str = "dose"
    quantity_on_hand: float = 0
    reorder_level: Optional[float] = None
    cost_per_unit: Optional[float] = None
    vendor_id: Optional[str] = None
    notes: Optional[str] = None


class MedicationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    unit: Optional[str] = None
    quantity_on_hand: Optional[float] = None
    reorder_level: Optional[float] = None
    cost_per_unit: Optional[float] = None
    vendor_id: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class MedicationResponse(BaseModel):
    id: str
    name: str
    unit: str
    quantity_on_hand: float
    reorder_level: Optional[float]
    cost_per_unit: Optional[float]
    vendor_id: Optional[str]
    vendor_name: str = ""
    notes: Optional[str]
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class MedicationAdminCreate(BaseModel):
    flock_id: str = Field(..., min_length=1)
    medication_id: str = Field(..., min_length=1)
    admin_date: str
    dosage: float = Field(..., gt=0)
    administered_by: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("admin_date")
    @classmethod
    def validate_date(cls, v):
        return _validate_date_str(v, "admin_date")


class MedicationAdminResponse(BaseModel):
    id: str
    flock_id: str
    flock_number: str = ""
    medication_id: str
    medication_name: str = ""
    admin_date: str
    dosage: float
    administered_by: Optional[str]
    notes: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Purchase Orders ──

class POLineCreate(BaseModel):
    description: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0)
    unit: str = "each"
    unit_price: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class PurchaseOrderCreate(BaseModel):
    vendor_id: str = Field(..., min_length=1)
    order_date: str
    expected_date: Optional[str] = None
    notes: Optional[str] = None
    lines: List[POLineCreate] = Field(..., min_length=1)

    @field_validator("order_date")
    @classmethod
    def validate_date(cls, v):
        return _validate_date_str(v, "order_date")


class POStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v not in ("draft", "submitted", "approved", "received", "cancelled"):
            raise ValueError("Invalid PO status")
        return v


class POLineResponse(BaseModel):
    id: str
    po_id: str
    description: str
    quantity: float
    unit: str
    unit_price: Optional[float]
    total: Optional[float]
    notes: Optional[str]
    model_config = {"from_attributes": True}


class PurchaseOrderResponse(BaseModel):
    id: str
    po_number: str
    vendor_id: str
    vendor_name: str = ""
    order_date: str
    expected_date: Optional[str]
    status: str
    total_amount: Optional[float]
    notes: Optional[str]
    lines: List[POLineResponse] = []
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Feed Conversion ──

class FeedConversionEntry(BaseModel):
    flock_id: str
    flock_number: str
    total_feed_tons: float
    total_feed_lbs: float
    total_eggs: int
    total_dozens: float
    feed_conversion: float  # lbs per dozen
    feed_cost_per_dozen: float
