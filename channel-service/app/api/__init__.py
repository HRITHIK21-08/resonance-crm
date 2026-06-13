"""
Channel Service — API Blueprint Registration.

Exposes the `api_bp` blueprint that groups all channel-service endpoints
under the /channel prefix.
"""

from flask import Blueprint

api_bp = Blueprint("channel", __name__, url_prefix="/channel")

# Import route modules so they register their handlers on the blueprint.
# This MUST come after the blueprint is created to avoid circular imports.
from app.api import send  # noqa: F401, E402
