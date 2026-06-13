"""
Resonance CRM — Segment Service

Business logic for audience segmentation.
Handles segment creation (manual + AI), rule evaluation, and membership management.

The segment rule engine supports these operators on customer fields:
  - eq, neq: Equality / inequality
  - gt, gte, lt, lte: Numeric comparisons
  - contains, not_contains: String substring match
  - in, not_in: List membership
  - between: Numeric range
  - days_ago_lt, days_ago_gt: Date relative comparisons (e.g., "last purchase < 30 days ago")

Rules are stored as JSON:
{
    "logic": "AND",  // or "OR"
    "conditions": [
        {"field": "lifetime_value", "operator": "gte", "value": 5000},
        {"field": "last_purchase_at", "operator": "days_ago_gt", "value": 90}
    ]
}
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_, func

from app.extensions import db
from app.models.customer import Customer
from app.models.segment import Segment, SegmentMembership
from app.utils import NotFoundError, ValidationError

logger = logging.getLogger(__name__)


# Maps operator names to SQLAlchemy filter expressions
OPERATOR_MAP = {
    "eq": lambda col, val: col == val,
    "neq": lambda col, val: col != val,
    "gt": lambda col, val: col > float(val),
    "gte": lambda col, val: col >= float(val),
    "lt": lambda col, val: col < float(val),
    "lte": lambda col, val: col <= float(val),
    "contains": lambda col, val: col.ilike(f"%{val}%"),
    "not_contains": lambda col, val: ~col.ilike(f"%{val}%"),
    "in": lambda col, val: col.in_(val if isinstance(val, list) else [val]),
    "not_in": lambda col, val: ~col.in_(val if isinstance(val, list) else [val]),
    "between": lambda col, val: col.between(float(val[0]), float(val[1])),
    "days_ago_lt": lambda col, val: col > (
        datetime.now(timezone.utc) - timedelta(days=int(val))
    ),
    "days_ago_gt": lambda col, val: col < (
        datetime.now(timezone.utc) - timedelta(days=int(val))
    ),
    "is_null": lambda col, val: col.is_(None) if val else col.isnot(None),
}

# Customer fields that can be used in segment rules
ALLOWED_FIELDS = {
    "email", "name", "phone", "city", "gender", "lifetime_value",
    "total_orders", "avg_order_value", "first_purchase_at",
    "last_purchase_at", "preferred_channel",
}


class SegmentService:
    """Service layer for segment operations."""

    @staticmethod
    def get_all():
        """Get all segments ordered by creation date."""
        segments = Segment.query.order_by(Segment.created_at.desc()).all()
        return [s.to_dict() for s in segments]

    @staticmethod
    def get_by_id(segment_id, include_members=False):
        """Get a single segment by ID."""
        segment = Segment.query.get(segment_id)
        if not segment:
            raise NotFoundError(f"Segment {segment_id} not found")
        result = segment.to_dict()
        if include_members:
            members = (
                db.session.query(Customer)
                .join(SegmentMembership, SegmentMembership.customer_id == Customer.id)
                .filter(SegmentMembership.segment_id == segment_id)
                .order_by(Customer.lifetime_value.desc())
                .limit(200)
                .all()
            )
            result["members"] = [m.to_dict() for m in members]
        return result

    @staticmethod
    def create(data):
        """
        Create a new segment and evaluate membership.

        Args:
            data: Dict with name, description, rules, ai_query, segment_type

        Returns:
            Created segment dict
        """
        if not data.get("name"):
            raise ValidationError("Segment name is required")
        if not data.get("rules"):
            raise ValidationError("Segment rules are required")

        # Check for duplicate name
        existing = Segment.query.filter_by(name=data["name"]).first()
        if existing:
            raise ValidationError(f"Segment '{data['name']}' already exists")

        segment = Segment(
            name=data["name"],
            description=data.get("description", ""),
            rules=data["rules"],
            ai_query=data.get("ai_query"),
            segment_type=data.get("segment_type", "manual"),
        )
        db.session.add(segment)
        db.session.flush()  # Get the segment ID

        # Evaluate rules and create memberships
        count = SegmentService._evaluate_and_populate(segment)
        segment.customer_count = count
        segment.refreshed_at = datetime.now(timezone.utc)

        db.session.commit()
        logger.info(f"Created segment '{segment.name}' with {count} members")
        return segment.to_dict()

    @staticmethod
    def preview_count(rules):
        """
        Preview how many customers would match the given rules,
        without creating the segment. Used for audience size estimation.

        Args:
            rules: Dict with logic and conditions

        Returns:
            Dict with count and sample customers
        """
        query = SegmentService._build_query(rules)
        count = query.count()
        samples = query.limit(5).all()
        return {
            "count": count,
            "samples": [c.to_dict() for c in samples],
        }

    @staticmethod
    def refresh(segment_id):
        """
        Re-evaluate segment membership.
        Deletes existing memberships and recomputes from current customer data.
        """
        segment = Segment.query.get(segment_id)
        if not segment:
            raise NotFoundError(f"Segment {segment_id} not found")

        # Delete existing memberships
        SegmentMembership.query.filter_by(segment_id=segment_id).delete()

        # Re-evaluate
        count = SegmentService._evaluate_and_populate(segment)
        segment.customer_count = count
        segment.refreshed_at = datetime.now(timezone.utc)

        db.session.commit()
        logger.info(f"Refreshed segment '{segment.name}': {count} members")
        return segment.to_dict()

    @staticmethod
    def _build_query(rules):
        """
        Build a SQLAlchemy query from segment rules.

        Args:
            rules: {"logic": "AND|OR", "conditions": [{"field", "operator", "value"}]}

        Returns:
            SQLAlchemy query object
        """
        conditions_data = rules.get("conditions", [])
        logic = rules.get("logic", "AND").upper()

        if not conditions_data:
            return Customer.query

        filters = []
        for cond in conditions_data:
            field_name = cond.get("field")
            operator = cond.get("operator")
            value = cond.get("value")

            if field_name not in ALLOWED_FIELDS:
                logger.warning(f"Skipping unknown field: {field_name}")
                continue

            if operator not in OPERATOR_MAP:
                logger.warning(f"Skipping unknown operator: {operator}")
                continue

            column = getattr(Customer, field_name)
            filter_expr = OPERATOR_MAP[operator](column, value)
            filters.append(filter_expr)

        if not filters:
            return Customer.query

        if logic == "OR":
            return Customer.query.filter(or_(*filters))
        else:
            return Customer.query.filter(and_(*filters))

    @staticmethod
    def _evaluate_and_populate(segment):
        """
        Evaluate segment rules against all customers and create memberships.

        Returns:
            Number of matching customers
        """
        query = SegmentService._build_query(segment.rules)
        matching_customers = query.all()

        for customer in matching_customers:
            membership = SegmentMembership(
                segment_id=segment.id,
                customer_id=customer.id,
            )
            db.session.add(membership)

        return len(matching_customers)

    @staticmethod
    def get_segment_demographics(segment_id):
        """
        Get demographic breakdown for a segment.
        Used by AI copilot for audience insights.
        """
        segment = Segment.query.get(segment_id)
        if not segment:
            raise NotFoundError(f"Segment {segment_id} not found")

        members = (
            db.session.query(Customer)
            .join(SegmentMembership, SegmentMembership.customer_id == Customer.id)
            .filter(SegmentMembership.segment_id == segment_id)
        )

        # City distribution
        city_dist = (
            members.with_entities(Customer.city, func.count(Customer.id))
            .group_by(Customer.city)
            .order_by(func.count(Customer.id).desc())
            .limit(10)
            .all()
        )

        # Gender distribution
        gender_dist = (
            members.with_entities(Customer.gender, func.count(Customer.id))
            .group_by(Customer.gender)
            .all()
        )

        # Channel preference distribution
        channel_dist = (
            members.with_entities(
                Customer.preferred_channel, func.count(Customer.id)
            )
            .group_by(Customer.preferred_channel)
            .all()
        )

        # LTV statistics
        ltv_stats = members.with_entities(
            func.avg(Customer.lifetime_value).label("avg_ltv"),
            func.min(Customer.lifetime_value).label("min_ltv"),
            func.max(Customer.lifetime_value).label("max_ltv"),
            func.sum(Customer.lifetime_value).label("total_ltv"),
            func.avg(Customer.total_orders).label("avg_orders"),
        ).first()

        return {
            "segment_id": segment_id,
            "segment_name": segment.name,
            "customer_count": segment.customer_count,
            "demographics": {
                "cities": [
                    {"city": c, "count": n} for c, n in city_dist
                ],
                "gender": [
                    {"gender": g or "unknown", "count": n} for g, n in gender_dist
                ],
                "preferred_channels": [
                    {"channel": ch, "count": n} for ch, n in channel_dist
                ],
            },
            "metrics": {
                "avg_lifetime_value": round(float(ltv_stats.avg_ltv or 0), 2),
                "min_lifetime_value": round(float(ltv_stats.min_ltv or 0), 2),
                "max_lifetime_value": round(float(ltv_stats.max_ltv or 0), 2),
                "total_lifetime_value": round(float(ltv_stats.total_ltv or 0), 2),
                "avg_orders": round(float(ltv_stats.avg_orders or 0), 1),
            },
        }
