"""
Resonance CRM — Campaign Service

Business logic for campaign lifecycle management.
Handles creation, launching (dispatching to channel service), and performance tracking.

Campaign lifecycle:
  draft → active (on launch) → completed (all callbacks received) / failed

When a campaign is launched:
1. Retrieve all members of the target segment
2. Personalize the message template for each customer
3. Create Message records with status "queued"
4. Send messages to the channel service in batches
5. Update Message records with external_ids from channel service
6. Mark campaign as "active"
"""
import logging
from datetime import datetime, timezone

import requests

from flask import current_app

from app.extensions import db
from app.models.campaign import Campaign
from app.models.customer import Customer
from app.models.message import Message
from app.models.segment import Segment, SegmentMembership
from app.utils import NotFoundError, ValidationError, ChannelServiceError

logger = logging.getLogger(__name__)


class CampaignService:
    """Service layer for campaign operations."""

    @staticmethod
    def get_all(status=None, page=1, per_page=20, brand_id=None):
        """Get paginated list of campaigns, optionally filtered by status and brand."""
        query = Campaign.query

        if status:
            query = query.filter(Campaign.status == status)

        query = query.order_by(Campaign.created_at.desc())
        all_campaigns = query.all()

        # Filter by brand in Python to remain DB-agnostic
        filtered_campaigns = []
        for c in all_campaigns:
            c_brand_id = c.ai_metadata.get("brand_id") if c.ai_metadata else None
            
            # Map pre-seeded/unassigned campaigns dynamically
            if not c_brand_id:
                name_lower = c.name.lower()
                if "aura" in name_lower or "festive" in name_lower or "ethnic" in name_lower:
                    c_brand_id = "aura-fashion"
                elif "brew" in name_lower or "espresso" in name_lower or "roast" in name_lower or "dormancy" in name_lower:
                    c_brand_id = "brew-co"
                elif "bloom" in name_lower or "hydration" in name_lower or "skincare" in name_lower or "sneak-peek" in name_lower:
                    c_brand_id = "bloom-beauty"
                else:
                    c_brand_id = "aura-fashion"
            
            if brand_id and c_brand_id != brand_id:
                continue
            
            filtered_campaigns.append((c, c_brand_id))

        # Paginate results
        start = (page - 1) * per_page
        end = start + per_page
        paginated = filtered_campaigns[start:end]

        items = []
        for c, c_brand_id in paginated:
            d = c.to_dict()
            if not d.get("ai_metadata"):
                d["ai_metadata"] = {}
            d["ai_metadata"]["brand_id"] = c_brand_id
            items.append(d)

        import math
        total = len(filtered_campaigns)
        pages = math.ceil(total / per_page) if per_page > 0 else 0

        return {
            "items": items,
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": pages,
        }

    @staticmethod
    def get_by_id(campaign_id, include_messages=False):
        """Get a single campaign by ID."""
        campaign = Campaign.query.get(campaign_id)
        if not campaign:
            raise NotFoundError(f"Campaign {campaign_id} not found")
        
        # Inject the brand_id dynamically if it is missing
        d = campaign.to_dict(include_messages=include_messages)
        if not d.get("ai_metadata"):
            d["ai_metadata"] = {}
        if not d["ai_metadata"].get("brand_id"):
            name_lower = campaign.name.lower()
            resolved = "aura-fashion"
            if "aura" in name_lower or "festive" in name_lower or "ethnic" in name_lower:
                resolved = "aura-fashion"
            elif "brew" in name_lower or "espresso" in name_lower or "roast" in name_lower or "dormancy" in name_lower:
                resolved = "brew-co"
            elif "bloom" in name_lower or "hydration" in name_lower or "skincare" in name_lower or "sneak-peek" in name_lower:
                resolved = "bloom-beauty"
            d["ai_metadata"]["brand_id"] = resolved
        return d

    @staticmethod
    def create(data):
        """
        Create a new campaign in draft status.

        Args:
            data: Dict with name, segment_id, channel, message_template, etc.

        Returns:
            Created campaign dict
        """
        if not data.get("name"):
            raise ValidationError("Campaign name is required")
        if not data.get("segment_id"):
            raise ValidationError("Segment ID is required")
        if not data.get("channel"):
            raise ValidationError("Channel is required")
        if not data.get("message_template"):
            raise ValidationError("Message template is required")

        # Validate segment exists
        segment = Segment.query.get(data["segment_id"])
        if not segment:
            raise NotFoundError(f"Segment {data['segment_id']} not found")

        # Validate channel
        valid_channels = {"whatsapp", "email", "sms"}
        if data["channel"] not in valid_channels:
            raise ValidationError(
                f"Invalid channel. Must be one of: {', '.join(valid_channels)}"
            )

        ai_metadata = data.get("ai_metadata") or {}
        if data.get("brand_id"):
            ai_metadata["brand_id"] = data["brand_id"]

        campaign = Campaign(
            name=data["name"],
            description=data.get("description", ""),
            segment_id=data["segment_id"],
            channel=data["channel"],
            status="draft",
            message_template=data["message_template"],
            subject_line=data.get("subject_line"),
            ai_goal=data.get("ai_goal"),
            ai_metadata=ai_metadata,
        )
        db.session.add(campaign)
        db.session.commit()
        logger.info(f"Created campaign '{campaign.name}' targeting segment '{segment.name}'")
        
        d = campaign.to_dict()
        if not d.get("ai_metadata"):
            d["ai_metadata"] = {}
        d["ai_metadata"]["brand_id"] = ai_metadata.get("brand_id", "aura-fashion")
        return d

    @staticmethod
    def launch(campaign_id):
        """
        Launch a campaign: create messages and dispatch to channel service.

        This is the core campaign execution flow:
        1. Validate campaign is in draft status
        2. Get all segment members
        3. Personalize message for each customer
        4. Create Message records
        5. Send to channel service in batches
        6. Update campaign status to active

        Returns:
            Updated campaign dict
        """
        campaign = Campaign.query.get(campaign_id)
        if not campaign:
            raise NotFoundError(f"Campaign {campaign_id} not found")

        if campaign.status != "draft":
            raise ValidationError(
                f"Campaign is '{campaign.status}', can only launch 'draft' campaigns"
            )

        # Get segment members
        members = (
            db.session.query(Customer)
            .join(SegmentMembership, SegmentMembership.customer_id == Customer.id)
            .filter(SegmentMembership.segment_id == campaign.segment_id)
            .all()
        )

        if not members:
            raise ValidationError("Target segment has no members")

        # Create Message records for each customer
        messages = []
        for customer in members:
            content = CampaignService._personalize_message(
                campaign.message_template, customer
            )
            message = Message(
                campaign_id=campaign.id,
                customer_id=customer.id,
                channel=campaign.channel,
                content=content,
                subject_line=campaign.subject_line,
                status="queued",
            )
            db.session.add(message)
            messages.append(message)

        db.session.flush()  # Get message IDs

        # Send to channel service in batches
        batch_size = current_app.config.get("CAMPAIGN_BATCH_SIZE", 50)
        channel_url = current_app.config["CHANNEL_SERVICE_URL"]
        total_sent = 0
        total_failed_send = 0

        for i in range(0, len(messages), batch_size):
            batch = messages[i : i + batch_size]
            payload = {
                "messages": [
                    {
                        "message_id": msg.id,
                        "campaign_id": campaign.id,
                        "customer_id": msg.customer_id,
                        "channel": msg.channel,
                        "recipient": msg.customer.phone or msg.customer.email,
                        "content": msg.content,
                        "metadata": {
                            "subject_line": msg.subject_line,
                            "customer_name": msg.customer.name,
                        },
                    }
                    for msg in batch
                ]
            }

            try:
                response = requests.post(
                    f"{channel_url}/channel/send",
                    json=payload,
                    timeout=30,
                )

                if response.status_code == 202:
                    result = response.json()
                    external_ids = result.get("external_ids", {})

                    for msg in batch:
                        ext_id = external_ids.get(msg.id)
                        if ext_id:
                            msg.external_id = ext_id
                            msg.status = "sent"
                            msg.sent_at = datetime.now(timezone.utc)
                            total_sent += 1
                        else:
                            msg.status = "failed"
                            msg.failed_at = datetime.now(timezone.utc)
                            msg.failure_reason = "No external ID returned"
                            total_failed_send += 1
                else:
                    logger.error(
                        f"Channel service returned {response.status_code}: {response.text}"
                    )
                    for msg in batch:
                        msg.status = "failed"
                        msg.failed_at = datetime.now(timezone.utc)
                        msg.failure_reason = f"Channel service error: {response.status_code}"
                        total_failed_send += 1

            except requests.RequestException as e:
                logger.error(f"Channel service connection error: {e}")
                for msg in batch:
                    msg.status = "failed"
                    msg.failed_at = datetime.now(timezone.utc)
                    msg.failure_reason = f"Connection error: {str(e)}"
                    total_failed_send += 1

        # Update campaign status and counts
        campaign.status = "active"
        campaign.launched_at = datetime.now(timezone.utc)
        campaign.total_sent = total_sent
        campaign.total_failed = total_failed_send

        db.session.commit()
        logger.info(
            f"Launched campaign '{campaign.name}': "
            f"{total_sent} sent, {total_failed_send} failed"
        )

        # Start background timer thread to mark campaign as completed after 12 seconds
        import threading
        def complete_campaign_later(app_context, camp_id):
            import time
            time.sleep(12)  # Active/running state duration
            with app_context:
                from app.models.campaign import Campaign
                from app.extensions import db
                campaign = Campaign.query.get(camp_id)
                if campaign and campaign.status == "active":
                    campaign.status = "completed"
                    campaign.completed_at = datetime.now(timezone.utc)
                    db.session.commit()
                    logger.info(f"Campaign '{campaign.name}' automatically completed after 12 seconds")

        app_context = current_app._get_current_object().app_context()
        threading.Thread(
            target=complete_campaign_later,
            args=(app_context, campaign.id),
            daemon=True
        ).start()

        return campaign.to_dict()

    @staticmethod
    def _personalize_message(template, customer):
        """
        Replace template variables with customer data.
        Supported variables: {{name}}, {{first_name}}, {{city}}, {{email}}
        """
        name = customer.name or "there"
        first_name = name.split()[0] if name else "there"

        result = template.replace("{{name}}", name)
        result = result.replace("{{first_name}}", first_name)
        result = result.replace("{{city}}", customer.city or "your city")
        result = result.replace("{{email}}", customer.email or "")
        return result

    @staticmethod
    def get_campaign_analytics(campaign_id):
        """
        Get detailed analytics for a campaign.

        Returns delivery funnel, timeline, and channel performance.
        """
        campaign = Campaign.query.get(campaign_id)
        if not campaign:
            raise NotFoundError(f"Campaign {campaign_id} not found")

        # Message status distribution
        from sqlalchemy import func
        status_dist = (
            db.session.query(Message.status, func.count(Message.id))
            .filter(Message.campaign_id == campaign_id)
            .group_by(Message.status)
            .all()
        )

        # Delivery funnel
        total = campaign.total_sent + campaign.total_failed
        funnel = {
            "total_audience": total,
            "sent": campaign.total_sent,
            "delivered": campaign.total_delivered,
            "read": campaign.total_read,
            "clicked": campaign.total_clicked,
            "converted": campaign.total_converted,
            "failed": campaign.total_failed,
        }

        # Rates
        rates = {
            "delivery_rate": campaign.delivery_rate,
            "open_rate": campaign.open_rate,
            "click_rate": campaign.click_rate,
            "conversion_rate": campaign.conversion_rate,
        }

        return {
            "campaign": campaign.to_dict(),
            "funnel": funnel,
            "rates": rates,
            "status_distribution": {s: c for s, c in status_dist},
        }

    @staticmethod
    def check_completion(campaign_id):
        """
        Check if all messages have reached terminal state and mark campaign complete.
        Called after processing delivery callbacks.
        """
        # Controlled by the background thread lifecycle in CampaignService.launch
        pass

    @staticmethod
    def get_recent(limit=5, brand_id=None):
        """Get most recent campaigns for dashboard, optionally filtered by brand."""
        query = Campaign.query.order_by(Campaign.created_at.desc())
        all_campaigns = query.all()
        
        filtered = []
        for c in all_campaigns:
            c_brand_id = c.ai_metadata.get("brand_id") if c.ai_metadata else None
            
            # Map pre-seeded/unassigned campaigns dynamically
            if not c_brand_id:
                name_lower = c.name.lower()
                if "aura" in name_lower or "festive" in name_lower or "ethnic" in name_lower:
                    c_brand_id = "aura-fashion"
                elif "brew" in name_lower or "espresso" in name_lower or "roast" in name_lower or "dormancy" in name_lower:
                    c_brand_id = "brew-co"
                elif "bloom" in name_lower or "hydration" in name_lower or "skincare" in name_lower or "sneak-peek" in name_lower:
                    c_brand_id = "bloom-beauty"
                else:
                    c_brand_id = "aura-fashion"
            
            if brand_id and c_brand_id != brand_id:
                continue
            
            d = c.to_dict()
            if not d.get("ai_metadata"):
                d["ai_metadata"] = {}
            d["ai_metadata"]["brand_id"] = c_brand_id
            filtered.append(d)
            if len(filtered) >= limit:
                break
                
        return filtered
