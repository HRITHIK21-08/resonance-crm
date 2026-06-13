"""
Resonance CRM — Message Model

Represents a single communication sent to a customer as part of a campaign.

Design decisions:
- One message per customer per campaign: Enforced at application level.
- external_id: Assigned by the channel service. Used for correlating callbacks.
- status lifecycle: queued → sent → delivered → read → clicked → converted
                    queued → sent → failed (with retry_count tracking)
- retry_count: Tracks channel service retry attempts. Max 3 before permanent failure.
- Separate timestamp for each status: Enables funnel timing analysis
  ("How long from sent to read? From read to clicked?")
"""
import uuid
from datetime import datetime, timezone

from app.extensions import db


class Message(db.Model):
    __tablename__ = "messages"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    campaign_id = db.Column(
        db.String(36),
        db.ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id = db.Column(
        db.String(36),
        db.ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    subject_line = db.Column(db.String(255), nullable=True)

    # Delivery tracking
    status = db.Column(
        db.String(20), default="queued", index=True
    )  # queued, sent, delivered, failed, read, clicked, converted
    external_id = db.Column(
        db.String(100), nullable=True, index=True
    )  # Assigned by channel service
    retry_count = db.Column(db.Integer, default=0)

    # Status timestamps for funnel analysis
    sent_at = db.Column(db.DateTime(timezone=True), nullable=True)
    delivered_at = db.Column(db.DateTime(timezone=True), nullable=True)
    read_at = db.Column(db.DateTime(timezone=True), nullable=True)
    clicked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    converted_at = db.Column(db.DateTime(timezone=True), nullable=True)
    failed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    failure_reason = db.Column(db.Text, nullable=True)

    # Timestamps
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    delivery_events = db.relationship(
        "DeliveryEvent",
        backref="message",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def to_dict(self):
        """Serialize message to dictionary."""
        return {
            "id": self.id,
            "campaign_id": self.campaign_id,
            "customer_id": self.customer_id,
            "customer_name": self.customer.name if self.customer else None,
            "channel": self.channel,
            "content": self.content,
            "subject_line": self.subject_line,
            "status": self.status,
            "external_id": self.external_id,
            "retry_count": self.retry_count,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "delivered_at": (
                self.delivered_at.isoformat() if self.delivered_at else None
            ),
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "clicked_at": self.clicked_at.isoformat() if self.clicked_at else None,
            "converted_at": (
                self.converted_at.isoformat() if self.converted_at else None
            ),
            "failed_at": self.failed_at.isoformat() if self.failed_at else None,
            "failure_reason": self.failure_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Message {self.id[:8]} [{self.status}] → {self.channel}>"
