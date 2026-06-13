"""
Resonance CRM — Campaign Model

Represents a marketing campaign targeting a segment through a channel.

Design decisions:
- Denormalized delivery counts (total_sent, total_delivered, etc.):
  Updated incrementally via callbacks. Avoids COUNT(*) on messages table.
  At scale: would use Redis counters or materialized views.
- status lifecycle: draft → scheduled → active → completed/failed
  "scheduled" is for future implementation of timed campaigns.
- ai_goal: Stores the original business goal from the copilot.
  e.g., "Re-engage customers who haven't bought in 90 days"
- ai_metadata: Stores AI reasoning, estimated performance, etc.
  Enables post-campaign analysis of AI predictions vs actuals.
"""
import uuid
from datetime import datetime, timezone

from app.extensions import db


class Campaign(db.Model):
    __tablename__ = "campaigns"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    segment_id = db.Column(
        db.String(36),
        db.ForeignKey("segments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    channel = db.Column(
        db.String(20), nullable=False
    )  # whatsapp, email, sms
    status = db.Column(
        db.String(20), default="draft", index=True
    )  # draft, scheduled, active, completed, failed
    message_template = db.Column(db.Text, nullable=False)
    subject_line = db.Column(
        db.String(255), nullable=True
    )  # For email campaigns

    # AI context
    ai_goal = db.Column(db.Text, nullable=True)
    ai_metadata = db.Column(db.JSON, default=dict)

    # Denormalized delivery metrics — updated via callbacks
    total_sent = db.Column(db.Integer, default=0)
    total_delivered = db.Column(db.Integer, default=0)
    total_failed = db.Column(db.Integer, default=0)
    total_read = db.Column(db.Integer, default=0)
    total_clicked = db.Column(db.Integer, default=0)
    total_converted = db.Column(db.Integer, default=0)
    estimated_roi = db.Column(db.Float, nullable=True)

    # Timestamps
    scheduled_at = db.Column(db.DateTime(timezone=True), nullable=True)
    launched_at = db.Column(db.DateTime(timezone=True), nullable=True)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    messages = db.relationship(
        "Message", backref="campaign", lazy="dynamic", cascade="all, delete-orphan"
    )

    @property
    def delivery_rate(self):
        """Calculate delivery rate as percentage."""
        if self.total_sent == 0:
            return 0.0
        return round((self.total_delivered / self.total_sent) * 100, 1)

    @property
    def open_rate(self):
        """Calculate open/read rate as percentage of delivered."""
        if self.total_delivered == 0:
            return 0.0
        return round((self.total_read / self.total_delivered) * 100, 1)

    @property
    def click_rate(self):
        """Calculate click rate as percentage of delivered."""
        if self.total_delivered == 0:
            return 0.0
        return round((self.total_clicked / self.total_delivered) * 100, 1)

    @property
    def conversion_rate(self):
        """Calculate conversion rate as percentage of delivered."""
        if self.total_delivered == 0:
            return 0.0
        return round((self.total_converted / self.total_delivered) * 100, 1)

    def to_dict(self, include_messages=False):
        """Serialize campaign to dictionary."""
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "segment_id": self.segment_id,
            "segment_name": self.segment.name if self.segment else None,
            "channel": self.channel,
            "status": self.status,
            "message_template": self.message_template,
            "subject_line": self.subject_line,
            "ai_goal": self.ai_goal,
            "ai_metadata": self.ai_metadata,
            "total_sent": self.total_sent,
            "total_delivered": self.total_delivered,
            "total_failed": self.total_failed,
            "total_read": self.total_read,
            "total_clicked": self.total_clicked,
            "total_converted": self.total_converted,
            "delivery_rate": self.delivery_rate,
            "open_rate": self.open_rate,
            "click_rate": self.click_rate,
            "conversion_rate": self.conversion_rate,
            "estimated_roi": self.estimated_roi,
            "scheduled_at": (
                self.scheduled_at.isoformat() if self.scheduled_at else None
            ),
            "launched_at": (
                self.launched_at.isoformat() if self.launched_at else None
            ),
            "completed_at": (
                self.completed_at.isoformat() if self.completed_at else None
            ),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_messages:
            from app.models.message import Message
            data["messages"] = [
                m.to_dict()
                for m in self.messages.order_by(Message.created_at.desc()).limit(100)
            ]
        return data

    def __repr__(self):
        return f"<Campaign {self.name} [{self.status}]>"
