"""
Channel Service — Configuration Module.

Centralises all configuration with sensible defaults.  Values are read from
environment variables so they work seamlessly with Railway / Docker / .env.
"""

import os


class _BaseConfig:
    """Shared configuration across all environments."""

    # ── Flask core ───────────────────────────────────────────────────
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "channel-dev-secret")

    # ── CRM callback target ─────────────────────────────────────────
    CRM_CALLBACK_URL: str = os.environ.get(
        "CRM_CALLBACK_URL",
        "http://localhost:5000/api/callbacks/delivery-receipt",
    )

    # ── Simulation tuning ────────────────────────────────────────────
    # Maximum messages accepted in a single POST /channel/send batch
    MAX_BATCH_SIZE: int = int(os.environ.get("MAX_BATCH_SIZE", "100"))

    # Maximum retry attempts when a callback POST to the CRM fails
    CALLBACK_MAX_RETRIES: int = int(os.environ.get("CALLBACK_MAX_RETRIES", "3"))

    # Base delay (seconds) for exponential back-off on callback retries
    CALLBACK_BASE_DELAY: float = float(os.environ.get("CALLBACK_BASE_DELAY", "1.0"))

    # Maximum retry attempts for message delivery (FAILED → QUEUED re-send)
    DELIVERY_MAX_RETRIES: int = int(os.environ.get("DELIVERY_MAX_RETRIES", "3"))

    # ── Timing ranges (seconds) for the simulation delays ───────────
    DELAY_SENT_TO_DELIVERED_MIN: float = 1.0
    DELAY_SENT_TO_DELIVERED_MAX: float = 5.0
    DELAY_DELIVERED_TO_READ_MIN: float = 5.0
    DELAY_DELIVERED_TO_READ_MAX: float = 30.0
    DELAY_READ_TO_CLICKED_MIN: float = 10.0
    DELAY_READ_TO_CLICKED_MAX: float = 60.0
    DELAY_FAILURE_MIN: float = 1.0
    DELAY_FAILURE_MAX: float = 3.0
    DELAY_CLICKED_TO_CONVERTED_MIN: float = 1.0
    DELAY_CLICKED_TO_CONVERTED_MAX: float = 5.0


class DevelopmentConfig(_BaseConfig):
    """Local development — debug mode ON, shorter delays."""

    DEBUG = True

    # Shorten delays for faster local testing (total lifecycle ~6 to 12s)
    DELAY_SENT_TO_DELIVERED_MIN: float = 1.0
    DELAY_SENT_TO_DELIVERED_MAX: float = 2.0
    DELAY_DELIVERED_TO_READ_MIN: float = 2.0
    DELAY_DELIVERED_TO_READ_MAX: float = 3.5
    DELAY_READ_TO_CLICKED_MIN: float = 2.0
    DELAY_READ_TO_CLICKED_MAX: float = 3.5
    DELAY_CLICKED_TO_CONVERTED_MIN: float = 1.5
    DELAY_CLICKED_TO_CONVERTED_MAX: float = 3.0


class ProductionConfig(_BaseConfig):
    """Production — debug OFF, full timing ranges."""

    DEBUG = False


class TestingConfig(_BaseConfig):
    """Testing — instant delays so tests run fast."""

    TESTING = True
    DEBUG = True

    DELAY_SENT_TO_DELIVERED_MIN: float = 0.01
    DELAY_SENT_TO_DELIVERED_MAX: float = 0.02
    DELAY_DELIVERED_TO_READ_MIN: float = 0.01
    DELAY_DELIVERED_TO_READ_MAX: float = 0.02
    DELAY_READ_TO_CLICKED_MIN: float = 0.01
    DELAY_READ_TO_CLICKED_MAX: float = 0.02
    DELAY_FAILURE_MIN: float = 0.01
    DELAY_FAILURE_MAX: float = 0.02


# ── Config selector ─────────────────────────────────────────────────

_ENV_MAP = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}


def get_config():
    """Return the config class matching FLASK_ENV (default: development)."""
    env = os.environ.get("FLASK_ENV", "development").lower()
    return _ENV_MAP.get(env, DevelopmentConfig)
