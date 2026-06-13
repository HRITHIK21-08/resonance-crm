"""
Resonance CRM — Models Package

All SQLAlchemy models exported from here for clean imports.
"""
from app.models.customer import Customer
from app.models.order import Order
from app.models.segment import Segment, SegmentMembership
from app.models.campaign import Campaign
from app.models.message import Message
from app.models.event import DeliveryEvent
from app.models.copilot import CopilotConversation

__all__ = [
    "Customer",
    "Order",
    "Segment",
    "SegmentMembership",
    "Campaign",
    "Message",
    "DeliveryEvent",
    "CopilotConversation",
]
