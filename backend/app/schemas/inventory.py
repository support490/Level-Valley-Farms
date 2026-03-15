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


# ── Egg Grades ──

class EggGradeCreate(BaseModel):
    value: str = Field(..., min_length=1, max_length=50)
    label: str = Field(..., min_length=1, max_length=100)
    sort_order: int = 0

    @field_validator("value", mode="before")
    @classmethod
    def normalize_value(cls, v):
        if isinstance(v, str):
            v = v.strip().lower().replace(" ", "_")
            if not v:
                raise ValueError("Value cannot be empty")
        return v


class EggGradeResponse(BaseModel):
    id: str
    value: str
    label: str
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


# ── Inventory ──

class EggInventoryCreate(BaseModel):
    flock_id: str = Field(..., min_length=1)
    record_date: str
    grade: str = Field(..., min_length=1)
    skids_in: int = Field(0, ge=0)
    skids_out: int = Field(0, ge=0)
    dozens_per_skid: int = Field(900, gt=0, le=5000)
    notes: Optional[str] = None

    @field_validator("record_date")
    @classmethod
    def validate_record_date(cls, v):
        return _validate_date_str(v, "record_date")

    @field_validator("skids_out")
    @classmethod
    def validate_not_both_zero(cls, v, info):
        skids_in = info.data.get("skids_in", 0)
        if skids_in == 0 and v == 0:
            raise ValueError("Must specify at least skids_in or skids_out")
        return v


class EggInventoryResponse(BaseModel):
    id: str
    flock_id: str
    flock_number: str = ""
    record_date: str
    grade: str
    grade_label: str = ""
    skids_in: int
    skids_out: int
    skids_on_hand: int
    dozens_per_skid: int
    dozens_on_hand: int = 0
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class InventorySummary(BaseModel):
    grade: str
    grade_label: str = ""
    total_skids_on_hand: int
    total_dozens: int


class EggSaleCreate(BaseModel):
    flock_id: str = Field(..., min_length=1)
    sale_date: str
    buyer: str = Field(..., min_length=1, max_length=200)
    grade: str = Field(..., min_length=1)
    skids_sold: int = Field(..., gt=0)
    price_per_dozen: float = Field(..., gt=0)
    notes: Optional[str] = None

    @field_validator("sale_date")
    @classmethod
    def validate_sale_date(cls, v):
        return _validate_date_str(v, "sale_date")

    @field_validator("price_per_dozen", mode="before")
    @classmethod
    def round_price(cls, v):
        try:
            val = float(v)
        except (TypeError, ValueError):
            raise ValueError("price_per_dozen must be a valid number")
        if val <= 0:
            raise ValueError("price_per_dozen must be greater than zero")
        return round(val, 2)


class EggSaleResponse(BaseModel):
    id: str
    flock_id: str
    flock_number: str = ""
    sale_date: str
    buyer: str
    grade: str
    grade_label: str = ""
    skids_sold: int
    price_per_dozen: float
    total_amount: float
    journal_entry_id: Optional[str]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
