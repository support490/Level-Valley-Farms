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


class CheckStatus(str, enum.Enum):
    PENDING = "pending"
    PRINTED = "printed"
    CLEARED = "cleared"
    VOIDED = "voided"


class Check(Base, TimestampMixin):
    """Standalone check transaction (QB Write Checks)."""
    __tablename__ = "checks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    check_number: Mapped[Optional[int]] = mapped_column(Integer)
    bank_account_id: Mapped[str] = mapped_column(String(36), ForeignKey("bank_accounts.id"), nullable=False)
    payee_name: Mapped[str] = mapped_column(String(200), nullable=False)
    payee_vendor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("vendors.id"))
    check_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text)
    memo: Mapped[Optional[str]] = mapped_column(Text)
    is_printed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_voided: Mapped[bool] = mapped_column(Boolean, default=False)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"))
    status: Mapped[CheckStatus] = mapped_column(default=CheckStatus.PENDING)

    expense_lines: Mapped[List["CheckExpenseLine"]] = relationship("CheckExpenseLine", back_populates="check", cascade="all, delete-orphan")
    item_lines: Mapped[List["CheckItemLine"]] = relationship("CheckItemLine", back_populates="check", cascade="all, delete-orphan")


class CheckExpenseLine(Base, TimestampMixin):
    """Expense tab split on a check."""
    __tablename__ = "check_expense_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    check_id: Mapped[str] = mapped_column(String(36), ForeignKey("checks.id"), nullable=False)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    memo: Mapped[Optional[str]] = mapped_column(String(500))
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))

    check: Mapped["Check"] = relationship("Check", back_populates="expense_lines")


class CheckItemLine(Base, TimestampMixin):
    """Items tab split on a check."""
    __tablename__ = "check_item_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    check_id: Mapped[str] = mapped_column(String(36), ForeignKey("checks.id"), nullable=False)
    item_description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 4), default=Decimal("1"))
    cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))

    check: Mapped["Check"] = relationship("Check", back_populates="item_lines")


class InvoiceLineItem(Base, TimestampMixin):
    """Line items on a customer invoice."""
    __tablename__ = "invoice_line_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("customer_invoices.id"), nullable=False)
    item_description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 4), default=Decimal("1"))
    unit_of_measure: Mapped[Optional[str]] = mapped_column(String(50))
    rate: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    account_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("accounts.id"))
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))

    invoice: Mapped["CustomerInvoice"] = relationship("CustomerInvoice", back_populates="line_items")


class BillExpenseLine(Base, TimestampMixin):
    """Expense tab split on a bill."""
    __tablename__ = "bill_expense_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    bill_id: Mapped[str] = mapped_column(String(36), ForeignKey("bills.id"), nullable=False)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    memo: Mapped[Optional[str]] = mapped_column(String(500))
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))

    bill: Mapped["Bill"] = relationship("Bill", back_populates="expense_lines")


class BillItemLine(Base, TimestampMixin):
    """Items tab split on a bill."""
    __tablename__ = "bill_item_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    bill_id: Mapped[str] = mapped_column(String(36), ForeignKey("bills.id"), nullable=False)
    item_description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 4), default=Decimal("1"))
    cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))

    bill: Mapped["Bill"] = relationship("Bill", back_populates="item_lines")


class CustomerPayment(Base, TimestampMixin):
    """QB Receive Payments — applies across multiple invoices."""
    __tablename__ = "customer_payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    buyer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("buyers.id"))
    payment_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(200))
    payment_method: Mapped[PaymentMethod] = mapped_column(default=PaymentMethod.CHECK)
    deposit_to_account_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("bank_accounts.id"))
    memo: Mapped[Optional[str]] = mapped_column(Text)

    applications: Mapped[List["CustomerPaymentApplication"]] = relationship(
        "CustomerPaymentApplication", back_populates="payment", cascade="all, delete-orphan"
    )


