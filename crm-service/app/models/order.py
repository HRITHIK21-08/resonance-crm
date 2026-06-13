"""
Resonance CRM — Order Model

Represents a purchase/order placed by a customer.

Design decisions:
- Separate items as JSON array: Flexible for variable product counts per order.
- category field: Enables segmentation by purchase category (e.g., "ethnic wear buyers").
- order_number as unique: Business-friendly identifier separate from UUID.
"""
import uuid
from datetime import datetime, timezone

from app.extensions import db


class Order(db.Model):
    __tablename__ = "orders"

    id = db.Column(
        db.String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    customer_id = db.Column(
        db.String(36),
        db.ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order_number = db.Column(db.String(50), unique=True, nullable=False)
    amount = db.Column(db.Float, nullable=False)
    status = db.Column(
        db.String(20), default="completed"
    )  # completed, pending, cancelled, returned
    items = db.Column(db.JSON, default=list)  # [{name, price, qty}]
    category = db.Column(
        db.String(100), nullable=True, index=True
    )  # Primary product category

    ordered_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self):
        """Serialize order to dictionary."""
        return {
            "id": self.id,
            "customer_id": self.customer_id,
            "order_number": self.order_number,
            "amount": self.amount,
            "status": self.status,
            "items": self.items,
            "category": self.category,
            "ordered_at": self.ordered_at.isoformat() if self.ordered_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Order {self.order_number} ₹{self.amount}>"
