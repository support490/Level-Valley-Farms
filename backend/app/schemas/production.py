from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date


class ProductionCreate(BaseModel):
    flock_id: str = Field(..., min_length=1)
    record_date: str
    bird_count: int = Field(..., gt=0)
    egg_count: int = Field(..., ge=0)
    cracked: int = Field(0, ge=0)
    floor_eggs: int = Field(0, ge=0)
    notes: Optional[str] = None

    @field_validator("record_date")
    @classmethod
    def validate_record_date(cls, v):
        try:
            date.fromisoformat(v)
        except (ValueError, TypeError):
            raise ValueError("record_date must be a valid date in YYYY-MM-DD format")
        return v


class ProductionResponse(BaseModel):
    id: str
    flock_id: str
    flock_number: str = ""
    record_date: str
    bird_count: int
    egg_count: int
    production_pct: float
    cracked: int
    floor_eggs: int
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ProductionSummary(BaseModel):
    flock_id: str
    flock_number: str
    avg_production_pct: float
    peak_production_pct: float
    current_production_pct: float
    total_eggs: int
    total_days: int
    total_cracked: int
    total_floor_eggs: int


class ProductionDataPoint(BaseModel):
    record_date: str
    production_pct: float
    egg_count: int
    bird_count: int


class BulkProductionEntry(BaseModel):
    flock_id: str = Field(..., min_length=1)
    bird_count: int = Field(..., gt=0)
    egg_count: int = Field(..., ge=0)
    cracked: int = Field(0, ge=0)
    floor_eggs: int = Field(0, ge=0)
    notes: Optional[str] = None


class BulkProductionCreate(BaseModel):
    record_date: str
    entries: List[BulkProductionEntry]

    @field_validator("record_date")
    @classmethod
    def validate_record_date(cls, v):
        try:
            date.fromisoformat(v)
        except (ValueError, TypeError):
            raise ValueError("record_date must be a valid date in YYYY-MM-DD format")
        return v


class ProductionAlert(BaseModel):
    flock_id: str
    flock_number: str
    alert_type: str
    severity: str
    message: str
    current_value: float
    previous_value: Optional[float] = None
    threshold: Optional[float] = None
