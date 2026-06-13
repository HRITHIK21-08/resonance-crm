"""
Resonance CRM — Segment Model

Represents an audience segment — a group of customers matching certain criteria.

Design decisions:
- rules as JSONB: Stores the segment definition as a structured JSON object.
  This allows both manual rule-based segments AND AI-generated segments.
  Format: {"conditions": [{"field": "lifetime_value", "operator": "gte", "value": 5000}], "logic": "AND"}
- ai_query: Stores the original natural language query that created this segment.
  Critical for transparency ("Why does this segment exist?") and audit trail.
- customer_count: Denormalized for fast display. Refreshed when segment is re-evaluated.
- segment_type: "manual" (rule builder) or "ai" (created via copilot).
- SegmentMembership: Materialized many-to-many join. Re-computed on segment refresh.
  Alternative was dynamic SQL evaluation on every query — too slow for large customer bases.
"""
import uuid
from datetime import datetime, timezone

from app.extensions import db


class Segment(db.Model):
    __tablename__ = "segments"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name = db.Column(db.String(255), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=True)
    rules = db.Column(db.JSON, default=dict)
    ai_query = db.Column(
        db.Text, nullable=True
    )  # Original NL query from copilot
    customer_count = db.Column(db.Integer, default=0)
    segment_type = db.Column(
        db.String(20), default="manual"
    )  # manual, ai

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    refreshed_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    campaigns = db.relationship("Campaign", backref="segment", lazy="dynamic")
    memberships = db.relationship(
        "SegmentMembership",
        backref="segment",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )

    def to_dict(self, include_members=False):
        """Serialize segment to dictionary."""
        data = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "rules": self.rules,
            "ai_query": self.ai_query,
            "customer_count": self.customer_count,
            "segment_type": self.segment_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "refreshed_at": (
                self.refreshed_at.isoformat() if self.refreshed_at else None
            ),
        }
        if include_members:
            data["members"] = [
                m.customer.to_dict()
                for m in self.memberships.join(SegmentMembership.customer).limit(100)
            ]
        return data

    def __repr__(self):
        return f"<Segment {self.name} ({self.customer_count} customers)>"


class SegmentMembership(db.Model):
    """
    Materialized join table for segment ↔ customer membership.

    Why materialized (not computed on-the-fly):
    - Segments can have complex rules that are expensive to evaluate.
    - Dashboard/campaign UIs need instant member counts.
    - Re-evaluation happens explicitly (segment refresh), not on every read.

    At scale, this would be backed by a precomputation pipeline (e.g., Airflow).
    For this scope, we re-evaluate synchronously on segment creation/refresh.
    """

    __tablename__ = "segment_memberships"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    segment_id = db.Column(
        db.String(36),
        db.ForeignKey("segments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id = db.Column(
        db.String(36),
        db.ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    customer = db.relationship("Customer", backref="segment_memberships")

    # Ensure unique membership per segment-customer pair
    __table_args__ = (
        db.UniqueConstraint(
            "segment_id", "customer_id", name="uq_segment_customer"
        ),
    )

    def __repr__(self):
        return f"<SegmentMembership segment={self.segment_id} customer={self.customer_id}>"
