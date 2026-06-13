"""
Channel Service — Callback Dispatcher.

Responsible for POSTing delivery-receipt events back to the CRM service.
Every state transition in the delivery lifecycle (DELIVERED, FAILED,
READ, CLICKED) generates a callback.

Key design points:
    • Each callback includes a SHA-256 idempotency_key so the CRM can
      safely de-duplicate retried webhooks.
    • Sequence numbers are monotonically increasing *per message* to
      let the CRM enforce event ordering.
    • Failed POSTs are retried with exponential back-off (1 s → 2 s → 4 s,
      max 3 attempts) so transient CRM downtime doesn't lose events.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import requests

from app.utils.idempotency import make_callback_idempotency_key
from app.utils.retry import retry_with_backoff

logger = logging.getLogger(__name__)

# HTTP timeout for callback POSTs (seconds)
_CALLBACK_TIMEOUT = 10


def dispatch_callback(
    *,
    callback_url: str,
    message_id: str,
    external_id: str,
    event_type: str,
    sequence: int,
    channel: str,
    attempt: int,
    failure_reason: str | None = None,
    max_retries: int = 3,
    base_delay: float = 1.0,
) -> bool:
    """
    Send a delivery-receipt event to the CRM service.

    Builds the payload, computes the idempotency key, and POSTs to the
    CRM callback URL.  Retries on failure with exponential back-off.

    Args:
        callback_url:   Full URL of the CRM receipt endpoint.
        message_id:     Original message UUID (assigned by the CRM).
        external_id:    Channel-assigned UUID (assigned by us).
        event_type:     DELIVERED | FAILED | READ | CLICKED.
        sequence:       Per-message monotonic sequence number.
        channel:        whatsapp | email | sms.
        attempt:        Delivery attempt number (1-based).
        failure_reason: Human-readable reason (only for FAILED events).
        max_retries:    Max callback POST retries.
        base_delay:     Base delay for exponential back-off.

    Returns:
        True if the callback was accepted (2xx), False otherwise.
    """
    idempotency_key = make_callback_idempotency_key(
        message_id, event_type, sequence
    )

    metadata: dict = {
        "channel": channel,
        "attempt": attempt,
    }
    if failure_reason:
        metadata["failure_reason"] = failure_reason

    payload = {
        "message_id": message_id,
        "external_id": external_id,
        "event_type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sequence": sequence,
        "idempotency_key": idempotency_key,
        "metadata": metadata,
    }

    context = f"callback:{message_id}:{event_type}:seq{sequence}"

    def _post() -> bool:
        """Attempt a single POST to the CRM callback URL."""
        try:
            resp = requests.post(
                callback_url,
                json=payload,
                timeout=_CALLBACK_TIMEOUT,
                headers={
                    "Content-Type": "application/json",
                    "X-Idempotency-Key": idempotency_key,
                    "X-Channel-Service": "resonance-channel-service/1.0",
                },
            )
            if resp.ok:
                logger.info(
                    "[%s] Callback accepted (HTTP %d).", context, resp.status_code
                )
                return True
            else:
                logger.warning(
                    "[%s] CRM returned HTTP %d: %s",
                    context,
                    resp.status_code,
                    resp.text[:200],
                )
                return False
        except requests.RequestException as exc:
            logger.warning("[%s] POST failed: %s", context, exc)
            return False

    success = retry_with_backoff(
        _post,
        max_retries=max_retries,
        base_delay=base_delay,
        context=context,
    )

    if not success:
        logger.error(
            "[%s] Callback permanently failed after %d retries.",
            context,
            max_retries,
        )

    return success
