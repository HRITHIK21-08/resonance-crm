"""
Channel Service — Retry Utilities.

Implements retry-with-exponential-backoff for HTTP callbacks to the CRM.

The CRM service may be temporarily unreachable (deploy, restart, network
blip).  We retry up to `max_retries` times with delays of:
    base_delay * 2^attempt  →  1s, 2s, 4s  (with max_retries=3)
"""

from __future__ import annotations

import logging
import time
from typing import Callable

logger = logging.getLogger(__name__)


def retry_with_backoff(
    fn: Callable[[], bool],
    *,
    max_retries: int = 3,
    base_delay: float = 1.0,
    context: str = "",
) -> bool:
    """
    Execute `fn` and retry on failure with exponential back-off.

    `fn` must return True on success and False on failure (or raise an
    exception, which counts as failure).

    Args:
        fn:          Callable that returns True (success) or False (fail).
        max_retries: Maximum number of retry attempts (excludes initial).
        base_delay:  Base delay in seconds (doubled each retry).
        context:     Human-readable label for log messages.

    Returns:
        True if `fn` eventually succeeded, False if all retries exhausted.
    """
    for attempt in range(1, max_retries + 1):
        try:
            if fn():
                return True
        except Exception as exc:
            logger.warning(
                "[%s] Attempt %d/%d raised %s: %s",
                context,
                attempt,
                max_retries,
                type(exc).__name__,
                exc,
            )
        else:
            logger.warning(
                "[%s] Attempt %d/%d returned failure.",
                context,
                attempt,
                max_retries,
            )

        if attempt < max_retries:
            delay = base_delay * (2 ** (attempt - 1))  # 1s, 2s, 4s …
            logger.info(
                "[%s] Retrying in %.1fs (attempt %d/%d)…",
                context,
                delay,
                attempt + 1,
                max_retries,
            )
            time.sleep(delay)

    logger.error("[%s] All %d attempts exhausted.", context, max_retries)
    return False
