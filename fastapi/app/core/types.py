"""Column types that keep Postgres typed and Python on the strings it already uses.

The ledger's services, the API and the generated client all pass dates around as
'YYYY-MM-DD' strings. Storing them as `date` (migration 006) is about the database
validating and comparing them properly, not about changing every caller, so the
conversion happens here, once, at the column.
"""

from datetime import UTC, date, datetime

import sqlalchemy as sa
from sqlalchemy.types import TypeDecorator


class IsoDate(TypeDecorator):
    """A `date` column read and written as 'YYYY-MM-DD'."""

    impl = sa.Date
    cache_ok = True

    def process_bind_param(self, value, dialect):  # noqa: ARG002
        if value is None or isinstance(value, date):
            return value
        return date.fromisoformat(value)

    def process_result_value(self, value, dialect):  # noqa: ARG002
        return value.isoformat() if value is not None else None


class IsoTimestamp(TypeDecorator):
    """A `timestamptz` column read and written as ISO 8601, always in UTC."""

    impl = sa.DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):  # noqa: ARG002
        if value is None or isinstance(value, datetime):
            return value
        return datetime.fromisoformat(value)

    def process_result_value(self, value, dialect):  # noqa: ARG002
        return value.astimezone(UTC).isoformat() if value is not None else None
