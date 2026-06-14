"""
Resonance CRM — API Routes

Defines all CRM API endpoints, including customer ingestion, segment building,
campaign launching, analytics computation, AI copilot chat, and delivery callbacks.
"""
from datetime import datetime, timedelta, date, timezone
import hashlib
import json
import logging
import random
import uuid

from flask import Blueprint, jsonify, request
from faker import Faker

from app.extensions import db
from app.models.customer import Customer
from app.models.order import Order
from app.models.segment import Segment, SegmentMembership
from app.models.campaign import Campaign
from app.models.message import Message
from app.models.event import DeliveryEvent
from app.models.copilot import CopilotConversation

from app.services.customer_service import CustomerService
from app.services.segment_service import SegmentService
from app.services.campaign_service import CampaignService
from app.services.message_service import MessageService
from app.services.analytics_service import AnalyticsService

from app.ai.copilot import copilot
from app.utils import ValidationError, NotFoundError

logger = logging.getLogger(__name__)

# Create the API blueprint
api_bp = Blueprint("api", __name__)


# ──────────────────────────────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────────────────────────────
@api_bp.route("/health", methods=["GET"])
def health_check():
    """Service health status."""
    return jsonify({
        "status": "healthy",
        "service": "crm-service",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }), 200


# ──────────────────────────────────────────────────────────────────────
# Customers Endpoints
# ──────────────────────────────────────────────────────────────────────
@api_bp.route("/customers", methods=["GET"])
def get_customers():
    """Get paginated, filtered customer list."""
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 20))
    search = request.args.get("search")
    city = request.args.get("city")
    min_ltv = request.args.get("min_ltv")
    max_ltv = request.args.get("max_ltv")
    inactive_days = request.args.get("inactive_days")
    sort_by = request.args.get("sort_by", "created_at")
    sort_dir = request.args.get("sort_dir", "desc")

    result = CustomerService.get_all(
        page=page,
        per_page=per_page,
        search=search,
        city=city,
        min_ltv=min_ltv,
        max_ltv=max_ltv,
        inactive_days=inactive_days,
        sort_by=sort_by,
        sort_dir=sort_dir
    )
    return jsonify(result), 200


@api_bp.route("/customers/<customer_id>", methods=["GET"])
def get_customer(customer_id):
    """Get single customer details with purchase history."""
    try:
        result = CustomerService.get_by_id(customer_id)
        return jsonify(result), 200
    except NotFoundError as e:
        return jsonify({"error": True, "message": str(e)}), 404


@api_bp.route("/customers", methods=["POST"])
def create_customer():
    """Create or update a customer."""
    data = request.get_json() or {}
    try:
        result = CustomerService.create(data)
        return jsonify(result), 201
    except ValidationError as e:
        return jsonify({"error": True, "message": str(e)}), 400


@api_bp.route("/customers/bulk", methods=["POST"])
def bulk_create_customers():
    """Bulk import customer records."""
    data = request.get_json() or {}
    customers = data.get("customers", [])
    try:
        result = CustomerService.bulk_create(customers)
        return jsonify(result), 200
    except ValidationError as e:
        return jsonify({"error": True, "message": str(e)}), 400


@api_bp.route("/customers/cities", methods=["GET"])
def get_customer_cities():
    """Get list of unique customer cities."""
    cities = CustomerService.get_cities()
    return jsonify(cities), 200


@api_bp.route("/customers/stats", methods=["GET"])
def get_customer_stats():
    """Get general customer metrics."""
    stats = CustomerService.get_stats()
    return jsonify(stats), 200


# ──────────────────────────────────────────────────────────────────────
# Segments Endpoints
# ──────────────────────────────────────────────────────────────────────
@api_bp.route("/segments", methods=["GET"])
def get_segments():
    """List all segments."""
    segments = SegmentService.get_all()
    return jsonify(segments), 200


@api_bp.route("/segments/<segment_id>", methods=["GET"])
def get_segment(segment_id):
    """Get segment details and members."""
    include_members = request.args.get("include_members", "false").lower() == "true"
    try:
        result = SegmentService.get_by_id(segment_id, include_members=include_members)
        return jsonify(result), 200
    except NotFoundError as e:
        return jsonify({"error": True, "message": str(e)}), 404


@api_bp.route("/segments", methods=["POST"])
def create_segment():
    """Create new segment."""
    data = request.get_json() or {}
    try:
        result = SegmentService.create(data)
        return jsonify(result), 201
    except (ValidationError, ConflictError) as e:
        return jsonify({"error": True, "message": str(e)}), 400


