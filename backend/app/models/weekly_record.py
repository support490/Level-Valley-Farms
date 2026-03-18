import enum
from typing import Optional, List

from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class WeeklyRecordStatus(str, enum.Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"


class WeeklyRecord(Base, TimestampMixin):
    """Weekly grower layer record — header with computed summaries."""
    __tablename__ = "weekly_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    barn_id: Mapped[str] = mapped_column(String(36), ForeignKey("barns.id"), nullable=False, index=True)
    grower_name: Mapped[str] = mapped_column(String(200), nullable=False)
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)
    end_date: Mapped[str] = mapped_column(String(10), nullable=False)
    starting_bird_count: Mapped[int] = mapped_column(Integer, nullable=False)
    ending_bird_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bird_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[WeeklyRecordStatus] = mapped_column(default=WeeklyRecordStatus.DRAFT)
    comments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Computed summary fields
    percent_production: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    gallons_per_100_birds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_case_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_temp_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_temp_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_mortality: Mapped[int] = mapped_column(Integer, default=0)
    total_culls: Mapped[int] = mapped_column(Integer, default=0)
    total_egg_production: Mapped[int] = mapped_column(Integer, default=0)
    total_water_gallons: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_lbs_feed_day: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_lbs_per_100: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    end_feed_inventory: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_feed_delivered: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    barn_egg_inventory: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Relationships
    production_logs: Mapped[List["WeeklyProductionLog"]] = relationship(
        "WeeklyProductionLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )
    feed_logs: Mapped[List["WeeklyFeedLog"]] = relationship(
        "WeeklyFeedLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )
    fly_logs: Mapped[List["FlyLog"]] = relationship(
        "FlyLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )
    rodent_logs: Mapped[List["RodentLog"]] = relationship(
        "RodentLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )
    foot_bath_logs: Mapped[List["FootBathLog"]] = relationship(
        "FootBathLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )
    ammonia_logs: Mapped[List["AmmoniaLog"]] = relationship(
        "AmmoniaLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )
    generator_logs: Mapped[List["GeneratorLog"]] = relationship(
        "GeneratorLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )
    eggs_shipped_logs: Mapped[List["EggsShippedLog"]] = relationship(
        "EggsShippedLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )
    alarm_check_logs: Mapped[List["AlarmCheckLog"]] = relationship(
        "AlarmCheckLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )
    pit_logs: Mapped[List["PitLog"]] = relationship(
        "PitLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )
    cooler_temp_logs: Mapped[List["CoolerTempLog"]] = relationship(
        "CoolerTempLog", back_populates="weekly_record", cascade="all, delete-orphan"
    )


class WeeklyProductionLog(Base, TimestampMixin):
    """Daily production entries within a weekly record."""
    __tablename__ = "weekly_production_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    day_name: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    initial_am: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    initial_pm: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    cull_count: Mapped[int] = mapped_column(Integer, default=0)
    cull_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    mortality_count: Mapped[int] = mapped_column(Integer, default=0)
    mortality_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    egg_production: Mapped[int] = mapped_column(Integer, default=0)
    egg_inventory: Mapped[int] = mapped_column(Integer, default=0)
    case_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temp_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temp_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    water_gallons: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="production_logs")


class WeeklyFeedLog(Base, TimestampMixin):
    """Daily feed entries within a weekly record."""
    __tablename__ = "weekly_feed_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    lbs_feed_day: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lbs_per_100: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    feed_inventory: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    feed_delivered: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    outdoor_access: Mapped[bool] = mapped_column(Boolean, default=False)
    outdoor_access_hours: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    outside_temp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    initial: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    no_access_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="feed_logs")


class FlyLog(Base, TimestampMixin):
    __tablename__ = "fly_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    initial: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    fly_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    corrective_action: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="fly_logs")


class RodentLog(Base, TimestampMixin):
    __tablename__ = "rodent_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    initial: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    mice_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    brand_active_ingredient: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    rodent_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="rodent_logs")


class FootBathLog(Base, TimestampMixin):
    __tablename__ = "foot_bath_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    initial: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    brand: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    amount_ratio: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="foot_bath_logs")


class AmmoniaLog(Base, TimestampMixin):
    __tablename__ = "ammonia_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    initial: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    ppm: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    corrective_action: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="ammonia_logs")


class GeneratorLog(Base, TimestampMixin):
    __tablename__ = "generator_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    initial: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    hour_meter: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="generator_logs")


class EggsShippedLog(Base, TimestampMixin):
    __tablename__ = "eggs_shipped_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    dozens: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="eggs_shipped_logs")


class AlarmCheckLog(Base, TimestampMixin):
    __tablename__ = "alarm_check_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    initial: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    results: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    corrective_action: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="alarm_check_logs")


class PitLog(Base, TimestampMixin):
    __tablename__ = "pit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    initial: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    bird_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    corrective_action: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="pit_logs")


class CoolerTempLog(Base, TimestampMixin):
    __tablename__ = "cooler_temp_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    weekly_record_id: Mapped[str] = mapped_column(String(36), ForeignKey("weekly_records.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    initial: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    temp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    corrective_action: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    weekly_record: Mapped["WeeklyRecord"] = relationship("WeeklyRecord", back_populates="cooler_temp_logs")
