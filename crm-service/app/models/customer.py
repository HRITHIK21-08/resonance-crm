"""
Resonance CRM — Customer Model

Represents a shopper in the brand's customer base.
Stores profile data, purchase behavior metrics, and channel preferences.

Design decisions:
- UUID primary keys: Distributed-friendly, no sequential ID leaking
- Denormalized metrics (lifetime_value, total_orders, avg_order_value):
  Avoids expensive aggregation queries on the orders table for dashboard/analytics.
  Updated incrementally when new orders arrive.
- preferred_channel: Precomputed from engagement history for AI channel recommendations.
- metadata JSONB: Extensible for custom brand attributes without schema changes.
"""
import uuid
from datetime import datetime, timezone

from app.extensions import db


class Customer(db.Model):
    __tablename__ = "customers"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(20), nullable=True)
    city = db.Column(db.String(100), nullable=True, index=True)
    gender = db.Column(db.String(20), nullable=True)
    birth_date = db.Column(db.Date, nullable=True)

    # Denormalized purchase behavior metrics
    lifetime_value = db.Column(db.Float, default=0.0, index=True)
    total_orders = db.Column(db.Integer, default=0)
    avg_order_value = db.Column(db.Float, default=0.0)
    first_purchase_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_purchase_at = db.Column(
        db.DateTime(timezone=True), nullable=True, index=True
    )

    # Channel preference (computed from engagement history)
    preferred_channel = db.Column(
        db.String(20), default="email"
    )  # whatsapp, email, sms

    # Extensible metadata
    metadata_ = db.Column("metadata", db.JSON, default=dict)

    # Timestamps
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
    orders = db.relationship(
        "Order", backref="customer", lazy="dynamic", cascade="all, delete-orphan"
    )
    messages = db.relationship(
        "Message", backref="customer", lazy="dynamic"
    )

    def to_dict(self, include_orders=False):
        """Serialize customer to dictionary."""
        data = {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "phone": self.phone,
            "city": self.city,
            "gender": self.gender,
            "birth_date": self.birth_date.isoformat() if self.birth_date else None,
            "lifetime_value": self.lifetime_value,
            "total_orders": self.total_orders,
            "avg_order_value": self.avg_order_value,
            "first_purchase_at": (
                self.first_purchase_at.isoformat() if self.first_purchase_at else None
            ),
            "last_purchase_at": (
                self.last_purchase_at.isoformat() if self.last_purchase_at else None
            ),
            "preferred_channel": self.preferred_channel,
            "metadata": self.metadata_,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
        if include_orders:
            from app.models.order import Order
            data["orders"] = [
                o.to_dict() for o in self.orders.order_by(Order.ordered_at.desc()).limit(20)
            ]
        return data

    def update_purchase_metrics(self):
        """
        Recalculate denormalized purchase metrics from orders.
        Called after order ingestion.
        """
        from app.models.order import Order

        orders = Order.query.filter_by(customer_id=self.id).all()
        if orders:
            self.total_orders = len(orders)
            self.lifetime_value = sum(o.amount for o in orders)
            self.avg_order_value = self.lifetime_value / self.total_orders
            dates = [o.ordered_at for o in orders if o.ordered_at]
            if dates:
                self.first_purchase_at = min(dates)
                self.last_purchase_at = max(dates)

    def __repr__(self):
        return f"<Customer {self.name} ({self.email})>"
