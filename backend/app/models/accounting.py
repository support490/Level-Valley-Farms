from sqlalchemy import String, Integer, Float, Boolean, ForeignKey, Text, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
from decimal import Decimal
import enum

from app.db.database import Base
from app.models.base import TimestampMixin, generate_uuid


class AccountType(str, enum.Enum):
    ASSET = "asset"
    LIABILITY = "liability"
    EQUITY = "equity"
    REVENUE = "revenue"
    EXPENSE = "expense"


class ExpenseCategory(str, enum.Enum):
    FEED = "feed"
    GROWER_PAYMENT = "grower_payment"
    FLOCK_COST = "flock_cost"
    VETERINARY = "veterinary"
    SERVICE = "service"
    CHICK_PURCHASE = "chick_purchase"
    TRANSPORT = "transport"
    UTILITIES = "utilities"
    OTHER = "other"


class Account(Base, TimestampMixin):
    """Chart of Accounts - double-entry accounting."""
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    account_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    account_type: Mapped[AccountType] = mapped_column(nullable=False)
    parent_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("accounts.id"))
    description: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    balance: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))

    parent: Mapped[Optional["Account"]] = relationship("Account", remote_side="Account.id")
    debit_entries: Mapped[List["JournalLine"]] = relationship(
        "JournalLine", back_populates="account", foreign_keys="JournalLine.account_id"
    )


class JournalEntry(Base, TimestampMixin):
    """A journal entry (transaction) in the double-entry system."""
    __tablename__ = "journal_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    entry_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    entry_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"), index=True)
    expense_category: Mapped[Optional[ExpenseCategory]] = mapped_column()
    reference: Mapped[Optional[str]] = mapped_column(String(200))
    is_posted: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    flock: Mapped[Optional["Flock"]] = relationship("Flock", back_populates="expenses")
    lines: Mapped[List["JournalLine"]] = relationship("JournalLine", back_populates="journal_entry", cascade="all, delete-orphan")


class JournalLine(Base, TimestampMixin):
    """Individual debit/credit line in a journal entry."""
    __tablename__ = "journal_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    journal_entry_id: Mapped[str] = mapped_column(String(36), ForeignKey("journal_entries.id"), nullable=False, index=True)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False, index=True)
    debit: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    credit: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    description: Mapped[Optional[str]] = mapped_column(String(500))

    journal_entry: Mapped["JournalEntry"] = relationship("JournalEntry", back_populates="lines")
    account: Mapped["Account"] = relationship("Account", back_populates="debit_entries")
