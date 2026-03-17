from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, Text, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
from decimal import Decimal
import enum

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class PickupStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ShipmentStatus(str, enum.Enum):
    PENDING = "pending"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class ReturnStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSED = "processed"
    CANCELLED = "cancelled"


class Driver(Base, TimestampMixin):
    """A driver who picks up and delivers eggs."""
    __tablename__ = "drivers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    driver_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    email: Mapped[Optional[str]] = mapped_column(String(200))
    license_number: Mapped[Optional[str]] = mapped_column(String(100))
    truck_type: Mapped[Optional[str]] = mapped_column(String(100))
    truck_plate: Mapped[Optional[str]] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    pickup_jobs: Mapped[List["PickupJob"]] = relationship("PickupJob", back_populates="driver")


class Carrier(Base, TimestampMixin):
    """A freight carrier / trucking company for outbound shipments."""
    __tablename__ = "carriers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    contact_name: Mapped[Optional[str]] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    email: Mapped[Optional[str]] = mapped_column(String(200))
    rate_per_mile: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    flat_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    shipments: Mapped[List["Shipment"]] = relationship("Shipment", back_populates="carrier_ref")


class PickupJob(Base, TimestampMixin):
    """A pickup job for the driver to collect eggs from barns."""
    __tablename__ = "pickup_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    pickup_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    scheduled_date: Mapped[str] = mapped_column(String(10), nullable=False)
    driver_name: Mapped[Optional[str]] = mapped_column(String(200))
    driver_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("drivers.id"), index=True)
    status: Mapped[PickupStatus] = mapped_column(default=PickupStatus.PENDING)
    completed_date: Mapped[Optional[str]] = mapped_column(String(10))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    items: Mapped[List["PickupItem"]] = relationship("PickupItem", back_populates="pickup_job", cascade="all, delete-orphan")
    driver: Mapped[Optional["Driver"]] = relationship("Driver", back_populates="pickup_jobs")


class PickupItem(Base, TimestampMixin):
    """Individual barn pickup within a job."""
    __tablename__ = "pickup_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    pickup_job_id: Mapped[str] = mapped_column(String(36), ForeignKey("pickup_jobs.id"), nullable=False, index=True)
    barn_id: Mapped[str] = mapped_column(String(36), ForeignKey("barns.id"), nullable=False, index=True)
    flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    skids_estimated: Mapped[int] = mapped_column(Integer, default=0)
    skids_actual: Mapped[Optional[int]] = mapped_column(Integer)
    grade: Mapped[Optional[str]] = mapped_column(String(50))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    pickup_job: Mapped["PickupJob"] = relationship("PickupJob", back_populates="items")
    barn: Mapped["Barn"] = relationship("Barn")
    flock: Mapped["Flock"] = relationship("Flock")


class Shipment(Base, TimestampMixin):
    """Outbound shipment from the egg warehouse with BOL."""
    __tablename__ = "shipments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    shipment_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    bol_number: Mapped[str] = mapped_column(String(100), nullable=False)
    contract_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("egg_contracts.id"), index=True)
    ship_date: Mapped[str] = mapped_column(String(10), nullable=False)
    buyer: Mapped[str] = mapped_column(String(200), nullable=False)
    carrier: Mapped[Optional[str]] = mapped_column(String(200))
    carrier_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("carriers.id"), index=True)
    destination: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[ShipmentStatus] = mapped_column(default=ShipmentStatus.PENDING)
    freight_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    delivered_date: Mapped[Optional[str]] = mapped_column(String(10))
    signed_by: Mapped[Optional[str]] = mapped_column(String(200))
    pod_notes: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    lines: Mapped[List["ShipmentLine"]] = relationship("ShipmentLine", back_populates="shipment", cascade="all, delete-orphan")
    contract: Mapped[Optional["EggContract"]] = relationship("EggContract")
    carrier_ref: Mapped[Optional["Carrier"]] = relationship("Carrier", back_populates="shipments")


class ShipmentLine(Base, TimestampMixin):
    """Line item within a shipment."""
    __tablename__ = "shipment_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    shipment_id: Mapped[str] = mapped_column(String(36), ForeignKey("shipments.id"), nullable=False, index=True)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"), index=True)
    grade: Mapped[str] = mapped_column(String(50), nullable=False)
    skids: Mapped[int] = mapped_column(Integer, nullable=False)
    dozens_per_skid: Mapped[int] = mapped_column(Integer, default=900)
    price_per_dozen: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 4))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    shipment: Mapped["Shipment"] = relationship("Shipment", back_populates="lines")
    flock: Mapped[Optional["Flock"]] = relationship("Flock")


class EggReturn(Base, TimestampMixin):
    """Eggs returned/rejected by a buyer, re-entered into inventory."""
    __tablename__ = "egg_returns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    return_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    shipment_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("shipments.id"), index=True)
    return_date: Mapped[str] = mapped_column(String(10), nullable=False)
    buyer: Mapped[str] = mapped_column(String(200), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[ReturnStatus] = mapped_column(default=ReturnStatus.PENDING)
    processed_date: Mapped[Optional[str]] = mapped_column(String(10))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    shipment: Mapped[Optional["Shipment"]] = relationship("Shipment")
    lines: Mapped[List["EggReturnLine"]] = relationship("EggReturnLine", back_populates="egg_return", cascade="all, delete-orphan")


class EggReturnLine(Base, TimestampMixin):
    """Line item within an egg return."""
    __tablename__ = "egg_return_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    egg_return_id: Mapped[str] = mapped_column(String(36), ForeignKey("egg_returns.id"), nullable=False, index=True)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"), index=True)
    grade: Mapped[str] = mapped_column(String(50), nullable=False)
    skids: Mapped[int] = mapped_column(Integer, nullable=False)
    dozens_per_skid: Mapped[int] = mapped_column(Integer, default=900)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    egg_return: Mapped["EggReturn"] = relationship("EggReturn", back_populates="lines")
    flock: Mapped[Optional["Flock"]] = relationship("Flock")
