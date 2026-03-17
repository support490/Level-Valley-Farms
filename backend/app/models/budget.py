from sqlalchemy import String, Integer, Boolean, ForeignKey, Text, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
from decimal import Decimal
import enum

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class DepreciationMethod(str, enum.Enum):
    STRAIGHT_LINE = "straight_line"
    DECLINING_BALANCE = "declining_balance"


class Budget(Base, TimestampMixin):
    """Annual budget with monthly breakdown by category."""
    __tablename__ = "budgets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    lines: Mapped[List["BudgetLine"]] = relationship("BudgetLine", back_populates="budget", cascade="all, delete-orphan")


class BudgetLine(Base, TimestampMixin):
    """A line item in a budget with monthly amounts."""
    __tablename__ = "budget_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    budget_id: Mapped[str] = mapped_column(String(36), ForeignKey("budgets.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    account_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("accounts.id"), index=True)
    annual_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    jan: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    feb: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    mar: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    apr: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    may: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    jun: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    jul: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    aug: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    sep: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    oct: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    nov: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    dec: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    budget: Mapped["Budget"] = relationship("Budget", back_populates="lines")


class DepreciationSchedule(Base, TimestampMixin):
    """Depreciation schedule for a fixed asset."""
    __tablename__ = "depreciation_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    asset_name: Mapped[str] = mapped_column(String(200), nullable=False)
    purchase_date: Mapped[str] = mapped_column(String(10), nullable=False)
    purchase_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    useful_life_months: Mapped[int] = mapped_column(Integer, nullable=False)
    salvage_value: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    method: Mapped[DepreciationMethod] = mapped_column(default=DepreciationMethod.STRAIGHT_LINE)
    monthly_depreciation: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    accumulated_depreciation: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
