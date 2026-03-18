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


# --- Sub-log entry schemas ---

class ProductionLogEntry(BaseModel):
    date: str
    day_name: Optional[str] = None
    initial_am: Optional[str] = None
    initial_pm: Optional[str] = None
    cull_count: int = 0
    cull_reason: Optional[str] = None
    mortality_count: int = 0
    mortality_reason: Optional[str] = None
    egg_production: int = 0
    egg_inventory: int = 0
    case_weight: Optional[float] = None
    temp_high: Optional[float] = None
    temp_low: Optional[float] = None
    water_gallons: Optional[float] = None


class FeedLogEntry(BaseModel):
    date: str
    lbs_feed_day: Optional[float] = None
    lbs_per_100: Optional[float] = None
    feed_inventory: Optional[float] = None
    feed_delivered: Optional[float] = None
    outdoor_access: bool = False
    outdoor_access_hours: Optional[float] = None
    outside_temp: Optional[float] = None
    initial: Optional[str] = None
    no_access_reason: Optional[str] = None


class FlyLogEntry(BaseModel):
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    fly_count: Optional[int] = None
    corrective_action: Optional[str] = None


class RodentLogEntry(BaseModel):
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    mice_count: Optional[int] = None
    brand_active_ingredient: Optional[str] = None
    rodent_index: Optional[int] = Field(None, ge=0, le=3)


class FootBathLogEntry(BaseModel):
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    brand: Optional[str] = None
    amount_ratio: Optional[str] = None


class AmmoniaLogEntry(BaseModel):
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    ppm: Optional[float] = None
    corrective_action: Optional[str] = None


class GeneratorLogEntry(BaseModel):
    date: str
    initial: Optional[str] = None
    hour_meter: Optional[float] = None


class EggsShippedLogEntry(BaseModel):
    date: str
    dozens: Optional[float] = None


class AlarmCheckLogEntry(BaseModel):
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    results: Optional[str] = None
    corrective_action: Optional[str] = None


class PitLogEntry(BaseModel):
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    bird_count: Optional[int] = None
    corrective_action: Optional[str] = None


class CoolerTempLogEntry(BaseModel):
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    temp: Optional[float] = None
    corrective_action: Optional[str] = None


# --- Create / Update schema ---

class WeeklyRecordCreate(BaseModel):
    flock_id: str = Field(..., min_length=1)
    barn_id: str = Field(..., min_length=1)
    grower_name: str = Field(..., min_length=1)
    start_date: str
    end_date: str
    starting_bird_count: int = Field(..., gt=0)
    bird_weight: Optional[float] = None
    status: str = "draft"
    comments: Optional[str] = None

    production_logs: List[ProductionLogEntry] = []
    feed_logs: List[FeedLogEntry] = []
    fly_logs: List[FlyLogEntry] = []
    rodent_logs: List[RodentLogEntry] = []
    foot_bath_logs: List[FootBathLogEntry] = []
    ammonia_logs: List[AmmoniaLogEntry] = []
    generator_logs: List[GeneratorLogEntry] = []
    eggs_shipped_logs: List[EggsShippedLogEntry] = []
    alarm_check_logs: List[AlarmCheckLogEntry] = []
    pit_logs: List[PitLogEntry] = []
    cooler_temp_logs: List[CoolerTempLogEntry] = []

    @field_validator("start_date")
    @classmethod
    def validate_start(cls, v):
        return _validate_date_str(v, "start_date")

    @field_validator("end_date")
    @classmethod
    def validate_end(cls, v):
        return _validate_date_str(v, "end_date")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        if v not in ("draft", "submitted"):
            raise ValueError("status must be 'draft' or 'submitted'")
        return v


class WeeklyRecordUpdate(BaseModel):
    grower_name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    starting_bird_count: Optional[int] = None
    bird_weight: Optional[float] = None
    status: Optional[str] = None
    comments: Optional[str] = None

    production_logs: Optional[List[ProductionLogEntry]] = None
    feed_logs: Optional[List[FeedLogEntry]] = None
    fly_logs: Optional[List[FlyLogEntry]] = None
    rodent_logs: Optional[List[RodentLogEntry]] = None
    foot_bath_logs: Optional[List[FootBathLogEntry]] = None
    ammonia_logs: Optional[List[AmmoniaLogEntry]] = None
    generator_logs: Optional[List[GeneratorLogEntry]] = None
    eggs_shipped_logs: Optional[List[EggsShippedLogEntry]] = None
    alarm_check_logs: Optional[List[AlarmCheckLogEntry]] = None
    pit_logs: Optional[List[PitLogEntry]] = None
    cooler_temp_logs: Optional[List[CoolerTempLogEntry]] = None


# --- Response schemas ---

