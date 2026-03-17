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


class RecurringFrequency(str, enum.Enum):
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUALLY = "annually"


class RecurringEntry(Base, TimestampMixin):
    """Template for recurring journal entries that auto-generate."""
    __tablename__ = "recurring_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    frequency: Mapped[RecurringFrequency] = mapped_column(nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    expense_account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False)
    payment_account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))
    expense_category: Mapped[Optional[ExpenseCategory]] = mapped_column()
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)
    end_date: Mapped[Optional[str]] = mapped_column(String(10))
    last_generated_date: Mapped[Optional[str]] = mapped_column(String(10))
    next_due_date: Mapped[Optional[str]] = mapped_column(String(10))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_post: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    expense_account: Mapped["Account"] = relationship("Account", foreign_keys=[expense_account_id])
    payment_account: Mapped["Account"] = relationship("Account", foreign_keys=[payment_account_id])


class FiscalPeriod(Base, TimestampMixin):
    """Fiscal period (month) for period-based closing."""
    __tablename__ = "fiscal_periods"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    period_name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)
    end_date: Mapped[str] = mapped_column(String(10), nullable=False)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    closed_date: Mapped[Optional[str]] = mapped_column(String(10))
    closed_by: Mapped[Optional[str]] = mapped_column(String(100))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class BillStatus(str, enum.Enum):
    DRAFT = "draft"
    RECEIVED = "received"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class InvoiceStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class PaymentMethod(str, enum.Enum):
    CHECK = "check"
    ACH = "ach"
    WIRE = "wire"
    CASH = "cash"
    CREDIT_CARD = "credit_card"
    OTHER = "other"


class Bill(Base, TimestampMixin):
    """An accounts payable bill from a vendor."""
    __tablename__ = "bills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    bill_number: Mapped[str] = mapped_column(String(100), nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    vendor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("vendors.id"), index=True)
    bill_date: Mapped[str] = mapped_column(String(10), nullable=False)
    due_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    status: Mapped[BillStatus] = mapped_column(default=BillStatus.RECEIVED)
    description: Mapped[Optional[str]] = mapped_column(Text)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"), index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    payments: Mapped[List["BillPayment"]] = relationship("BillPayment", back_populates="bill", cascade="all, delete-orphan")


class BillPayment(Base, TimestampMixin):
    """A payment against a bill."""
    __tablename__ = "bill_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    bill_id: Mapped[str] = mapped_column(String(36), ForeignKey("bills.id"), nullable=False, index=True)
    payment_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(default=PaymentMethod.CHECK)
    reference: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    bill: Mapped["Bill"] = relationship("Bill", back_populates="payments")


class CustomerInvoice(Base, TimestampMixin):
    """An accounts receivable invoice to a customer."""
    __tablename__ = "customer_invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    invoice_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    buyer: Mapped[str] = mapped_column(String(200), nullable=False)
    buyer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("buyers.id"), index=True)
    shipment_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("shipments.id"), index=True)
    invoice_date: Mapped[str] = mapped_column(String(10), nullable=False)
    due_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"))
    status: Mapped[InvoiceStatus] = mapped_column(default=InvoiceStatus.SENT)
    description: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class BankAccount(Base, TimestampMixin):
    """A bank account for tracking cash."""
    __tablename__ = "bank_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    account_number_last4: Mapped[Optional[str]] = mapped_column(String(4))
    bank_name: Mapped[Optional[str]] = mapped_column(String(200))
    account_type: Mapped[str] = mapped_column(String(50), default="checking")
    balance: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)


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
