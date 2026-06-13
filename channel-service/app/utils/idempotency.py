"""
Channel Service — Idempotency Utilities.

Provides two kinds of idempotency keys:

1. **Send idempotency** — SHA-256(campaign_id + customer_id + channel).
   Prevents the CRM from accidentally sending the same message twice
   for a given campaign/customer/channel combination.

2. **Callback idempotency** — SHA-256(message_id + event_type + sequence).
   Attached to every delivery-receipt callback so the CRM can safely
   de-duplicate webhook deliveries (e.g. if we retry a failed POST).
"""

from __future__ import annotations

import hashlib


def make_send_idempotency_key(
    campaign_id: str,
    customer_id: str,
    channel: str,
) -> str:
    """
    Create a deterministic key to detect duplicate send requests.

    The CRM might POST the same message twice (network retry, user
    double-click, etc.).  This key lets us reject the second attempt.

    Args:
        campaign_id: UUID of the campaign.
        customer_id: UUID of the customer.
        channel:     Channel name (whatsapp / email / sms).

    Returns:
        Hex-encoded SHA-256 digest.
    """
    raw = f"{campaign_id}:{customer_id}:{channel}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def make_callback_idempotency_key(
    message_id: str,
    event_type: str,
    sequence: int,
) -> str:
    """
    Create a deterministic key for a delivery-receipt callback.

    If we have to retry a callback POST (because the CRM was temporarily
    unreachable), the CRM can use this key to discard duplicate receipts.

    Args:
        message_id: Original message UUID assigned by the CRM.
        event_type: One of DELIVERED, FAILED, READ, CLICKED.
        sequence:   Monotonically increasing sequence number per message.

    Returns:
        Hex-encoded SHA-256 digest.
    """
    raw = f"{message_id}:{event_type}:{sequence}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
