from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def _add_column_if_missing(conn, table: str, column: str, col_type: str):
    """Safely add a column to an existing table (SQLite compatible)."""
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    columns = [row[1] for row in result]
    if column not in columns:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))


async def _migrate_schema(conn):
    """Add new columns to existing tables for Phase 5 & 6."""
    # Phase 5: PickupJob — add driver_id
    await _add_column_if_missing(conn, "pickup_jobs", "driver_id", "VARCHAR(36) REFERENCES drivers(id)")

    # Phase 5: Shipment — add carrier_id, freight_cost, delivered_date, signed_by, pod_notes
    await _add_column_if_missing(conn, "shipments", "carrier_id", "VARCHAR(36) REFERENCES carriers(id)")
    await _add_column_if_missing(conn, "shipments", "freight_cost", "NUMERIC(10, 2)")
    await _add_column_if_missing(conn, "shipments", "delivered_date", "VARCHAR(10)")
    await _add_column_if_missing(conn, "shipments", "signed_by", "VARCHAR(200)")
    await _add_column_if_missing(conn, "shipments", "pod_notes", "TEXT")

    # Phase 6: EggContract — add buyer_id, volume_committed_dozens
    await _add_column_if_missing(conn, "egg_contracts", "buyer_id", "VARCHAR(36) REFERENCES buyers(id)")
    await _add_column_if_missing(conn, "egg_contracts", "volume_committed_dozens", "INTEGER")

    # Equipment: pickup_jobs — add trailer_id
    await _add_column_if_missing(conn, "pickup_jobs", "trailer_id", "VARCHAR(36)")

    # Maps: barns — add latitude/longitude
    await _add_column_if_missing(conn, "barns", "latitude", "FLOAT")
    await _add_column_if_missing(conn, "barns", "longitude", "FLOAT")

    # QB Accounting: Bill extensions
    await _add_column_if_missing(conn, "bills", "terms", "VARCHAR(50)")
    await _add_column_if_missing(conn, "bills", "ref_no", "VARCHAR(100)")
    await _add_column_if_missing(conn, "bills", "discount_date", "VARCHAR(10)")
    await _add_column_if_missing(conn, "bills", "discount_amount", "NUMERIC(12, 2)")

    # QB Accounting: CustomerInvoice extensions
    await _add_column_if_missing(conn, "customer_invoices", "ship_to_address", "TEXT")
    await _add_column_if_missing(conn, "customer_invoices", "po_number", "VARCHAR(100)")
    await _add_column_if_missing(conn, "customer_invoices", "terms", "VARCHAR(50)")
    await _add_column_if_missing(conn, "customer_invoices", "ship_date", "VARCHAR(10)")
    await _add_column_if_missing(conn, "customer_invoices", "ship_via", "VARCHAR(100)")
    await _add_column_if_missing(conn, "customer_invoices", "customer_message", "TEXT")

    # QB Accounting: BillPayment — add bank_account_id
    await _add_column_if_missing(conn, "bill_payments", "bank_account_id", "VARCHAR(36)")

    # QB Accounting: BankAccount — add linked_account_id
    await _add_column_if_missing(conn, "bank_accounts", "linked_account_id", "VARCHAR(36)")

    # QB Audit Fix: Vendor — add QB fields
    await _add_column_if_missing(conn, "vendors", "fax", "VARCHAR(50)")
    await _add_column_if_missing(conn, "vendors", "website", "VARCHAR(200)")
    await _add_column_if_missing(conn, "vendors", "terms", "VARCHAR(50) DEFAULT 'Net 30'")
    await _add_column_if_missing(conn, "vendors", "tax_id", "VARCHAR(50)")
    await _add_column_if_missing(conn, "vendors", "is_1099", "BOOLEAN DEFAULT 0")

    # Flock — add bird_weight
    await _add_column_if_missing(conn, "flocks", "bird_weight", "FLOAT")

    # Weekly record sync: add weekly_record_id to mortality_records and production_records
    await _add_column_if_missing(conn, "mortality_records", "weekly_record_id", "VARCHAR(36)")
    await _add_column_if_missing(conn, "production_records", "weekly_record_id", "VARCHAR(36)")

    # QB Audit Fix: Buyer — add QB fields
    await _add_column_if_missing(conn, "buyers", "company", "VARCHAR(200)")
    await _add_column_if_missing(conn, "buyers", "bill_to_address", "TEXT")
    await _add_column_if_missing(conn, "buyers", "ship_to_address", "TEXT")
    await _add_column_if_missing(conn, "buyers", "terms", "VARCHAR(50) DEFAULT 'Net 30'")
    await _add_column_if_missing(conn, "buyers", "credit_limit", "NUMERIC(15, 2)")

    # Grower — latitude/longitude for driveway entrance
    await _add_column_if_missing(conn, "growers", "latitude", "FLOAT")
    await _add_column_if_missing(conn, "growers", "longitude", "FLOAT")

    # Egg Tracking Overhaul: Buyer customer_type
    await _add_column_if_missing(conn, "buyers", "customer_type", "VARCHAR(50)")

    # Egg Tracking Overhaul: EggInventory — dynamic weight + production period
    await _add_column_if_missing(conn, "egg_inventory", "weight_per_skid", "FLOAT")
    await _add_column_if_missing(conn, "egg_inventory", "production_period_start", "VARCHAR(10)")
    await _add_column_if_missing(conn, "egg_inventory", "production_period_end", "VARCHAR(10)")
    await _add_column_if_missing(conn, "egg_inventory", "weekly_record_id", "VARCHAR(36)")
    await _add_column_if_missing(conn, "egg_inventory", "condition", "VARCHAR(50)")

    # Egg Tracking Overhaul: ShipmentLine — per-line contract
    await _add_column_if_missing(conn, "shipment_lines", "contract_id", "VARCHAR(36) REFERENCES egg_contracts(id)")

    # Egg Tracking Overhaul: Shipment — buyer_id FK
    await _add_column_if_missing(conn, "shipments", "buyer_id", "VARCHAR(36) REFERENCES buyers(id)")

    # Egg Tracking Overhaul: PickupJob — arrival_status
    await _add_column_if_missing(conn, "pickup_jobs", "arrival_status", "VARCHAR(20) DEFAULT 'pending'")

    # Egg Tracking Overhaul: PickupItem — condition + skids_received
    await _add_column_if_missing(conn, "pickup_items", "condition", "VARCHAR(50)")
    await _add_column_if_missing(conn, "pickup_items", "skids_received", "INTEGER")


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_schema(conn)