class CustomerPaymentApplication(Base, TimestampMixin):
    """Links a customer payment to specific invoices."""
    __tablename__ = "customer_payment_applications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    payment_id: Mapped[str] = mapped_column(String(36), ForeignKey("customer_payments.id"), nullable=False)
    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("customer_invoices.id"), nullable=False)
    amount_applied: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)

    payment: Mapped["CustomerPayment"] = relationship("CustomerPayment", back_populates="applications")


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
    terms: Mapped[Optional[str]] = mapped_column(String(50))
    ref_no: Mapped[Optional[str]] = mapped_column(String(100))
    discount_date: Mapped[Optional[str]] = mapped_column(String(10))
    discount_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2))

    payments: Mapped[List["BillPayment"]] = relationship("BillPayment", back_populates="bill", cascade="all, delete-orphan")
    expense_lines: Mapped[List["BillExpenseLine"]] = relationship("BillExpenseLine", back_populates="bill", cascade="all, delete-orphan")
    item_lines: Mapped[List["BillItemLine"]] = relationship("BillItemLine", back_populates="bill", cascade="all, delete-orphan")


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
    bank_account_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("bank_accounts.id"))

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
    ship_to_address: Mapped[Optional[str]] = mapped_column(Text)
    po_number: Mapped[Optional[str]] = mapped_column(String(100))
    terms: Mapped[Optional[str]] = mapped_column(String(50))
    ship_date: Mapped[Optional[str]] = mapped_column(String(10))
    ship_via: Mapped[Optional[str]] = mapped_column(String(100))
    customer_message: Mapped[Optional[str]] = mapped_column(Text)

    line_items: Mapped[List["InvoiceLineItem"]] = relationship("InvoiceLineItem", back_populates="invoice", cascade="all, delete-orphan")


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
    linked_account_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("accounts.id"))


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


class ItemType(str, enum.Enum):
    SERVICE = "Service"
    INVENTORY_PART = "Inventory Part"
    NON_INVENTORY_PART = "Non-inventory Part"
    OTHER_CHARGE = "Other Charge"


class Item(Base, TimestampMixin):
    """An item or service used on invoices, bills, and checks."""
    __tablename__ = "items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    item_type: Mapped[str] = mapped_column(String(50), default="Service")
    income_account: Mapped[Optional[str]] = mapped_column(String(200))
    expense_account: Mapped[Optional[str]] = mapped_column(String(200))
    price: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class EstimateStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CONVERTED = "converted"
    EXPIRED = "expired"


class Estimate(Base, TimestampMixin):
    """An estimate/quote for a customer."""
    __tablename__ = "estimates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    estimate_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    buyer: Mapped[str] = mapped_column(String(200), nullable=False)
    buyer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("buyers.id"), index=True)
    estimate_date: Mapped[str] = mapped_column(String(10), nullable=False)
    expiration_date: Mapped[Optional[str]] = mapped_column(String(10))
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[EstimateStatus] = mapped_column(default=EstimateStatus.DRAFT)
    description: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    po_number: Mapped[Optional[str]] = mapped_column(String(100))
    terms: Mapped[Optional[str]] = mapped_column(String(50))
    customer_message: Mapped[Optional[str]] = mapped_column(Text)
    converted_invoice_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("customer_invoices.id"))

    line_items: Mapped[List["EstimateLineItem"]] = relationship("EstimateLineItem", back_populates="estimate", cascade="all, delete-orphan")


class EstimateLineItem(Base, TimestampMixin):
    """Line items on an estimate."""
    __tablename__ = "estimate_line_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    estimate_id: Mapped[str] = mapped_column(String(36), ForeignKey("estimates.id"), nullable=False)
    item_description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 4), default=Decimal("1"))
    unit_of_measure: Mapped[Optional[str]] = mapped_column(String(50))
    rate: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    account_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("accounts.id"))

    estimate: Mapped["Estimate"] = relationship("Estimate", back_populates="line_items")


class CreditMemoStatus(str, enum.Enum):
    DRAFT = "draft"
    ISSUED = "issued"
    APPLIED = "applied"
    VOIDED = "voided"