class ProductionLogResponse(BaseModel):
    id: str
    date: str
    day_name: Optional[str] = None
    initial_am: Optional[str] = None
    initial_pm: Optional[str] = None
    cull_count: int = 0
    cull_reason: Optional[str] = None
    mortality_count: int = 0
    mortality_reason: Optional[str] = None
    egg_production: int = 0
    egg_inventory: int = 0
    case_weight: Optional[float] = None
    temp_high: Optional[float] = None
    temp_low: Optional[float] = None
    water_gallons: Optional[float] = None
    model_config = {"from_attributes": True}


class FeedLogResponse(BaseModel):
    id: str
    date: str
    lbs_feed_day: Optional[float] = None
    lbs_per_100: Optional[float] = None
    feed_inventory: Optional[float] = None
    feed_delivered: Optional[float] = None
    outdoor_access: bool = False
    outdoor_access_hours: Optional[float] = None
    outside_temp: Optional[float] = None
    initial: Optional[str] = None
    no_access_reason: Optional[str] = None
    model_config = {"from_attributes": True}


class FlyLogResponse(BaseModel):
    id: str
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    fly_count: Optional[int] = None
    corrective_action: Optional[str] = None
    model_config = {"from_attributes": True}


class RodentLogResponse(BaseModel):
    id: str
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    mice_count: Optional[int] = None
    brand_active_ingredient: Optional[str] = None
    rodent_index: Optional[int] = None
    model_config = {"from_attributes": True}


class FootBathLogResponse(BaseModel):
    id: str
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    brand: Optional[str] = None
    amount_ratio: Optional[str] = None
    model_config = {"from_attributes": True}


class AmmoniaLogResponse(BaseModel):
    id: str
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    ppm: Optional[float] = None
    corrective_action: Optional[str] = None
    model_config = {"from_attributes": True}


class GeneratorLogResponse(BaseModel):
    id: str
    date: str
    initial: Optional[str] = None
    hour_meter: Optional[float] = None
    model_config = {"from_attributes": True}


class EggsShippedLogResponse(BaseModel):
    id: str
    date: str
    dozens: Optional[float] = None
    model_config = {"from_attributes": True}


class AlarmCheckLogResponse(BaseModel):
    id: str
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    results: Optional[str] = None
    corrective_action: Optional[str] = None
    model_config = {"from_attributes": True}


class PitLogResponse(BaseModel):
    id: str
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    bird_count: Optional[int] = None
    corrective_action: Optional[str] = None
    model_config = {"from_attributes": True}


class CoolerTempLogResponse(BaseModel):
    id: str
    date: str
    time: Optional[str] = None
    initial: Optional[str] = None
    temp: Optional[float] = None
    corrective_action: Optional[str] = None
    model_config = {"from_attributes": True}


class WeeklyRecordResponse(BaseModel):
    id: str
    flock_id: str
    barn_id: str
    grower_name: str
    start_date: str
    end_date: str
    starting_bird_count: int
    ending_bird_count: int
    bird_weight: Optional[float] = None
    status: str
    comments: Optional[str] = None

    percent_production: Optional[float] = None
    gallons_per_100_birds: Optional[float] = None
    avg_case_weight: Optional[float] = None
    avg_temp_high: Optional[float] = None
    avg_temp_low: Optional[float] = None
    total_mortality: int = 0
    total_culls: int = 0
    total_egg_production: int = 0
    total_water_gallons: Optional[float] = None
    avg_lbs_feed_day: Optional[float] = None
    avg_lbs_per_100: Optional[float] = None
    end_feed_inventory: Optional[float] = None
    total_feed_delivered: Optional[float] = None
    barn_egg_inventory: Optional[int] = None

    created_at: datetime
    updated_at: datetime

    production_logs: List[ProductionLogResponse] = []
    feed_logs: List[FeedLogResponse] = []
    fly_logs: List[FlyLogResponse] = []
    rodent_logs: List[RodentLogResponse] = []
    foot_bath_logs: List[FootBathLogResponse] = []
    ammonia_logs: List[AmmoniaLogResponse] = []
    generator_logs: List[GeneratorLogResponse] = []
    eggs_shipped_logs: List[EggsShippedLogResponse] = []
    alarm_check_logs: List[AlarmCheckLogResponse] = []
    pit_logs: List[PitLogResponse] = []
    cooler_temp_logs: List[CoolerTempLogResponse] = []

    # Enriched fields
    flock_number: Optional[str] = None
    barn_name: Optional[str] = None

    model_config = {"from_attributes": True}


class WeeklyRecordListItem(BaseModel):
    id: str
    flock_id: str
    barn_id: str
    grower_name: str
    start_date: str
    end_date: str
    status: str
    starting_bird_count: int
    ending_bird_count: int
    percent_production: Optional[float] = None
    total_egg_production: int = 0
    total_mortality: int = 0
    total_culls: int = 0
    created_at: datetime
    flock_number: Optional[str] = None
    barn_name: Optional[str] = None

    model_config = {"from_attributes": True}
