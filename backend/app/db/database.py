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


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_schema(conn)
