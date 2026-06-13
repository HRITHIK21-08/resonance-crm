"""
Channel Service — Core Delivery Simulation Engine.

This module is the heart of the Channel Service.  It owns the full
delivery lifecycle state machine and drives it asynchronously using
background daemon threads.

State Machine
─────────────
Happy path:   QUEUED → SENT → DELIVERED → READ → CLICKED
Failure path: QUEUED → SENT → FAILED
Retry path:   SENT → FAILED → QUEUED  (max 3 delivery attempts)

Each transition sleeps for a random duration (simulating real-world
network latency and human behaviour) and then fires a callback to the
CRM service.

Thread Safety
─────────────
All shared state (idempotency set, stats counters, active-sim counter)
is protected by threading.Lock.  Each message simulation runs in its own
daemon thread so the /channel/send endpoint never blocks.
"""

from __future__ import annotations

import logging
import random
import threading
import time
import uuid
from collections import defaultdict
from typing import Any

from app.simulator.callbacks import dispatch_callback
from app.simulator.scenarios import (
    DELIVERY_RATES,
    ENGAGEMENT_RATES,
    FAILURE_REASONS,
)

logger = logging.getLogger(__name__)


class SimulationEngine:
    """
    Manages the simulated delivery lifecycle for all accepted messages.

    Instantiated once by the app factory and stored in
    ``app.extensions["simulation_engine"]``.
    """

    def __init__(self, config: dict[str, Any]) -> None:
        """
        Args:
            config: Flask app.config dict (or equivalent mapping).
        """
        self._config = config

        # ── Thread-safe shared state ─────────────────────────────────
        self._lock = threading.Lock()

        # Set of send-idempotency keys (SHA-256 hex digests) that have
        # already been accepted.  Prevents duplicate sends.
        self._seen_keys: set[str] = set()

        # Count of currently-running simulation threads.
        self._active_sims: int = 0

        # Aggregate statistics — counters per channel per event type.
        self._stats: dict[str, dict[str, int]] = defaultdict(
            lambda: defaultdict(int)
        )
        # Global counters
        self._total_accepted: int = 0
        self._total_callbacks_sent: int = 0
        self._total_callbacks_failed: int = 0

    # ── Public properties ────────────────────────────────────────────

    @property
    def active_simulation_count(self) -> int:
        """Number of message simulations currently in-flight."""
        with self._lock:
            return self._active_sims

    # ── Idempotency ──────────────────────────────────────────────────

    def is_duplicate(self, idempotency_key: str) -> bool:
        """
        Check whether a send-idempotency key has already been accepted.

        Thread-safe.  Does NOT add the key (that happens in enqueue_batch).
        """
        with self._lock:
            return idempotency_key in self._seen_keys

    # ── Batch enqueue ────────────────────────────────────────────────

    def enqueue_batch(self, messages: list[dict]) -> None:
        """
        Accept a batch of validated messages and launch a background
        simulation thread for each one.

        This method returns immediately — simulation happens async.

        Args:
            messages: List of message dicts (already validated by the
                      API layer).  Each dict must contain at least:
                      message_id, external_id, channel, idempotency_key,
                      campaign_id, customer_id, recipient, content.
        """
        with self._lock:
            for msg in messages:
                self._seen_keys.add(msg["idempotency_key"])
                self._total_accepted += 1
                self._stats[msg["channel"]]["accepted"] += 1

        for msg in messages:
            t = threading.Thread(
                target=self._simulate_delivery,
                args=(msg,),
                daemon=True,
                name=f"sim-{msg['message_id'][:8]}",
            )
            with self._lock:
                self._active_sims += 1
            t.start()

        logger.info(
            "Enqueued %d messages for simulation (%d active threads).",
            len(messages),
            self.active_simulation_count,
        )

    # ── Core simulation loop (runs in a background thread) ───────────

    def _simulate_delivery(self, msg: dict) -> None:
        """
        Run the full delivery lifecycle for a single message.

        This method is the target of each background thread.  It walks
        through the state machine, sleeping for random delays, rolling
        dice against the probability tables, and dispatching callbacks
        to the CRM at each transition.

        Args:
            msg: Message dict from enqueue_batch.
        """
        message_id = msg["message_id"]
        external_id = msg["external_id"]
        channel = msg["channel"]
        callback_url = self._config["CRM_CALLBACK_URL"]
        max_delivery_retries = self._config.get("DELIVERY_MAX_RETRIES", 3)
        cb_max_retries = self._config.get("CALLBACK_MAX_RETRIES", 3)
        cb_base_delay = self._config.get("CALLBACK_BASE_DELAY", 1.0)

        # Per-message sequence counter (monotonically increasing).
        sequence = 0
        attempt = 0

        try:
            # ── Retry loop (FAILED → QUEUED → SENT → …) ─────────────
            while attempt < max_delivery_retries:
                attempt += 1

                # ── QUEUED → SENT (instant, just a state label) ──────
                logger.info(
                    "[%s] Attempt %d — QUEUED → SENT (channel=%s).",
                    message_id[:8],
                    attempt,
                    channel,
                )
                self._increment_stat(channel, "sent")

                # ── Roll for delivery success / failure ──────────────
                delivery_threshold = DELIVERY_RATES[channel]["delivered"]
                roll = random.random()

                if roll <= delivery_threshold:
                    # ── SUCCESS PATH ─────────────────────────────────
                    # SENT → DELIVERED
                    delay = random.uniform(
                        self._config.get("DELAY_SENT_TO_DELIVERED_MIN", 1.0),
                        self._config.get("DELAY_SENT_TO_DELIVERED_MAX", 5.0),
                    )
                    time.sleep(delay)

                    sequence += 1
                    self._increment_stat(channel, "delivered")
                    self._dispatch(
                        callback_url=callback_url,
                        message_id=message_id,
                        external_id=external_id,
                        event_type="DELIVERED",
                        sequence=sequence,
                        channel=channel,
                        attempt=attempt,
                        max_retries=cb_max_retries,
                        base_delay=cb_base_delay,
                    )

                    # ── DELIVERED → READ (probabilistic) ─────────────
                    read_threshold = ENGAGEMENT_RATES[channel]["read"]
                    if random.random() <= read_threshold:
                        delay = random.uniform(
                            self._config.get("DELAY_DELIVERED_TO_READ_MIN", 5.0),
                            self._config.get("DELAY_DELIVERED_TO_READ_MAX", 30.0),
                        )
                        time.sleep(delay)

                        sequence += 1
                        self._increment_stat(channel, "read")
                        self._dispatch(
                            callback_url=callback_url,
                            message_id=message_id,
                            external_id=external_id,
                            event_type="READ",
                            sequence=sequence,
                            channel=channel,
                            attempt=attempt,
                            max_retries=cb_max_retries,
                            base_delay=cb_base_delay,
                        )

                        # ── READ → CLICKED (probabilistic) ──────────
                        click_threshold = ENGAGEMENT_RATES[channel]["clicked"]
                        if random.random() <= click_threshold:
                            delay = random.uniform(
                                self._config.get("DELAY_READ_TO_CLICKED_MIN", 10.0),
                                self._config.get("DELAY_READ_TO_CLICKED_MAX", 60.0),
                            )
                            time.sleep(delay)

                            sequence += 1
                            self._increment_stat(channel, "clicked")
                            self._dispatch(
                                callback_url=callback_url,
                                message_id=message_id,
                                external_id=external_id,
                                event_type="CLICKED",
                                sequence=sequence,
                                channel=channel,
                                attempt=attempt,
                                max_retries=cb_max_retries,
                                base_delay=cb_base_delay,
                            )

                            # ── CLICKED → CONVERTED (probabilistic) ──────────
                            converted_threshold = ENGAGEMENT_RATES[channel].get("converted", 0.20)
                            if random.random() <= converted_threshold:
                                delay = random.uniform(
                                    self._config.get("DELAY_CLICKED_TO_CONVERTED_MIN", 1.0),
                                    self._config.get("DELAY_CLICKED_TO_CONVERTED_MAX", 3.0),
                                )
                                time.sleep(delay)

                                sequence += 1
                                self._increment_stat(channel, "converted")
                                self._dispatch(
                                    callback_url=callback_url,
                                    message_id=message_id,
                                    external_id=external_id,
                                    event_type="CONVERTED",
                                    sequence=sequence,
                                    channel=channel,
                                    attempt=attempt,
                                    max_retries=cb_max_retries,
                                    base_delay=cb_base_delay,
                                )

                    # Delivery succeeded — break out of retry loop.
                    break

                else:
                    # ── FAILURE PATH ─────────────────────────────────
                    delay = random.uniform(
                        self._config.get("DELAY_FAILURE_MIN", 1.0),
                        self._config.get("DELAY_FAILURE_MAX", 3.0),
                    )
                    time.sleep(delay)

                    failure_reason = random.choice(FAILURE_REASONS[channel])
                    sequence += 1
                    self._increment_stat(channel, "failed")

                    logger.warning(
                        "[%s] Attempt %d FAILED: %s",
                        message_id[:8],
                        attempt,
                        failure_reason,
                    )

                    self._dispatch(
                        callback_url=callback_url,
                        message_id=message_id,
                        external_id=external_id,
                        event_type="FAILED",
                        sequence=sequence,
                        channel=channel,
                        attempt=attempt,
                        failure_reason=failure_reason,
                        max_retries=cb_max_retries,
                        base_delay=cb_base_delay,
                    )

                    # If we have retries left, loop back to QUEUED.
                    if attempt < max_delivery_retries:
                        logger.info(
                            "[%s] Re-queuing for retry attempt %d/%d.",
                            message_id[:8],
                            attempt + 1,
                            max_delivery_retries,
                        )
                        # Small pause before retry
                        time.sleep(random.uniform(0.5, 1.5))
                    else:
                        logger.error(
                            "[%s] All %d delivery attempts exhausted.",
                            message_id[:8],
                            max_delivery_retries,
                        )

        except Exception:
            logger.exception(
                "[%s] Unexpected error in simulation thread.", message_id[:8]
            )
        finally:
            with self._lock:
                self._active_sims -= 1

    # ── Helpers ──────────────────────────────────────────────────────

    def _dispatch(self, **kwargs) -> None:
        """
        Thin wrapper around the callback dispatcher that also tracks
        callback success/failure in stats.
        """
        success = dispatch_callback(**kwargs)
        with self._lock:
            if success:
                self._total_callbacks_sent += 1
            else:
                self._total_callbacks_failed += 1

    def _increment_stat(self, channel: str, event: str) -> None:
        """Thread-safe stat counter increment."""
        with self._lock:
            self._stats[channel][event] += 1

    # ── Stats export ─────────────────────────────────────────────────

    def get_stats(self) -> dict:
        """
        Return a snapshot of all tracked statistics.

        Thread-safe — acquires the lock and copies the data.
        """
        with self._lock:
            per_channel = {
                ch: dict(events) for ch, events in self._stats.items()
            }
            return {
                "total_accepted": self._total_accepted,
                "total_callbacks_sent": self._total_callbacks_sent,
                "total_callbacks_failed": self._total_callbacks_failed,
                "active_simulations": self._active_sims,
                "per_channel": per_channel,
            }
