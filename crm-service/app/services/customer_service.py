"""
Resonance CRM — Customer Service

Business logic for customer data operations.
Handles CRUD, bulk ingestion, filtering, and purchase metric updates.
"""
import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models.customer import Customer
from app.models.order import Order
from app.utils import NotFoundError, ValidationError

logger = logging.getLogger(__name__)


class CustomerService:
    """Service layer for customer operations."""

    @staticmethod
    def get_all(page=1, per_page=20, search=None, city=None,
                min_ltv=None, max_ltv=None, sort_by="created_at",
                sort_dir="desc", inactive_days=None):
        """
        Get paginated, filtered list of customers.

        Args:
            page: Page number (1-indexed)
            per_page: Items per page (max 100)
            search: Search by name or email
            city: Filter by city
            min_ltv: Minimum lifetime value
            max_ltv: Maximum lifetime value
            sort_by: Column to sort by
            sort_dir: Sort direction (asc/desc)
            inactive_days: Filter customers inactive for N+ days

        Returns:
            Dict with items, pagination metadata
        """
        per_page = min(per_page, 100)
        query = Customer.query

        # Search filter
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                db.or_(
                    Customer.name.ilike(search_term),
                    Customer.email.ilike(search_term),
                    Customer.phone.ilike(search_term),
                )
            )

        # City filter
        if city:
            query = query.filter(Customer.city == city)

        # LTV range filter
        if min_ltv is not None:
            query = query.filter(Customer.lifetime_value >= float(min_ltv))
        if max_ltv is not None:
            query = query.filter(Customer.lifetime_value <= float(max_ltv))

        # Inactive days filter
        if inactive_days is not None:
            from datetime import timedelta
            cutoff = datetime.now(timezone.utc) - timedelta(days=int(inactive_days))
            query = query.filter(
                db.or_(
                    Customer.last_purchase_at < cutoff,
                    Customer.last_purchase_at.is_(None),
                )
            )

        # Sorting
        sort_column = getattr(Customer, sort_by, Customer.created_at)
        if sort_dir == "asc":
            query = query.order_by(sort_column.asc())
        else:
            query = query.order_by(sort_column.desc())

        # Paginate
        pagination = query.paginate(
            page=page, per_page=per_page, error_out=False
        )

        return {
            "items": [c.to_dict() for c in pagination.items],
            "total": pagination.total,
            "page": pagination.page,
            "per_page": pagination.per_page,
            "pages": pagination.pages,
            "has_next": pagination.has_next,
            "has_prev": pagination.has_prev,
        }

    @staticmethod
    def get_by_id(customer_id):
        """Get a single customer by ID with order history."""
        customer = Customer.query.get(customer_id)
        if not customer:
            raise NotFoundError(f"Customer {customer_id} not found")
        return customer.to_dict(include_orders=True)

    @staticmethod
    def create(data):
        """
        Create a new customer.

        Args:
            data: Dict with customer fields

        Returns:
            Created customer dict
        """
        if not data.get("email"):
            raise ValidationError("Email is required")
        if not data.get("name"):
            raise ValidationError("Name is required")

        # Check for duplicate email
        existing = Customer.query.filter_by(email=data["email"]).first()
        if existing:
            # Upsert: update existing customer
            return CustomerService._update_customer(existing, data)

        customer = Customer(
            email=data["email"],
            name=data["name"],
            phone=data.get("phone"),
            city=data.get("city"),
            gender=data.get("gender"),
            birth_date=data.get("birth_date"),
            preferred_channel=data.get("preferred_channel", "email"),
            metadata_=data.get("metadata", {}),
        )
        db.session.add(customer)
        db.session.commit()
        logger.info(f"Created customer: {customer.email}")
        return customer.to_dict()

    @staticmethod
    def _update_customer(customer, data):
        """Update an existing customer with new data."""
        for field in ["name", "phone", "city", "gender", "preferred_channel"]:
            if data.get(field):
                setattr(customer, field, data[field])
        if data.get("metadata"):
            customer.metadata_ = {**(customer.metadata_ or {}), **data["metadata"]}
        db.session.commit()
        logger.info(f"Updated customer: {customer.email}")
        return customer.to_dict()

    @staticmethod
    def bulk_create(customers_data):
        """
        Bulk create/update customers.

        Args:
            customers_data: List of customer dicts

        Returns:
            Dict with created/updated counts
        """
        if not customers_data:
            raise ValidationError("No customer data provided")

        created = 0
        updated = 0
        errors = []

        for i, data in enumerate(customers_data):
            try:
                if not data.get("email") or not data.get("name"):
                    errors.append({"index": i, "error": "email and name required"})
                    continue

                existing = Customer.query.filter_by(email=data["email"]).first()
                if existing:
                    CustomerService._update_customer(existing, data)
                    updated += 1
                else:
                    customer = Customer(
                        email=data["email"],
                        name=data["name"],
                        phone=data.get("phone"),
                        city=data.get("city"),
                        gender=data.get("gender"),
                        birth_date=data.get("birth_date"),
                        preferred_channel=data.get("preferred_channel", "email"),
                        metadata_=data.get("metadata", {}),
                    )
                    db.session.add(customer)
                    created += 1
            except Exception as e:
                errors.append({"index": i, "error": str(e)})

        db.session.commit()
        logger.info(f"Bulk customer import: {created} created, {updated} updated, {len(errors)} errors")

        return {
            "created": created,
            "updated": updated,
            "errors": errors,
            "total_processed": created + updated,
        }

    @staticmethod
    def get_cities():
        """Get list of unique cities for filter dropdowns."""
        cities = (
            db.session.query(Customer.city)
            .filter(Customer.city.isnot(None))
            .distinct()
            .order_by(Customer.city)
            .all()
        )
        return [c[0] for c in cities]

    @staticmethod
    def get_stats():
        """Get aggregate customer statistics for dashboard."""
        from sqlalchemy import func

        total = Customer.query.count()
        stats = db.session.query(
            func.avg(Customer.lifetime_value).label("avg_ltv"),
            func.sum(Customer.lifetime_value).label("total_ltv"),
            func.avg(Customer.total_orders).label("avg_orders"),
        ).first()

        return {
            "total_customers": total,
            "avg_lifetime_value": round(float(stats.avg_ltv or 0), 2),
            "total_lifetime_value": round(float(stats.total_ltv or 0), 2),
            "avg_orders_per_customer": round(float(stats.avg_orders or 0), 1),
        }
