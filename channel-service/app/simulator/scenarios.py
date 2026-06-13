"""
Channel Service — Failure Scenario Definitions.

Defines the probability tables and failure-reason pools used by the
simulation engine to decide whether a message is delivered or fails,
whether a delivered message is read, and whether a read message is clicked.

All probabilities are based on realistic industry averages, slightly
simplified for the CRM demo context.
"""

from __future__ import annotations

# ─────────────────────────────────────────────────────────────────────
# Delivery success / failure rates per channel.
#
# After the SENT state, we roll a random float in [0, 1) and compare
# against the "delivered" threshold.  If the roll is ≤ threshold the
# message moves to DELIVERED; otherwise it moves to FAILED.
# ─────────────────────────────────────────────────────────────────────
DELIVERY_RATES: dict[str, dict[str, float]] = {
    "whatsapp": {"delivered": 0.92, "failed": 0.08},
    "email":    {"delivered": 0.88, "failed": 0.12},
    "sms":      {"delivered": 0.95, "failed": 0.05},
}

# ─────────────────────────────────────────────────────────────────────
# Engagement rates — conditional on successful delivery.
#
# "read"    = probability the recipient opens / reads the message.
# "clicked" = probability (given the message was read) the recipient
#             clicks a CTA link.
# ─────────────────────────────────────────────────────────────────────
ENGAGEMENT_RATES: dict[str, dict[str, float]] = {
    "whatsapp": {"read": 0.78, "clicked": 0.12, "converted": 0.25},
    "email":    {"read": 0.22, "clicked": 0.035, "converted": 0.20},
    "sms":      {"read": 0.90, "clicked": 0.05, "converted": 0.15},
}

# ─────────────────────────────────────────────────────────────────────
# Failure reasons — randomly selected when a delivery fails.
#
# These are realistic error strings that the CRM can display to the
# user.  Each channel has its own pool.
# ─────────────────────────────────────────────────────────────────────
FAILURE_REASONS: dict[str, list[str]] = {
    "whatsapp": [
        "Recipient phone number is not registered on WhatsApp.",
        "Message template not approved — compliance rejection.",
        "Rate limit exceeded — too many messages to this number.",
        "WhatsApp Business API returned 500 — transient server error.",
        "Recipient has blocked business messages.",
        "24-hour messaging window expired — re-opt-in required.",
    ],
    "email": [
        "Mailbox not found — 550 permanent failure.",
        "Message rejected by recipient's spam filter.",
        "DKIM signature verification failed.",
        "Sender IP blacklisted by recipient's mail server.",
        "Message size exceeds recipient server limit.",
        "DNS lookup failed for recipient domain — NXDOMAIN.",
        "Recipient mailbox is full — 452 temporary failure.",
    ],
    "sms": [
        "Invalid phone number format.",
        "Carrier rejected message — content policy violation.",
        "Destination unreachable — phone is turned off.",
        "SMS gateway timeout — no acknowledgement from carrier.",
        "Number is on the national Do-Not-Call registry.",
    ],
}
