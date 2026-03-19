from sqlalchemy import String, Integer, Float, ForeignKey, Text, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from decimal import Decimal
import enum

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class EggGrade(Base, TimestampMixin):
    """Configurable egg grade options."""
    __tablename__ = "egg_grades"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    value: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Integer, default=True)


class EggInventory(Base, TimestampMixin):
    """Egg inventory at Level Valley. Units are skids (900 dozen per skid)."""
    __tablename__ = "egg_inventory"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    record_date: Mapped[str] = mapped_column(String(10), nullable=False)
    grade: Mapped[str] = mapped_column(String(50), nullable=False)
    skids_in: Mapped[int] = mapped_column(Integer, default=0)
    skids_out: Mapped[int] = mapped_column(Integer, default=0)
    skids_on_hand: Mapped[int] = mapped_column(Integer, default=0)
    dozens_per_skid: Mapped[int] = mapped_column(Integer, default=900)
    weight_per_skid: Mapped[Optional[float]] = mapped_column(Float)
    production_period_start: Mapped[Optional[str]] = mapped_column(String(10))
    production_period_end: Mapped[Optional[str]] = mapped_column(String(10))
    weekly_record_id: Mapped[Optional[str]] = mapped_column(String(36))
    condition: Mapped[Optional[str]] = mapped_column(String(50))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class EggSale(Base, TimestampMixin):
    """Egg sale records."""
    __tablename__ = "egg_sales"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    sale_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    buyer: Mapped[str] = mapped_column(String(200), nullable=False)
    grade: Mapped[str] = mapped_column(String(50), nullable=False)
    skids_sold: Mapped[int] = mapped_column(Integer, nullable=False)
    price_per_dozen: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"), index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