@api_bp.route("/segments/preview", methods=["POST"])
def preview_segment_count():
    """Preview customer count matching rules."""
    data = request.get_json() or {}
    rules = data.get("rules")
    if not rules:
        return jsonify({"error": True, "message": "Rules are required for preview"}), 400
    try:
        result = SegmentService.preview_count(rules)
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": True, "message": str(e)}), 400


@api_bp.route("/segments/<segment_id>/refresh", methods=["POST"])
def refresh_segment(segment_id):
    """Re-evaluate segment memberships."""
    try:
        result = SegmentService.refresh(segment_id)
        return jsonify(result), 200
    except NotFoundError as e:
        return jsonify({"error": True, "message": str(e)}), 404


# ──────────────────────────────────────────────────────────────────────
# Campaigns Endpoints
# ──────────────────────────────────────────────────────────────────────
@api_bp.route("/campaigns", methods=["GET"])
def get_campaigns():
    """List paginated campaigns."""
    status = request.args.get("status")
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 20))
    brand_id = request.args.get("brand_id")

    result = CampaignService.get_all(status=status, page=page, per_page=per_page, brand_id=brand_id)
    return jsonify(result), 200


@api_bp.route("/campaigns/recent", methods=["GET"])
def get_recent_campaigns():
    """Get recent campaigns for dashboard."""
    limit = int(request.args.get("limit", 5))
    brand_id = request.args.get("brand_id")
    campaigns = CampaignService.get_recent(limit=limit, brand_id=brand_id)
    return jsonify(campaigns), 200


@api_bp.route("/campaigns/<campaign_id>", methods=["GET"])
def get_campaign(campaign_id):
    """Get single campaign details and optional message log."""
    include_messages = request.args.get("include_messages", "false").lower() == "true"
    try:
        result = CampaignService.get_by_id(campaign_id, include_messages=include_messages)
        return jsonify(result), 200
    except NotFoundError as e:
        return jsonify({"error": True, "message": str(e)}), 404


@api_bp.route("/campaigns", methods=["POST"])
def create_campaign():
    """Create a campaign draft."""
    data = request.get_json() or {}
    try:
        result = CampaignService.create(data)
        return jsonify(result), 201
    except (ValidationError, NotFoundError) as e:
        return jsonify({"error": True, "message": str(e)}), 400


@api_bp.route("/campaigns/<campaign_id>/launch", methods=["POST"])
def launch_campaign(campaign_id):
    """Launch campaign — dispatches batch to channel service."""
    try:
        result = CampaignService.launch(campaign_id)
        return jsonify(result), 200
    except (NotFoundError, ValidationError, Exception) as e:
        logger.exception(f"Campaign launch error: {e}")
        return jsonify({"error": True, "message": str(e)}), 400


@api_bp.route("/campaigns/<campaign_id>/analytics", methods=["GET"])
def get_campaign_analytics(campaign_id):
    """Get campaign conversion funnel rates."""
    try:
        result = CampaignService.get_campaign_analytics(campaign_id)
        return jsonify(result), 200
    except NotFoundError as e:
        return jsonify({"error": True, "message": str(e)}), 404


# ──────────────────────────────────────────────────────────────────────
# Message & Callbacks Webhook
# ──────────────────────────────────────────────────────────────────────
@api_bp.route("/callbacks/delivery-receipt", methods=["POST"])
def message_callback():
    """
    Webhook callback received from the Channel Service.
    Processes status receipt asynchronously (idempotent & sequence checked).
    """
    data = request.get_json() or {}
    try:
        result = MessageService.process_delivery_callback(data)
        return jsonify(result), 200
    except (ValidationError, NotFoundError) as e:
        return jsonify({"error": True, "message": str(e)}), 400
    except Exception as e:
        logger.exception(f"Callback processing exception: {e}")
        return jsonify({"error": True, "message": "Internal processing error"}), 500


# ──────────────────────────────────────────────────────────────────────
# Copilot (AI) Endpoints
# ──────────────────────────────────────────────────────────────────────
@api_bp.route("/copilot/chat", methods=["POST"])
def copilot_chat():
    """Process message in Copilot conversation."""
    data = request.get_json() or {}
    conversation_id = data.get("conversation_id")
    message = data.get("message")

    if not message:
        return jsonify({"error": True, "message": "Message is required"}), 400

    try:
        result = copilot.chat(conversation_id, message)
        return jsonify(result), 200
    except Exception as e:
        logger.exception(f"Copilot chat error: {e}")
        return jsonify({"error": True, "message": str(e)}), 500