class CreditMemo(Base, TimestampMixin):
    """A credit memo for a customer."""
    __tablename__ = "credit_memos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    memo_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    buyer: Mapped[str] = mapped_column(String(200), nullable=False)
    buyer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("buyers.id"), index=True)
    memo_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[CreditMemoStatus] = mapped_column(default=CreditMemoStatus.DRAFT)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    applied_to_invoice_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("customer_invoices.id"))

    line_items: Mapped[List["CreditMemoLineItem"]] = relationship("CreditMemoLineItem", back_populates="credit_memo", cascade="all, delete-orphan")


class CreditMemoLineItem(Base, TimestampMixin):
    """Line items on a credit memo."""
    __tablename__ = "credit_memo_line_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    credit_memo_id: Mapped[str] = mapped_column(String(36), ForeignKey("credit_memos.id"), nullable=False)
    item_description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 4), default=Decimal("1"))
    rate: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)

    credit_memo: Mapped["CreditMemo"] = relationship("CreditMemo", back_populates="line_items")


class VendorCreditStatus(str, enum.Enum):
    OPEN = "open"
    PARTIAL = "partial"
    APPLIED = "applied"
    VOIDED = "voided"


class VendorCredit(Base, TimestampMixin):
    """A credit from a vendor (returned goods, billing error, etc.)."""
    __tablename__ = "vendor_credits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    credit_number: Mapped[str] = mapped_column(String(100), nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    vendor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("vendors.id"), index=True)
    credit_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    amount_applied: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    status: Mapped[VendorCreditStatus] = mapped_column(default=VendorCreditStatus.OPEN)
    description: Mapped[Optional[str]] = mapped_column(Text)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    ref_no: Mapped[Optional[str]] = mapped_column(String(100))

    expense_lines: Mapped[List["VendorCreditExpenseLine"]] = relationship(
        "VendorCreditExpenseLine", back_populates="vendor_credit", cascade="all, delete-orphan"
    )


class VendorCreditExpenseLine(Base, TimestampMixin):
    __tablename__ = "vendor_credit_expense_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    vendor_credit_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendor_credits.id"), nullable=False)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    memo: Mapped[Optional[str]] = mapped_column(String(500))
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))

    vendor_credit: Mapped["VendorCredit"] = relationship("VendorCredit", back_populates="expense_lines")


class ItemReceiptStatus(str, enum.Enum):
    OPEN = "open"  # received, no bill yet
    BILLED = "billed"  # matched to a bill
    VOIDED = "voided"


class ItemReceipt(Base, TimestampMixin):
    """An item receipt — goods received before the bill arrives."""
    __tablename__ = "item_receipts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    receipt_number: Mapped[str] = mapped_column(String(100), nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    vendor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("vendors.id"), index=True)
    receipt_date: Mapped[str] = mapped_column(String(10), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    status: Mapped[ItemReceiptStatus] = mapped_column(default=ItemReceiptStatus.OPEN)
    description: Mapped[Optional[str]] = mapped_column(Text)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"), index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    ref_no: Mapped[Optional[str]] = mapped_column(String(100))  # delivery ticket number
    bill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("bills.id"))  # linked bill when matched
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"))

    lines: Mapped[List["ItemReceiptLine"]] = relationship("ItemReceiptLine", back_populates="item_receipt", cascade="all, delete-orphan")


class ItemReceiptLine(Base, TimestampMixin):
    """Line items on an item receipt."""
    __tablename__ = "item_receipt_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    item_receipt_id: Mapped[str] = mapped_column(String(36), ForeignKey("item_receipts.id"), nullable=False)
    item_description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 4), default=Decimal("1"))
    cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    account_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("accounts.id"))
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))

    item_receipt: Mapped["ItemReceipt"] = relationship("ItemReceipt", back_populates="lines")


class ReconciliationStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class BankReconciliation(Base, TimestampMixin):
    """A bank reconciliation session."""
    __tablename__ = "bank_reconciliations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    bank_account_id: Mapped[str] = mapped_column(String(36), ForeignKey("bank_accounts.id"), nullable=False)
    statement_date: Mapped[str] = mapped_column(String(10), nullable=False)
    statement_ending_balance: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    beginning_balance: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    status: Mapped[ReconciliationStatus] = mapped_column(default=ReconciliationStatus.IN_PROGRESS)
    completed_date: Mapped[Optional[str]] = mapped_column(String(10))
    difference: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    items: Mapped[List["ReconciliationItem"]] = relationship("ReconciliationItem", back_populates="reconciliation", cascade="all, delete-orphan")


