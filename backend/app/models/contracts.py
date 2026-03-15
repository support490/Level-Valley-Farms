from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, Text, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
from decimal import Decimal

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class EggContract(Base, TimestampMixin):
    """Egg sale contracts that can be assigned to flocks."""
    __tablename__ = "egg_contracts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    contract_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    buyer: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    num_flocks: Mapped[int] = mapped_column(Integer, default=1)
    start_date: Mapped[Optional[str]] = mapped_column(String(10))
    end_date: Mapped[Optional[str]] = mapped_column(String(10))
    price_per_dozen: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    grade: Mapped[Optional[str]] = mapped_column(String(50))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    assignments: Mapped[List["ContractFlockAssignment"]] = relationship(
        "ContractFlockAssignment", back_populates="contract", cascade="all, delete-orphan"
    )


class ContractFlockAssignment(Base, TimestampMixin):
    """Links a contract to a flock."""
    __tablename__ = "contract_flock_assignments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    contract_id: Mapped[str] = mapped_column(String(36), ForeignKey("egg_contracts.id"), nullable=False, index=True)
    flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)

    contract: Mapped["EggContract"] = relationship("EggContract", back_populates="assignments")
    flock: Mapped["Flock"] = relationship("Flock")
