"""
Resonance CRM — Copilot Conversation Model

Stores AI copilot conversation history for multi-turn interactions.

Design decisions:
- messages as JSON array: Stores the full conversation in a single column.
  Alternative: separate messages table with foreign keys. JSONB is simpler here
  because copilot conversations are always loaded/displayed in full.
- campaign_id: Links conversation to the campaign it created (if any).
  Enables "Show me the conversation that created this campaign" in the UI.
"""
import uuid
from datetime import datetime, timezone

from app.extensions import db


class CopilotConversation(db.Model):
    __tablename__ = "copilot_conversations"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    messages = db.Column(
        db.JSON, default=list
    )  # [{role, content, tool_calls, timestamp}]
    status = db.Column(
        db.String(20), default="active"
    )  # active, completed, error
    campaign_id = db.Column(
        db.String(36),
        db.ForeignKey("campaigns.id", ondelete="SET NULL"),
        nullable=True,
    )
    title = db.Column(
        db.String(255), nullable=True
    )  # Auto-generated from first user message

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    campaign = db.relationship("Campaign", backref="copilot_conversation")

    def add_message(self, role, content, tool_calls=None):
        """Append a message to the conversation."""
        msg = {
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if tool_calls:
            msg["tool_calls"] = tool_calls
        if self.messages is None:
            self.messages = []
        # SQLAlchemy doesn't detect in-place JSON mutations, so reassign
        self.messages = self.messages + [msg]

    def to_dict(self):
        """Serialize conversation to dictionary."""
        return {
            "id": self.id,
            "messages": self.messages,
            "status": self.status,
            "campaign_id": self.campaign_id,
            "title": self.title,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        msg_count = len(self.messages) if self.messages else 0
        return f"<CopilotConversation {self.id[:8]} ({msg_count} messages)>"