class ReconciliationItem(Base, TimestampMixin):
    """An item in a bank reconciliation."""
    __tablename__ = "reconciliation_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    reconciliation_id: Mapped[str] = mapped_column(String(36), ForeignKey("bank_reconciliations.id"), nullable=False)
    transaction_type: Mapped[str] = mapped_column(String(50), nullable=False)
    transaction_id: Mapped[str] = mapped_column(String(36), nullable=False)
    transaction_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    is_cleared: Mapped[bool] = mapped_column(Boolean, default=False)

    reconciliation: Mapped["BankReconciliation"] = relationship("BankReconciliation", back_populates="items")


class FlockBudget(Base, TimestampMixin):
    """Budget entry for a flock by expense category."""
    __tablename__ = "flock_budgets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    flock_id: Mapped[str] = mapped_column(String(36), ForeignKey("flocks.id"), nullable=False, index=True)
    category: Mapped[ExpenseCategory] = mapped_column(nullable=False)
    budgeted_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class GrowerPaymentFormula(Base, TimestampMixin):
    """Payment formula for calculating grower settlements."""
    __tablename__ = "grower_payment_formulas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    grower_id: Mapped[str] = mapped_column(String(36), ForeignKey("growers.id"), nullable=False, index=True)
    base_rate_per_bird: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("0"))
    mortality_deduction_rate: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("0"))
    production_bonus_rate: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("0"))
    production_target_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("80"))
    feed_conversion_bonus: Mapped[Decimal] = mapped_column(Numeric(10, 4), default=Decimal("0"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class RecurringTransactionType(str, enum.Enum):
    INVOICE = "invoice"
    BILL = "bill"
    CHECK = "check"


class RecurringTransaction(Base, TimestampMixin):
    """Template for recurring invoices, bills, or checks that auto-generate."""
    __tablename__ = "recurring_transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    transaction_type: Mapped[RecurringTransactionType] = mapped_column(nullable=False)
    frequency: Mapped[RecurringFrequency] = mapped_column(nullable=False)
    template_data: Mapped[str] = mapped_column(Text, nullable=False)  # JSON blob
    customer_or_vendor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)
    end_date: Mapped[Optional[str]] = mapped_column(String(10))
    next_due_date: Mapped[Optional[str]] = mapped_column(String(10))
    last_generated_date: Mapped[Optional[str]] = mapped_column(String(10))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(Text)


class MemoizedTransactionType(str, enum.Enum):
    INVOICE = "invoice"
    BILL = "bill"
    CHECK = "check"
    JOURNAL_ENTRY = "journal_entry"
    SALES_RECEIPT = "sales_receipt"


class MemoizedTransaction(Base, TimestampMixin):
    """A memorized/saved transaction template for quick re-use."""
    __tablename__ = "memoized_transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    transaction_type: Mapped[MemoizedTransactionType] = mapped_column(nullable=False)
    template_data: Mapped[str] = mapped_column(Text, nullable=False)  # JSON blob
    notes: Mapped[Optional[str]] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ── Tier 2 Transaction Types ──

class SalesReceiptStatus(str, enum.Enum):
    COMPLETED = "completed"
    VOIDED = "voided"


class SalesReceipt(Base, TimestampMixin):
    """Cash egg sale without invoice — buyer pays immediately."""
    __tablename__ = "sales_receipts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    receipt_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("buyers.id"))
    receipt_date: Mapped[str] = mapped_column(String(10), nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(default=PaymentMethod.CASH)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    deposit_to_account_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("accounts.id"))
    memo: Mapped[Optional[str]] = mapped_column(Text)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))
    status: Mapped[SalesReceiptStatus] = mapped_column(default=SalesReceiptStatus.COMPLETED)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"))

    line_items: Mapped[List["SalesReceiptLineItem"]] = relationship(
        "SalesReceiptLineItem", back_populates="sales_receipt", cascade="all, delete-orphan"
    )


