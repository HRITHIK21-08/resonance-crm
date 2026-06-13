"""
Channel Service — API Endpoints.

Implements three endpoints:
    POST /channel/send   — Accept a batch of messages (up to 100), return
                           202 Accepted immediately, and kick off async
                           delivery simulation in background threads.
    GET  /channel/health — Lightweight health check.
    GET  /channel/stats  — Delivery statistics aggregated from the
                           in-memory simulation engine.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from flask import current_app, jsonify, request

from app.api import api_bp
from app.utils.idempotency import make_send_idempotency_key

logger = logging.getLogger(__name__)

# ── Valid channels ───────────────────────────────────────────────────
VALID_CHANNELS = {"whatsapp", "email", "sms"}

# ── Required fields per message object ──────────────────────────────
REQUIRED_FIELDS = {"message_id", "campaign_id", "customer_id", "channel", "recipient", "content"}


# ─────────────────────────────────────────────────────────────────────
# POST /channel/send
# ─────────────────────────────────────────────────────────────────────
@api_bp.route("/send", methods=["POST"])
def send_messages():
    """
    Accept a batch of messages and schedule them for simulated delivery.

    The endpoint validates each message, generates external IDs, checks
    for duplicates via idempotency keys, and hands accepted messages
    to the SimulationEngine for async processing.  It returns 202
    immediately — delivery happens in background threads.

    Request body (JSON):
    {
        "messages": [
            {
                "message_id":   "uuid",
                "campaign_id":  "uuid",
                "customer_id":  "uuid",
                "channel":      "whatsapp|email|sms",
                "recipient":    "+919876543210",
                "content":      "Hello, world!",
                "metadata":     {}           # optional
            },
            ...
        ]
    }

    Response (202 Accepted):
    {
        "status": "accepted",
        "accepted": 50,
        "rejected": 0,
        "external_ids": { "msg-uuid-1": "ext-uuid-1", ... },
        "errors": []
    }
    """
    body = request.get_json(silent=True)
    if not body or "messages" not in body:
        return jsonify({
            "status": "error",
            "message": "Request body must contain a 'messages' array.",
        }), 400

    messages = body["messages"]
    if not isinstance(messages, list):
        return jsonify({
            "status": "error",
            "message": "'messages' must be an array.",
        }), 400

    max_batch = current_app.config["MAX_BATCH_SIZE"]
    if len(messages) > max_batch:
        return jsonify({
            "status": "error",
            "message": f"Batch size {len(messages)} exceeds maximum of {max_batch}.",
        }), 400

    if len(messages) == 0:
        return jsonify({
            "status": "error",
            "message": "Batch must contain at least one message.",
        }), 400

    engine = current_app.extensions["simulation_engine"]
    external_ids: dict[str, str] = {}
    errors: list[dict] = []
    accepted_messages: list[dict] = []

    for idx, msg in enumerate(messages):
        # ── Field presence validation ────────────────────────────────
        missing = REQUIRED_FIELDS - set(msg.keys())
        if missing:
            errors.append({
                "index": idx,
                "message_id": msg.get("message_id"),
                "reason": f"Missing required fields: {', '.join(sorted(missing))}",
            })
            continue

        # ── Channel validation ───────────────────────────────────────
        channel = msg["channel"].lower()
        if channel not in VALID_CHANNELS:
            errors.append({
                "index": idx,
                "message_id": msg["message_id"],
                "reason": f"Invalid channel '{msg['channel']}'. Must be one of: {', '.join(sorted(VALID_CHANNELS))}",
            })
            continue

        # ── Idempotency check — reject duplicate sends ───────────────
        idem_key = make_send_idempotency_key(
            msg["campaign_id"], msg["customer_id"], channel
        )
        if engine.is_duplicate(idem_key):
            errors.append({
                "index": idx,
                "message_id": msg["message_id"],
                "reason": "Duplicate send — message already accepted for this campaign/customer/channel combination.",
            })
            continue

        # ── Accept the message ───────────────────────────────────────
        external_id = str(uuid.uuid4())
        external_ids[msg["message_id"]] = external_id

        accepted_messages.append({
            "message_id": msg["message_id"],
            "external_id": external_id,
            "campaign_id": msg["campaign_id"],
            "customer_id": msg["customer_id"],
            "channel": channel,
            "recipient": msg["recipient"],
            "content": msg["content"],
            "metadata": msg.get("metadata", {}),
            "idempotency_key": idem_key,
        })

    # ── Enqueue accepted messages for async simulation ───────────────
    if accepted_messages:
        engine.enqueue_batch(accepted_messages)

    accepted_count = len(accepted_messages)
    rejected_count = len(errors)

    logger.info(
        "POST /channel/send — accepted=%d rejected=%d total=%d",
        accepted_count,
        rejected_count,
        len(messages),
    )

    response = {
        "status": "accepted",
        "accepted": accepted_count,
        "rejected": rejected_count,
        "external_ids": external_ids,
        "errors": errors,
    }
    return jsonify(response), 202


# ─────────────────────────────────────────────────────────────────────
# GET /channel/health
# ─────────────────────────────────────────────────────────────────────
@api_bp.route("/health", methods=["GET"])
def health_check():
    """
    Lightweight health-check endpoint.

    Returns 200 with service metadata. Railway and load balancers use
    this to confirm the service is alive.
    """
    engine = current_app.extensions["simulation_engine"]
    return jsonify({
        "status": "healthy",
        "service": "channel-service",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "active_simulations": engine.active_simulation_count,
    }), 200


# ─────────────────────────────────────────────────────────────────────
# GET /channel/stats
# ─────────────────────────────────────────────────────────────────────
@api_bp.route("/stats", methods=["GET"])
def delivery_stats():
    """
    Return aggregated delivery statistics from the simulation engine.

    Useful for monitoring dashboards and debugging.
    """
    engine = current_app.extensions["simulation_engine"]
    stats = engine.get_stats()
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
    }), 200
