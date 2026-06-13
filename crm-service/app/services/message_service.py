"""
Resonance CRM — Message & Callback Service

Handles delivery receipt callbacks from the channel service.
Implements idempotent processing with event ordering protection.

Key design patterns:
1. Idempotency: Duplicate callbacks (same idempotency_key) are silently ignored.
2. Event ordering: Status only advances forward (sent→delivered→read→clicked).
   Out-of-order callbacks don't cause status regression.
3. Atomic updates: Campaign counters are updated in the same transaction as message status.
"""
import logging
from datetime import datetime, timezone

from app.extensions import db
from app.models.message import Message
from app.models.event import DeliveryEvent
from app.models.campaign import Campaign
from app.utils import NotFoundError, ValidationError

logger = logging.getLogger(__name__)

# Status ordering: higher number = further in lifecycle
STATUS_ORDER = {
    "queued": 0,
    "sent": 1,
    "delivered": 2,
    "failed": 2,  # Same level as delivered (alternate path)
    "read": 3,
    "clicked": 4,
    "converted": 5,
}

# Maps event types to the corresponding message status
EVENT_TO_STATUS = {
    "SENT": "sent",
    "DELIVERED": "delivered",
    "FAILED": "failed",
    "READ": "read",
    "CLICKED": "clicked",
    "CONVERTED": "converted",
}

# Maps event types to the campaign counter field to increment
EVENT_TO_COUNTER = {
    "DELIVERED": "total_delivered",
    "FAILED": "total_failed",
    "READ": "total_read",
    "CLICKED": "total_clicked",
    "CONVERTED": "total_converted",
}

# Maps event types to the message timestamp field to set
EVENT_TO_TIMESTAMP = {
    "SENT": "sent_at",
    "DELIVERED": "delivered_at",
    "FAILED": "failed_at",
    "READ": "read_at",
    "CLICKED": "clicked_at",
    "CONVERTED": "converted_at",
}


class MessageService:
    """Service layer for message and delivery event operations."""

    @staticmethod
    def process_delivery_callback(data):
        """
        Process a delivery receipt callback from the channel service.

        This is the critical callback handler. It must be:
        - Idempotent: Same callback processed twice has no additional effect
        - Order-safe: Out-of-order callbacks don't regress status
        - Atomic: Message + campaign updates in one transaction

        Args:
            data: Dict with message_id, event_type, idempotency_key, etc.

        Returns:
            Dict with processing result
        """
        message_id = data.get("message_id")
        event_type = data.get("event_type")
        idempotency_key = data.get("idempotency_key")
        timestamp_str = data.get("timestamp")
        sequence = data.get("sequence", 0)
        metadata = data.get("metadata", {})

        # Validate required fields
        if not all([message_id, event_type, idempotency_key]):
            raise ValidationError(
                "message_id, event_type, and idempotency_key are required"
            )

        # Check idempotency — silently ignore duplicates
        existing_event = DeliveryEvent.query.filter_by(
            idempotency_key=idempotency_key
        ).first()
        if existing_event:
            logger.debug(f"Duplicate callback ignored: {idempotency_key}")
            return {"status": "duplicate", "message": "Already processed"}

        # Find the message
        message = Message.query.get(message_id)
        if not message:
            logger.warning(f"Callback for unknown message: {message_id}")
            raise NotFoundError(f"Message {message_id} not found")

        # Parse timestamp
        try:
            occurred_at = datetime.fromisoformat(
                timestamp_str.replace("Z", "+00:00")
            )
        except (ValueError, TypeError, AttributeError):
            occurred_at = datetime.now(timezone.utc)

        # Create the delivery event (audit log)
        event = DeliveryEvent(
            message_id=message_id,
            event_type=event_type,
            metadata_=metadata,
            idempotency_key=idempotency_key,
            sequence=sequence,
            occurred_at=occurred_at,
        )
        db.session.add(event)

        # Determine new status
        new_status = EVENT_TO_STATUS.get(event_type)
        if not new_status:
            logger.warning(f"Unknown event type: {event_type}")
            db.session.commit()
            return {"status": "unknown_event", "event_type": event_type}

        # Check event ordering — only advance forward, never regress
        current_order = STATUS_ORDER.get(message.status, 0)
        new_order = STATUS_ORDER.get(new_status, 0)

        if new_order < current_order:
            # Out-of-order callback — log but don't regress status
            logger.info(
                f"Out-of-order callback: message {message_id[:8]} "
                f"is '{message.status}', ignoring '{new_status}'"
            )
            db.session.commit()
            return {
                "status": "out_of_order",
                "current": message.status,
                "attempted": new_status,
            }

        # Update message status
        old_status = message.status
        message.status = new_status

        # Set the appropriate timestamp
        ts_field = EVENT_TO_TIMESTAMP.get(event_type)
        if ts_field:
            setattr(message, ts_field, occurred_at)

        # Set failure reason if failed
        if event_type == "FAILED":
            message.failure_reason = metadata.get(
                "failure_reason", "Delivery failed"
            )
            message.retry_count = metadata.get("attempt", 1)

        # Update campaign counters atomically
        counter_field = EVENT_TO_COUNTER.get(event_type)
        if counter_field and message.campaign_id:
            campaign = Campaign.query.get(message.campaign_id)
            if campaign:
                current_val = getattr(campaign, counter_field, 0)
                setattr(campaign, counter_field, current_val + 1)

        db.session.commit()

        logger.info(
            f"Processed callback: message {message_id[:8]} "
            f"{old_status} → {new_status}"
        )

        # Check if campaign is complete
        if message.campaign_id:
            from app.services.campaign_service import CampaignService
            CampaignService.check_completion(message.campaign_id)

        return {
            "status": "processed",
            "message_id": message_id,
            "old_status": old_status,
            "new_status": new_status,
        }

    @staticmethod
    def get_campaign_messages(campaign_id, status=None, page=1, per_page=50):
        """Get paginated messages for a campaign."""
        query = Message.query.filter_by(campaign_id=campaign_id)

        if status:
            query = query.filter(Message.status == status)

        query = query.order_by(Message.created_at.desc())
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)

        return {
            "items": [m.to_dict() for m in pagination.items],
            "total": pagination.total,
            "page": pagination.page,
            "per_page": pagination.per_page,
        }

    @staticmethod
    def get_message_events(message_id):
        """Get all delivery events for a specific message."""
        events = (
            DeliveryEvent.query
            .filter_by(message_id=message_id)
            .order_by(DeliveryEvent.sequence.asc())
            .all()
        )
        return [e.to_dict() for e in events]