class SalesReceiptLineItem(Base, TimestampMixin):
    """Line items on a sales receipt."""
    __tablename__ = "sales_receipt_line_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    sales_receipt_id: Mapped[str] = mapped_column(String(36), ForeignKey("sales_receipts.id"), nullable=False)
    item_description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 4), default=Decimal("1"))
    rate: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))

    sales_receipt: Mapped["SalesReceipt"] = relationship("SalesReceipt", back_populates="line_items")


class RefundReceiptStatus(str, enum.Enum):
    COMPLETED = "completed"
    VOIDED = "voided"


class RefundReceipt(Base, TimestampMixin):
    """Refund for returned/damaged eggs."""
    __tablename__ = "refund_receipts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    refund_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("buyers.id"))
    refund_date: Mapped[str] = mapped_column(String(10), nullable=False)
    refund_method: Mapped[PaymentMethod] = mapped_column(default=PaymentMethod.CASH)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    refund_from_account_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("accounts.id"))
    memo: Mapped[Optional[str]] = mapped_column(Text)
    original_receipt_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("sales_receipts.id"))
    status: Mapped[RefundReceiptStatus] = mapped_column(default=RefundReceiptStatus.COMPLETED)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"))

    line_items: Mapped[List["RefundReceiptLineItem"]] = relationship(
        "RefundReceiptLineItem", back_populates="refund_receipt", cascade="all, delete-orphan"
    )


class RefundReceiptLineItem(Base, TimestampMixin):
    """Line items on a refund receipt."""
    __tablename__ = "refund_receipt_line_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    refund_receipt_id: Mapped[str] = mapped_column(String(36), ForeignKey("refund_receipts.id"), nullable=False)
    item_description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 4), default=Decimal("1"))
    rate: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)

    refund_receipt: Mapped["RefundReceipt"] = relationship("RefundReceipt", back_populates="line_items")


class CreditCardChargeStatus(str, enum.Enum):
    PENDING = "pending"
    CLEARED = "cleared"
    VOIDED = "voided"


class CreditCardCharge(Base, TimestampMixin):
    """Farm credit card purchase."""
    __tablename__ = "credit_card_charges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    charge_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    credit_card_account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    vendor_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("vendors.id"))
    charge_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    memo: Mapped[Optional[str]] = mapped_column(Text)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))
    status: Mapped[CreditCardChargeStatus] = mapped_column(default=CreditCardChargeStatus.PENDING)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"))

    expense_lines: Mapped[List["CreditCardChargeExpenseLine"]] = relationship(
        "CreditCardChargeExpenseLine", back_populates="charge", cascade="all, delete-orphan"
    )


class CreditCardChargeExpenseLine(Base, TimestampMixin):
    """Expense line on a credit card charge."""
    __tablename__ = "credit_card_charge_expense_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    charge_id: Mapped[str] = mapped_column(String(36), ForeignKey("credit_card_charges.id"), nullable=False)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    memo: Mapped[Optional[str]] = mapped_column(String(500))
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))

    charge: Mapped["CreditCardCharge"] = relationship("CreditCardCharge", back_populates="expense_lines")


class CreditCardCreditStatus(str, enum.Enum):
    PENDING = "pending"
    CLEARED = "cleared"
    VOIDED = "voided"


class CreditCardCredit(Base, TimestampMixin):
    """Return/refund on a credit card."""
    __tablename__ = "credit_card_credits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    credit_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    credit_card_account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False)
    vendor_name: Mapped[str] = mapped_column(String(200), nullable=False)
    charge_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    memo: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[CreditCardCreditStatus] = mapped_column(default=CreditCardCreditStatus.PENDING)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"))


class CustomerDepositModel(Base, TimestampMixin):
    """Upfront egg buyer deposit."""
    __tablename__ = "customer_deposits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    deposit_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("buyers.id"))
    deposit_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    deposit_to_account_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("accounts.id"))
    payment_method: Mapped[PaymentMethod] = mapped_column(default=PaymentMethod.CHECK)
    memo: Mapped[Optional[str]] = mapped_column(Text)
    is_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    applied_to_invoice_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("customer_invoices.id"))
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"))


class FinanceChargeStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    WAIVED = "waived"


class FinanceCharge(Base, TimestampMixin):
    """Late payment fee on overdue invoices."""
    __tablename__ = "finance_charges"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    charge_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("customer_invoices.id"), nullable=False)
    charge_date: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    annual_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    grace_days: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[FinanceChargeStatus] = mapped_column(default=FinanceChargeStatus.PENDING)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"))


class AdjustmentType(str, enum.Enum):
    INCREASE = "increase"
    DECREASE = "decrease"


class InventoryAdjustmentStatus(str, enum.Enum):
    COMPLETED = "completed"
    VOIDED = "voided"


class InventoryAdjustment(Base, TimestampMixin):
    """Adjust egg inventory counts."""
    __tablename__ = "inventory_adjustments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    adjustment_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    adjustment_date: Mapped[str] = mapped_column(String(10), nullable=False)
    adjustment_type: Mapped[AdjustmentType] = mapped_column(nullable=False)
    account_id: Mapped[str] = mapped_column(String(36), ForeignKey("accounts.id"), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(15, 4), nullable=False)
    unit_value: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    total_value: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))
    status: Mapped[InventoryAdjustmentStatus] = mapped_column(default=InventoryAdjustmentStatus.COMPLETED)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"))


# ── Fixed Assets ──

class AssetCategory(str, enum.Enum):
    MACHINERY = "machinery"
    VEHICLES = "vehicles"
    BUILDINGS = "buildings"
    EQUIPMENT = "equipment"
    LAND_IMPROVEMENTS = "land_improvements"
    OTHER = "other"


class DepreciationMethodEnum(str, enum.Enum):
    STRAIGHT_LINE = "straight_line"
    DECLINING_BALANCE = "declining_balance"
    MACRS_3 = "macrs_3"
    MACRS_5 = "macrs_5"
    MACRS_7 = "macrs_7"
    MACRS_10 = "macrs_10"
    MACRS_15 = "macrs_15"


class DisposalMethod(str, enum.Enum):
    SOLD = "sold"
    SCRAPPED = "scrapped"
    TRADED = "traded"


class FixedAsset(Base, TimestampMixin):
    """Farm fixed assets — tractors, egg graders, coolers, barns, etc."""
    __tablename__ = "fixed_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    asset_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[AssetCategory] = mapped_column(nullable=False)
    acquisition_date: Mapped[str] = mapped_column(String(10), nullable=False)
    acquisition_cost: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    salvage_value: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"))
    useful_life_years: Mapped[int] = mapped_column(Integer, nullable=False)
    depreciation_method: Mapped[DepreciationMethodEnum] = mapped_column(nullable=False)
    location: Mapped[Optional[str]] = mapped_column(String(200))
    flock_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("flocks.id"))
    serial_number: Mapped[Optional[str]] = mapped_column(String(100))
    vendor_name: Mapped[Optional[str]] = mapped_column(String(200))
    is_disposed: Mapped[bool] = mapped_column(Boolean, default=False)
    disposal_date: Mapped[Optional[str]] = mapped_column(String(10))
    disposal_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(15, 2))
    disposal_method: Mapped[Optional[DisposalMethod]] = mapped_column()
    notes: Mapped[Optional[str]] = mapped_column(Text)

    depreciation_records: Mapped[List["FixedAssetDepreciation"]] = relationship(
        "FixedAssetDepreciation", back_populates="asset", order_by="FixedAssetDepreciation.period_date"
    )


class FixedAssetDepreciation(Base, TimestampMixin):
    """Monthly depreciation record for a fixed asset."""
    __tablename__ = "fixed_asset_depreciation"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    asset_id: Mapped[str] = mapped_column(String(36), ForeignKey("fixed_assets.id"), nullable=False)
    period_date: Mapped[str] = mapped_column(String(7), nullable=False)  # YYYY-MM
    depreciation_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    accumulated_depreciation: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    book_value: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    journal_entry_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("journal_entries.id"))
    is_posted: Mapped[bool] = mapped_column(Boolean, default=False)

    asset: Mapped["FixedAsset"] = relationship("FixedAsset", back_populates="depreciation_records")
