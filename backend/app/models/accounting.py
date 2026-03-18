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
