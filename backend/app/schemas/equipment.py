from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# ── Equipment CRUD ──

class EquipmentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    equipment_type: str = Field(..., pattern="^(truck|trailer)$")
    capacity_skids: int = Field(0, ge=0)
    weight_limit_lbs: Optional[float] = Field(None, ge=0)
    license_plate: Optional[str] = None
    notes: Optional[str] = None


class EquipmentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    capacity_skids: Optional[int] = Field(None, ge=0)
    weight_limit_lbs: Optional[float] = Field(None, ge=0)
    license_plate: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class EquipmentResponse(BaseModel):
    id: str
    equipment_number: str
    name: str
    equipment_type: str
    capacity_skids: int
    weight_limit_lbs: Optional[float]
    license_plate: Optional[str]
    hooked_to_id: Optional[str]
    hooked_to_name: str = ""
    hooked_trailer_id: Optional[str] = None
    hooked_trailer_name: str = ""
    hooked_trailer_capacity: int = 0
    hooked_trailer_weight_limit: Optional[float] = None
    current_barn_id: Optional[str]
    current_barn_name: str = ""
    is_active: bool
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Hook / Park requests ──

class HookTrailerRequest(BaseModel):
    trailer_id: str = Field(..., min_length=1)


class ParkTrailerRequest(BaseModel):
    barn_id: Optional[str] = None