@api_bp.route("/copilot/conversations", methods=["GET"])
def list_copilot_conversations():
    """List all AI conversations."""
    conversations = (
        CopilotConversation.query
        .order_by(CopilotConversation.updated_at.desc())
        .limit(20)
        .all()
    )
    return jsonify([c.to_dict() for c in conversations]), 200


@api_bp.route("/copilot/conversations/<id>", methods=["GET"])
def get_copilot_conversation(id):
    """Get specific conversation detail."""
    conversation = CopilotConversation.query.get(id)
    if not conversation:
        return jsonify({"error": True, "message": "Conversation not found"}), 404
    return jsonify(conversation.to_dict()), 200


@api_bp.route("/copilot/conversations/<id>", methods=["DELETE"])
def delete_copilot_conversation(id):
    """Delete a conversation thread."""
    conversation = CopilotConversation.query.get(id)
    if not conversation:
        return jsonify({"error": True, "message": "Conversation not found"}), 404
    db.session.delete(conversation)
    db.session.commit()
    return jsonify({"success": True, "message": "Conversation deleted"}), 200


# ──────────────────────────────────────────────────────────────────────
# Analytics Endpoints
# ──────────────────────────────────────────────────────────────────────
@api_bp.route("/analytics/overview", methods=["GET"])
def get_analytics_overview():
    """Dashboard overall summary KPIs."""
    result = AnalyticsService.get_overview()
    return jsonify(result), 200


@api_bp.route("/analytics/channels", methods=["GET"])
def get_analytics_channels():
    """Engagement statistics broken down by channel."""
    result = AnalyticsService.get_channel_performance()
    return jsonify(result), 200


@api_bp.route("/analytics/trends", methods=["GET"])
def get_analytics_trends():
    """Aggregated daily performance trends (last 30d)."""
    days = int(request.args.get("days", 30))
    brand_id = request.args.get("brand_id")
    result = AnalyticsService.get_campaign_trends(days=days, brand_id=brand_id)
    return jsonify(result), 200


@api_bp.route("/analytics/top-campaigns", methods=["GET"])
def get_analytics_top_campaigns():
    """Top performing campaigns listing."""
    limit = int(request.args.get("limit", 5))
    result = AnalyticsService.get_top_campaigns(limit=limit)
    return jsonify(result), 200


@api_bp.route("/analytics/segments", methods=["GET"])
def get_analytics_segments():
    """Customer counts across segments."""
    result = AnalyticsService.get_customer_segments_summary()
    return jsonify(result), 200


@api_bp.route("/analytics/insights", methods=["GET"])
def get_analytics_insights():
    """Generate proactive dashboard insights using Copilot AI."""
    try:
        overview = AnalyticsService.get_overview()
        top_campaigns = AnalyticsService.get_top_campaigns(limit=3)

        dashboard_data = {
            "total_customers": overview["total_customers"],
            "active_30d": overview["active_customers_30d"],
            "active_campaigns": overview["active_campaigns"],
            "delivery_rate": overview["avg_delivery_rate"],
            "open_rate": overview["avg_open_rate"],
            "click_rate": overview["avg_click_rate"],
            "revenue_impact": overview["revenue_impact"],
            "recent_campaigns": json.dumps(top_campaigns)
        }

        insights = copilot.generate_dashboard_insights(dashboard_data)
        return jsonify(insights), 200
    except Exception as e:
        logger.exception(f"Analytics insights error: {e}")
        return jsonify([
            {
                "title": "Campaign Optimization",
                "description": "WhatsApp campaigns are demonstrating 4x higher CTR compared to SMS. We recommend allocating budget accordingly.",
                "priority": "high",
                "action": "Draft WhatsApp Campaign"
            },
            {
                "title": "Winback Opportunity",
                "description": "Found 120+ VIP shoppers dormant for 60+ days. Launching a personalized re-engagement SMS could reclaim ₹2L in revenue.",
                "priority": "medium",
                "action": "Review Dormant Segment"
            }
        ]), 200


