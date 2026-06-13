"""
Channel Service — App Factory Module.

This module provides the Flask application factory for the Channel Service,
a microservice that simulates message delivery across channels (WhatsApp,
Email, SMS) for the Resonance AI-native Mini CRM.

The factory pattern allows:
- Clean test configuration injection
- Multiple app instances if needed
- Deferred extension initialization
"""

import logging
import os

from dotenv import load_dotenv
from flask import Flask
from flask_cors import CORS

# Load .env before anything reads os.environ
load_dotenv()


def create_app(config_override: dict | None = None) -> Flask:
    """
    Application factory for the Channel Service.

    Args:
        config_override: Optional dict of config values that override
                         defaults (useful for testing).

    Returns:
        A fully configured Flask application instance.
    """
    app = Flask(__name__)

    # ── Load configuration ───────────────────────────────────────────
    from app.config import get_config
    app.config.from_object(get_config())

    if config_override:
        app.config.update(config_override)

    # ── CORS — allow the CRM frontend / service to call us ──────────
    CORS(app, resources={r"/*": {"origins": "*"}})

    # ── Logging ──────────────────────────────────────────────────────
    _configure_logging(app)

    # ── Register blueprints ──────────────────────────────────────────
    from app.api import api_bp
    app.register_blueprint(api_bp)

    # ── Initialize the simulation engine (singleton) ─────────────────
    from app.simulator.engine import SimulationEngine
    engine = SimulationEngine(app.config)
    app.extensions["simulation_engine"] = engine

    app.logger.info(
        "Channel Service started — CRM callback URL: %s",
        app.config["CRM_CALLBACK_URL"],
    )

    return app


def _configure_logging(app: Flask) -> None:
    """Set up structured logging for the service."""
    log_level = logging.DEBUG if app.config.get("DEBUG") else logging.INFO

    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            "[%(asctime)s] %(levelname)s in %(module)s: %(message)s"
        )
    )

    # Root logger
    root = logging.getLogger()
    root.setLevel(log_level)
    root.addHandler(handler)

    # Flask app logger
    app.logger.setLevel(log_level)
    app.logger.handlers = [handler]
