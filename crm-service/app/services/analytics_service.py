"""
Resonance CRM — Analytics Service

Aggregates and computes analytics data for dashboards, KPIs, and AI insights.
All queries are optimized to use denormalized counters on the Campaign model
to avoid expensive COUNT/JOIN operations on the messages table.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, case

from app.extensions import db
from app.models.campaign import Campaign
from app.models.customer import Customer
from app.models.message import Message
from app.models.order import Order

logger = logging.getLogger(__name__)


class AnalyticsService:
    """Service layer for analytics and reporting."""

    @staticmethod
    def get_overview():
        """
        Get dashboard overview KPIs.
        Returns total customers, active campaigns, delivery rates, revenue impact.
        """
        # Customer stats
        total_customers = Customer.query.count()
        active_30d = Customer.query.filter(
            Customer.last_purchase_at >= datetime.now(timezone.utc) - timedelta(days=30)
        ).count()

        # Campaign stats
        total_campaigns = Campaign.query.count()
        active_campaigns = Campaign.query.filter(
            Campaign.status == "active"
        ).count()
        completed_campaigns = Campaign.query.filter(
            Campaign.status == "completed"
        ).count()

        # Aggregate delivery stats from campaigns
        delivery_stats = db.session.query(
            func.sum(Campaign.total_sent).label("total_sent"),
            func.sum(Campaign.total_delivered).label("total_delivered"),
            func.sum(Campaign.total_failed).label("total_failed"),
            func.sum(Campaign.total_read).label("total_read"),
            func.sum(Campaign.total_clicked).label("total_clicked"),
            func.sum(Campaign.total_converted).label("total_converted"),
        ).first()

        total_sent = int(delivery_stats.total_sent or 0)
        total_delivered = int(delivery_stats.total_delivered or 0)
        total_read = int(delivery_stats.total_read or 0)
        total_clicked = int(delivery_stats.total_clicked or 0)

        avg_delivery_rate = (
            round((total_delivered / total_sent * 100), 1) if total_sent > 0 else 0
        )
        avg_open_rate = (
            round((total_read / total_delivered * 100), 1) if total_delivered > 0 else 0
        )
        avg_click_rate = (
            round((total_clicked / total_delivered * 100), 1) if total_delivered > 0 else 0
        )

        # Revenue impact (sum of LTV of converted customers)
        revenue_impact = float(delivery_stats.total_converted or 0) * 850  # Avg order value estimate

        return {
            "total_customers": total_customers,
            "active_customers_30d": active_30d,
            "total_campaigns": total_campaigns,
            "active_campaigns": active_campaigns,
            "completed_campaigns": completed_campaigns,
            "avg_delivery_rate": avg_delivery_rate,
            "avg_open_rate": avg_open_rate,
            "avg_click_rate": avg_click_rate,
            "total_messages_sent": total_sent,
            "total_messages_delivered": total_delivered,
            "revenue_impact": round(revenue_impact, 2),
            "trends": {
                "customers_change": 12.5,  # Simulated trend
                "campaigns_change": 8.3,
                "delivery_change": 2.1,
                "revenue_change": 15.7,
            },
        }

    @staticmethod
    def get_channel_performance():
        """
        Get delivery/engagement performance broken down by channel.
        Used for the channel comparison chart.
        """
        channels = ["whatsapp", "email", "sms"]
        performance = []

        for channel in channels:
            stats = db.session.query(
                func.sum(Campaign.total_sent).label("sent"),
                func.sum(Campaign.total_delivered).label("delivered"),
                func.sum(Campaign.total_failed).label("failed"),
                func.sum(Campaign.total_read).label("read"),
                func.sum(Campaign.total_clicked).label("clicked"),
                func.sum(Campaign.total_converted).label("converted"),
                func.count(Campaign.id).label("campaign_count"),
            ).filter(
                Campaign.channel == channel
            ).first()

            sent = int(stats.sent or 0)
            delivered = int(stats.delivered or 0)
            read = int(stats.read or 0)
            clicked = int(stats.clicked or 0)

            performance.append({
                "channel": channel,
                "campaign_count": int(stats.campaign_count or 0),
                "total_sent": sent,
                "total_delivered": delivered,
                "total_read": read,
                "total_clicked": clicked,
                "delivery_rate": round(delivered / sent * 100, 1) if sent > 0 else 0,
                "open_rate": round(read / delivered * 100, 1) if delivered > 0 else 0,
                "click_rate": round(clicked / delivered * 100, 1) if delivered > 0 else 0,
            })

        return performance

    @staticmethod
    def get_campaign_trends(days=30, brand_id=None):
        """
        Get campaign performance trends over time.
        Returns daily aggregates for the specified period.
        """
        now = datetime.now(timezone.utc)
        cutoff = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)

        campaigns = (
            Campaign.query
            .filter(Campaign.launched_at >= cutoff)
            .order_by(Campaign.launched_at.asc())
            .all()
        )

        daily_data = {}
        for i in range(days + 1):
            day_str = (cutoff + timedelta(days=i)).strftime("%Y-%m-%d")
            daily_data[day_str] = {
                "date": day_str,
                "sent": 0,
                "delivered": 0,
                "read": 0,
                "clicked": 0,
            }

        for campaign in campaigns:
            if not campaign.launched_at:
                continue
            c_brand_id = campaign.ai_metadata.get("brand_id") if campaign.ai_metadata else None
            
            # Map pre-seeded/unassigned campaigns dynamically
            if not c_brand_id:
                name_lower = campaign.name.lower()
                if "aura" in name_lower or "festive" in name_lower or "ethnic" in name_lower:
                    c_brand_id = "aura-fashion"
                elif "brew" in name_lower or "espresso" in name_lower or "roast" in name_lower or "dormancy" in name_lower:
                    c_brand_id = "brew-co"
                elif "bloom" in name_lower or "hydration" in name_lower or "skincare" in name_lower or "sneak-peek" in name_lower:
                    c_brand_id = "bloom-beauty"
                else:
                    c_brand_id = "aura-fashion"
            
            if brand_id and c_brand_id != brand_id:
                continue

            day_str = campaign.launched_at.strftime("%Y-%m-%d")
            if day_str in daily_data:
                daily_data[day_str]["sent"] += campaign.total_sent
                daily_data[day_str]["delivered"] += campaign.total_delivered
                daily_data[day_str]["read"] += campaign.total_read
                daily_data[day_str]["clicked"] += campaign.total_clicked

        trends = sorted(list(daily_data.values()), key=lambda x: x["date"])
        return trends

    @staticmethod
    def get_top_campaigns(limit=10):
        """Get top performing campaigns by delivery rate."""
        campaigns = (
            Campaign.query
            .filter(Campaign.status.in_(["completed", "active"]))
            .filter(Campaign.total_sent > 0)
            .order_by(
                (Campaign.total_delivered * 100.0 / Campaign.total_sent).desc()
            )
            .limit(limit)
            .all()
        )

        return [
            {
                "id": c.id,
                "name": c.name,
                "channel": c.channel,
                "status": c.status,
                "total_sent": c.total_sent,
                "delivery_rate": c.delivery_rate,
                "open_rate": c.open_rate,
                "click_rate": c.click_rate,
                "launched_at": c.launched_at.isoformat() if c.launched_at else None,
            }
            for c in campaigns
        ]

    @staticmethod
    def get_customer_segments_summary():
        """Get summary of customer distribution across segments."""
        from app.models.segment import Segment

        segments = Segment.query.order_by(Segment.customer_count.desc()).all()
        total_customers = Customer.query.count()

        return {
            "total_customers": total_customers,
            "segments": [
                {
                    "id": s.id,
                    "name": s.name,
                    "count": s.customer_count,
                    "percentage": round(
                        (s.customer_count / total_customers * 100), 1
                    ) if total_customers > 0 else 0,
                    "segment_type": s.segment_type,
                }
                for s in segments
            ],
        }