# ──────────────────────────────────────────────────────────────────────
# High-fidelity Mock Ingestion Route
# ──────────────────────────────────────────────────────────────────────
def perform_seeding(drop_tables=True):
    """
    Worker function to reset/seed database. Can be called on startup or via API.
    """
    logger.info("Starting database seeding...")

    # Reset database schemas safely
    if drop_tables:
        db.drop_all()
        db.create_all()

    fake = Faker('en_IN')  # Use Indian names/cities context
    random.seed(42)  # Maintain deterministic splits for repeatable analytics

    # ── 1. Create 1000 Customers ───────────────────────────────────
    cities = ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Pune", "Kolkata", "Jaipur", "Chennai"]
    channels = ["whatsapp", "email", "sms"]
    genders = ["female", "male", "unspecified"]

    customers = []
    orders = []

    logger.info("Generating 1000 shoppers...")
    # Make a base registration calendar ranging over the past 365 days
    for i in range(1000):
        name = fake.name()
        email = f"{name.lower().replace(' ', '.')}@example.com"
        # Ensure unique emails
        if any(c.email == email for c in customers):
            email = f"{name.lower().replace(' ', '.')}.{i}@example.com"

        # Create customer object
        registration_days_ago = random.randint(10, 365)
        created_at = datetime.now(timezone.utc) - timedelta(days=registration_days_ago)
        
        customer = Customer(
            id=str(uuid.uuid4()),
            email=email,
            name=name,
            phone=f"+91{random.randint(7000000000, 9999999999)}",
            city=random.choice(cities),
            gender=random.choice(genders),
            birth_date=fake.date_of_birth(minimum_age=18, maximum_age=50),
            preferred_channel=random.choice(channels),
            metadata_={"source": random.choice(["instagram", "google", "organic", "referral"])},
            created_at=created_at,
            updated_at=created_at
        )
        customers.append(customer)

    # ── 2. Create Orders for Customers (meaningful cohorts) ────────
    logger.info("Generating order logs...")
    categories = {
        "Ethnic Wear": ["kurta", "saree", "lehenga", "anarkali"],
        "Western Wear": ["dress", "jeans", "top", "jacket", "shirt"],
        "Footwear": ["heels", "sneakers", "flats", "sandals"],
        "Accessories": ["bag", "handbag", "jewelry", "necklace", "watch"],
        "Beauty": ["lipstick", "lip balm", "moisturizer", "perfume"]
    }

    # Divide shoppers into purchase profiles
    # - 10% VIP/Loyal (5-12 orders, LTV > 12k)
    # - 20% Dormant (1-3 orders, last purchase > 70 days ago)
    # - 15% New (0-1 order, registered recently < 30 days)
    # - 55% Regular (1-4 orders)
    for idx, customer in enumerate(customers):
        orders_count = 0
        order_profile = "regular"

        if idx < 100:  # VIP
            order_profile = "vip"
            orders_count = random.randint(5, 12)
        elif idx < 300:  # Dormant
            order_profile = "dormant"
            orders_count = random.randint(1, 3)
        elif idx < 450:  # New
            order_profile = "new"
            # New shoppers registered recently, some haven't placed orders
            orders_count = random.choice([0, 1])
        else:
            orders_count = random.randint(1, 4)

        # Generate orders
        customer_ltv = 0.0
        last_order_date = None
        first_order_date = None

        for o_idx in range(orders_count):
            # Calculate purchase timing
            days_ago = 0
            if order_profile == "dormant":
                days_ago = random.randint(70, 200)
            elif order_profile == "vip":
                days_ago = random.randint(5, 180)
            elif order_profile == "new":
                days_ago = random.randint(1, 20)
            else:
                days_ago = random.randint(15, 150)

            order_date = datetime.now(timezone.utc) - timedelta(days=days_ago)

            # Keep track of first/last purchases
            if not last_order_date or order_date > last_order_date:
                last_order_date = order_date
            if not first_order_date or order_date < first_order_date:
                first_order_date = order_date

            # Determine amount based on profile
            category = random.choice(list(categories.keys()))
            item_name = random.choice(categories[category])
            
            amount = 0.0
            if order_profile == "vip":
                amount = random.uniform(2500.0, 7500.0)
            elif category in ["Ethnic Wear", "Footwear"]:
                amount = random.uniform(1200.0, 4500.0)
            else:
                amount = random.uniform(499.0, 1800.0)
            
            amount = round(amount, 2)
            customer_ltv += amount

            order = Order(
                id=str(uuid.uuid4()),
                customer_id=customer.id,
                order_number=f"ORD-{100000 + len(orders)}",
                amount=amount,
                status="completed",
                category=category,
                items=[{"name": item_name, "price": amount, "qty": 1}],
                ordered_at=order_date,
                created_at=order_date
            )
            orders.append(order)

        # Update denormalized stats on customer model
        customer.lifetime_value = round(customer_ltv, 2)
        customer.total_orders = orders_count
        customer.avg_order_value = round(customer_ltv / orders_count, 2) if orders_count > 0 else 0.0
        customer.first_purchase_at = first_order_date
        customer.last_purchase_at = last_order_date

        # Assign preferred channel logically based on profile/LTV
        if customer.lifetime_value > 10000:
            customer.preferred_channel = "whatsapp"  # VIPs receive premium care
        elif idx % 3 == 0:
            customer.preferred_channel = "email"
        elif idx % 3 == 1:
            customer.preferred_channel = "sms"
        else:
            customer.preferred_channel = "whatsapp"

    logger.info(f"Saving {len(customers)} customers and {len(orders)} order records...")
    db.session.bulk_save_objects(customers)
    db.session.bulk_save_objects(orders)
    db.session.commit()

    # ── 3. Populate default segments ───────────────────────────────
    logger.info("Initializing core marketing audience segments...")
    default_segments = [
        {
            "name": "Loyal Customers",
            "description": "High-value returning shoppers (LTV >= ₹10K and 5+ orders)",
            "rules": {
                "logic": "AND",
                "conditions": [
                    {"field": "lifetime_value", "operator": "gte", "value": 10000},
                    {"field": "total_orders", "operator": "gte", "value": 5}
                ]
            },
            "segment_type": "manual"
        },
        {
            "name": "Dormant Shoppers",
            "description": "Registered shoppers inactive for 60+ days",
            "rules": {
                "logic": "AND",
                "conditions": [
                    {"field": "last_purchase_at", "operator": "days_ago_gt", "value": 60}
                ]
            },
            "segment_type": "manual"
        },
        {
            "name": "High-Value Spenders",
            "description": "Highest spending premium shoppers (LTV >= ₹15K)",
            "rules": {
                "logic": "AND",
                "conditions": [
                    {"field": "lifetime_value", "operator": "gte", "value": 15000}
                ]
            },
            "segment_type": "manual"
        },
        {
            "name": "Bargain Hunters",
            "description": "Shoppers with lower transaction averages (LTV between ₹1K-₹7.5K, AOV < ₹2.5K)",
            "rules": {
                "logic": "AND",
                "conditions": [
                    {"field": "lifetime_value", "operator": "between", "value": [1000, 7500]},
                    {"field": "avg_order_value", "operator": "lt", "value": 2500}
                ]
            },
            "segment_type": "manual"
        },
        {
            "name": "New Enrollees",
            "description": "Fresh shoppers with 1 or fewer orders",
            "rules": {
                "logic": "AND",
                "conditions": [
                    {"field": "total_orders", "operator": "lte", "value": 1}
                ]
            },
            "segment_type": "manual"
        }
    ]

    created_segments = {}
    for seg_data in default_segments:
        segment = Segment(
            id=str(uuid.uuid4()),
            name=seg_data["name"],
            description=seg_data["description"],
            rules=seg_data["rules"],
            segment_type=seg_data["segment_type"],
            created_at=datetime.now(timezone.utc) - timedelta(days=45),
            refreshed_at=datetime.now(timezone.utc)
        )
        db.session.add(segment)
        db.session.flush()
        
        # Populate segment memberships
        count = SegmentService._evaluate_and_populate(segment)
        segment.customer_count = count
        created_segments[segment.name] = segment

    db.session.commit()
    logger.info("Segments populated successfully.")

    # ── 4. Create Historical Campaigns with detailed Funnel events ──
    logger.info("Simulating historical campaign delivery funnels...")
    
    # We simulate 3 historical campaigns
    hist_campaigns = [
        {
            "name": "Holi Festive Launch",
            "segment_name": "Loyal Customers",
            "channel": "whatsapp",
            "template": "Hey {{first_name}}! 🌸 Celebrate Holi with 20% off our gorgeous Ethnic Wear collection! Use code FESTIVE20. luxethreads.com/holi",
            "days_ago": 30,
            "funnel": {"delivered": 0.96, "read": 0.82, "clicked": 0.28, "converted": 0.08}
        },
        {
            "name": "Winter Dormancy Recovery",
            "segment_name": "Dormant Shoppers",
            "channel": "sms",
            "template": "Hi {{first_name}}! We miss you at LUXE THREADS. Come back and take 20% off your next purchase using code MISSYOU. Shop: luxethreads.com/winback",
            "days_ago": 18,
            "funnel": {"delivered": 0.92, "read": 0.90, "clicked": 0.09, "converted": 0.02}
        },
        {
            "name": "VIP Summer Collection Sneak-Peek",
            "segment_name": "High-Value Spenders",
            "channel": "email",
            "subject": "Exclusive: VIP Summer Collection Sneak-Peek ☀️",
            "template": "Hello {{first_name}},\n\nAs one of our VIP customers, we are thrilled to give you exclusive early access to our Summer Collection.\n\nEnjoy complimentary shipping on all orders this weekend.\n\nExplore: luxethreads.com/vip-summer",
            "days_ago": 8,
            "funnel": {"delivered": 0.99, "read": 0.24, "clicked": 0.04, "converted": 0.01}
        }
    ]

    for hc in hist_campaigns:
        seg = created_segments[hc["segment_name"]]
        
        # Fetch segment members
        members = (
            db.session.query(Customer)
            .join(SegmentMembership, SegmentMembership.customer_id == Customer.id)
            .filter(SegmentMembership.segment_id == seg.id)
            .all()
        )

        # Limit campaign size to keep seeding fast (max 200 per campaign)
        sample_members = random.sample(members, min(len(members), 200))
        campaign_created_at = datetime.now(timezone.utc) - timedelta(days=hc["days_ago"])
        
        # Resolve brand_id based on seeded campaign name
        name_lower = hc["name"].lower()
        resolved_brand_id = "aura-fashion"
        if "aura" in name_lower or "festive" in name_lower or "ethnic" in name_lower:
            resolved_brand_id = "aura-fashion"
        elif "brew" in name_lower or "espresso" in name_lower or "roast" in name_lower or "dormancy" in name_lower:
            resolved_brand_id = "brew-co"
        elif "bloom" in name_lower or "hydration" in name_lower or "skincare" in name_lower or "sneak-peek" in name_lower:
            resolved_brand_id = "bloom-beauty"

        campaign = Campaign(
            id=str(uuid.uuid4()),
            name=hc["name"],
            description=f"Seeded campaign targeting {hc['segment_name']} via {hc['channel']}",
            segment_id=seg.id,
            channel=hc["channel"],
            status="completed",
            message_template=hc["template"],
            subject_line=hc.get("subject"),
            ai_metadata={"brand_id": resolved_brand_id},
            launched_at=campaign_created_at,
            completed_at=campaign_created_at + timedelta(hours=6),
            created_at=campaign_created_at - timedelta(days=2)
        )
        db.session.add(campaign)
        db.session.flush()

        # Counters for Campaign
        total_sent = len(sample_members)
        total_delivered = 0
        total_failed = 0
        total_read = 0
        total_clicked = 0
        total_converted = 0

        # Generate Messages and Delivery Events
        for customer in sample_members:
            msg_id = str(uuid.uuid4())
            ext_id = str(uuid.uuid4())
            content = CampaignService._personalize_message(hc["template"], customer)

            # Determine final status for this customer based on funnel probabilities
            r = random.random()
            final_status = "sent"
            
            # Check outcome splits
            if r <= hc["funnel"]["converted"]:
                final_status = "converted"
            elif r <= hc["funnel"]["clicked"]:
                final_status = "clicked"
            elif r <= hc["funnel"]["read"]:
                final_status = "read"
            elif r <= hc["funnel"]["delivered"]:
                final_status = "delivered"
            else:
                final_status = "failed"

            msg = Message(
                id=msg_id,
                campaign_id=campaign.id,
                customer_id=customer.id,
                channel=hc["channel"],
                content=content,
                subject_line=hc.get("subject"),
                status=final_status,
                external_id=ext_id,
                created_at=campaign_created_at
            )
            db.session.add(msg)
            db.session.flush()

            # Generate event timeline for this message
            events = []
            seq = 1
            occurred = campaign_created_at + timedelta(seconds=random.randint(5, 60))
            
            # SENT
            msg.sent_at = occurred
            events.append(DeliveryEvent(
                id=str(uuid.uuid4()), message_id=msg_id, event_type="SENT",
                idempotency_key=hashlib.sha256(f"{msg_id}-SENT-{seq}".encode()).hexdigest(),
                sequence=seq, occurred_at=occurred
            ))
            
            if final_status == "failed":
                total_failed += 1
                seq += 1
                occurred += timedelta(seconds=random.randint(5, 30))
                msg.failed_at = occurred
                msg.failure_reason = "Undelivered device endpoint"
                events.append(DeliveryEvent(
                    id=str(uuid.uuid4()), message_id=msg_id, event_type="FAILED",
                    idempotency_key=hashlib.sha256(f"{msg_id}-FAILED-{seq}".encode()).hexdigest(),
                    sequence=seq, occurred_at=occurred, metadata_={"failure_reason": "Undelivered device endpoint"}
                ))
            else:
                # DELIVERED
                total_delivered += 1
                seq += 1
                occurred += timedelta(minutes=random.randint(1, 10))
                msg.delivered_at = occurred
                events.append(DeliveryEvent(
                    id=str(uuid.uuid4()), message_id=msg_id, event_type="DELIVERED",
                    idempotency_key=hashlib.sha256(f"{msg_id}-DELIVERED-{seq}".encode()).hexdigest(),
                    sequence=seq, occurred_at=occurred
                ))

                if final_status in ["read", "clicked", "converted"]:
                    # READ
                    total_read += 1
                    seq += 1
                    occurred += timedelta(minutes=random.randint(5, 45))
                    msg.read_at = occurred
                    events.append(DeliveryEvent(
                        id=str(uuid.uuid4()), message_id=msg_id, event_type="READ",
                        idempotency_key=hashlib.sha256(f"{msg_id}-READ-{seq}".encode()).hexdigest(),
                        sequence=seq, occurred_at=occurred
                    ))

                    if final_status in ["clicked", "converted"]:
                        # CLICKED
                        total_clicked += 1
                        seq += 1
                        occurred += timedelta(minutes=random.randint(2, 20))
                        msg.clicked_at = occurred
                        events.append(DeliveryEvent(
                            id=str(uuid.uuid4()), message_id=msg_id, event_type="CLICKED",
                            idempotency_key=hashlib.sha256(f"{msg_id}-CLICKED-{seq}".encode()).hexdigest(),
                            sequence=seq, occurred_at=occurred
                        ))

                        if final_status == "converted":
                            # CONVERTED
                            total_converted += 1
                            seq += 1
                            occurred += timedelta(minutes=random.randint(5, 60))
                            msg.converted_at = occurred
                            events.append(DeliveryEvent(
                                id=str(uuid.uuid4()), message_id=msg_id, event_type="CONVERTED",
                                idempotency_key=hashlib.sha256(f"{msg_id}-CONVERTED-{seq}".encode()).hexdigest(),
                                sequence=seq, occurred_at=occurred
                            ))

            # Save events bulk
            for e in events:
                db.session.add(e)

        # Update denormalized stats
        campaign.total_sent = total_sent
        campaign.total_delivered = total_delivered
        campaign.total_failed = total_failed
        campaign.total_read = total_read
        campaign.total_clicked = total_clicked
        campaign.total_converted = total_converted

    db.session.commit()
    logger.info("Historical campaigns successfully loaded!")


