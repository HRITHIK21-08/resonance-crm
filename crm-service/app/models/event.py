"""
Resonance CRM — Delivery Event Model

Immutable audit log of every delivery status change received from the channel service.

Design decisions:
- Immutable append-only: Events are never updated or deleted. This is an audit log.
- idempotency_key: SHA256 hash ensuring duplicate callbacks are silently ignored.
  This is the industry-standard pattern for webhook deduplication.
- sequence: Monotonically increasing per message. Ensures out-of-order callbacks
  don't cause status regression (e.g., DELIVERED arriving after READ).
- received_at vs occurred_at: occurred_at is when the event actually happened
  (from channel service). received_at is when the CRM processed it.
  The delta reveals callback delivery latency.
"""
import uuid
from datetime import datetime, timezone

from app.extensions import db


class DeliveryEvent(db.Model):
    __tablename__ = "delivery_events"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    message_id = db.Column(
        db.String(36),
        db.ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type = db.Column(
        db.String(30), nullable=False
    )  # SENT, DELIVERED, FAILED, READ, CLICKED, CONVERTED
    metadata_ = db.Column("metadata", db.JSON, default=dict)
    idempotency_key = db.Column(
        db.String(64), unique=True, nullable=False, index=True
    )
    sequence = db.Column(db.Integer, nullable=False, default=0)

    occurred_at = db.Column(
        db.DateTime(timezone=True), nullable=False
    )  # When it actually happened
    received_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )  # When CRM processed it

    def to_dict(self):
        """Serialize delivery event to dictionary."""
        return {
            "id": self.id,
            "message_id": self.message_id,
            "event_type": self.event_type,
            "metadata": self.metadata_,
            "idempotency_key": self.idempotency_key,
            "sequence": self.sequence,
            "occurred_at": self.occurred_at.isoformat() if self.occurred_at else None,
            "received_at": self.received_at.isoformat() if self.received_at else None,
        }

    def __repr__(self):
        return f"<DeliveryEvent {self.event_type} for message {self.message_id[:8]}>"