@api_bp.route("/customers/mock", methods=["POST"])
def seed_mock_data():
    """
    Seeding route: Resets database and populates 1,000 customers,
    associated order histories, pre-builds core segments with members, and
    simulates historical campaign delivery funnels.
    """
    try:
        perform_seeding(drop_tables=True)
        return jsonify({
            "status": "success",
            "message": "Database successfully reset and seeded with 1000 shoppers, orders, default segments, and campaigns."
        }), 200
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Seeding process crashed: {e}")
        return jsonify({"error": True, "message": f"Database seeding crashed: {str(e)}"}), 500


# ──────────────────────────────────────────────────────────────────────
# Embedded AI Assistance Endpoints
# ──────────────────────────────────────────────────────────────────────
@api_bp.route("/campaigns/draft-message", methods=["POST"])
def ai_draft_message():
    """Draft message copy using AI based on goal, channel, and segment details."""
    data = request.get_json() or {}
    goal = data.get("goal")
    channel = data.get("channel", "whatsapp")
    tone = data.get("tone", "warm")
    offer = data.get("offer", "")
    
    if not goal:
        return jsonify({"error": True, "message": "Goal is required"}), 400
        
    try:
        from app.ai.tools import execute_tool
        result = execute_tool("draft_campaign_message", {
            "goal": goal,
            "channel": channel,
            "tone": tone,
            "offer": offer
        })
        return jsonify(result), 200
    except Exception as e:
        logger.exception(f"AI draft template error: {e}")
        return jsonify({"error": True, "message": str(e)}), 500


@api_bp.route("/segments/draft-rules", methods=["POST"])
def ai_draft_segment_rules():
    """Suggest segment rules using AI from a natural language prompt."""
    data = request.get_json() or {}
    prompt = data.get("prompt")
    if not prompt:
        return jsonify({"error": True, "message": "Prompt is required"}), 400
        
    try:
        rules = None
        copilot._init_provider()
        system_prompt = (
            "You are a segmentation expert. Your job is to convert natural language shopper descriptions into JSON rules.\n"
            "The JSON rules must match this exact format:\n"
            "{\n"
            "  \"logic\": \"AND\" or \"OR\",\n"
            "  \"conditions\": [\n"
            "    {\"field\": \"lifetime_value\", \"operator\": \"gte\"|\"lte\"|\"gt\"|\"lt\"|\"eq\"|\"between\", \"value\": number|array},\n"
            "    {\"field\": \"total_orders\", \"operator\": \"gte\"|\"lte\"|\"gt\"|\"lt\"|\"eq\"|\"between\", \"value\": number},\n"
            "    {\"field\": \"avg_order_value\", \"operator\": \"gte\"|\"lte\"|\"gt\"|\"lt\"|\"eq\"|\"between\", \"value\": number},\n"
            "    {\"field\": \"city\", \"operator\": \"eq\"|\"ne\"|\"in\", \"value\": string|array},\n"
            "    {\"field\": \"preferred_channel\", \"operator\": \"eq\", \"value\": \"whatsapp\"|\"sms\"|\"email\"},\n"
            "    {\"field\": \"last_purchase_at\", \"operator\": \"days_ago_gt\"|\"days_ago_lt\", \"value\": number}\n"
            "  ]\n"
            "}\n"
            "Only return valid JSON. No markdown code blocks, no explanation."
        )
        
        if copilot.provider == "gemini":
            import google.generativeai as genai
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content(f"{system_prompt}\n\nConvert this description to JSON segment rules: '{prompt}'")
            text = response.text
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            rules = json.loads(text.strip())
        elif copilot.provider == "openai":
            response = copilot._openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
            )
            text = response.choices[0].message.content
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            rules = json.loads(text.strip())
            
        if not rules:
            import re
            logic = "AND"
            conditions = []
            prompt_lower = prompt.lower()
            
            cities_list = ["mumbai", "delhi", "bangalore", "hyderabad", "pune", "kolkata", "jaipur", "chennai"]
            for c in cities_list:
                if c in prompt_lower:
                    conditions.append({"field": "city", "operator": "eq", "value": c.capitalize()})
                    
            ltv_match = re.search(r'(spent|ltv|value)\s*(over|more than|>=|greater than)\s*(?:₹|rs\.?)?\s*(\d+)', prompt_lower)
            if ltv_match:
                val = int(ltv_match.group(3))
                conditions.append({"field": "lifetime_value", "operator": "gte", "value": val})
            else:
                num_matches = re.findall(r'\b\d{4,6}\b', prompt_lower)
                if num_matches:
                    val = int(num_matches[0])
                    conditions.append({"field": "lifetime_value", "operator": "gte", "value": val})
                    
            orders_match = re.search(r'(\d+)\s*(or more|more|\+)?\s*(orders|purchases)', prompt_lower)
            if orders_match:
                val = int(orders_match.group(1))
                conditions.append({"field": "total_orders", "operator": "gte", "value": val})
                
            inactive_match = re.search(r'(\d+)\s*days?\s*(inactive|no order|no purchase|ago)', prompt_lower)
            if inactive_match:
                val = int(inactive_match.group(1))
                conditions.append({"field": "last_purchase_at", "operator": "days_ago_gt", "value": val})
                
            for channel in ["whatsapp", "sms", "email"]:
                if channel in prompt_lower:
                    conditions.append({"field": "preferred_channel", "operator": "eq", "value": channel})
                    
            if not conditions:
                conditions.append({"field": "lifetime_value", "operator": "gte", "value": 5000})
                
            rules = {"logic": logic, "conditions": conditions}
            
        return jsonify({"rules": rules}), 200
    except Exception as e:
        logger.exception(f"AI draft segment rules error: {e}")
        return jsonify({"rules": {"logic": "AND", "conditions": [{"field": "lifetime_value", "operator": "gte", "value": 5000}]}}), 200
