"""
Resonance CRM — AI Tool Definitions

Defines the tools (functions) available to the AI copilot.
These are passed to the LLM as function declarations, enabling structured tool calling.

Architecture:
- Each tool maps to a real backend service operation
- Tools receive validated parameters and return structured data
- The AI decides which tools to call based on the marketer's intent
- Tool results are fed back to the AI for response generation

This is what makes Resonance AI-native:
- The AI doesn't just generate text — it operates on real data
- It composes multiple tools to achieve complex goals
- Tool calls are visible in the UI, showing transparency
"""
import logging
import json

from app.services.customer_service import CustomerService
from app.services.segment_service import SegmentService
from app.services.campaign_service import CampaignService
from app.services.analytics_service import AnalyticsService

logger = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────────
# Tool Declarations (for LLM function calling)
# ──────────────────────────────────────────────────────────────────────

TOOL_DECLARATIONS = [
    {
        "name": "search_customers",
        "description": "Search and filter customers based on criteria like lifetime value, purchase activity, city, gender, and inactivity period. Returns matching customers with count.",
        "parameters": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Search by name, email, or phone"
                },
                "city": {
                    "type": "string",
                    "description": "Filter by city (e.g., 'Mumbai', 'Delhi')"
                },
                "min_ltv": {
                    "type": "number",
                    "description": "Minimum lifetime value in INR"
                },
                "max_ltv": {
                    "type": "number",
                    "description": "Maximum lifetime value in INR"
                },
                "inactive_days": {
                    "type": "integer",
                    "description": "Filter customers inactive for at least this many days"
                },
                "sort_by": {
                    "type": "string",
                    "enum": ["lifetime_value", "total_orders", "last_purchase_at", "created_at"],
                    "description": "Sort results by this field"
                },
                "sort_dir": {
                    "type": "string",
                    "enum": ["asc", "desc"],
                    "description": "Sort direction"
                }
            },
            "required": []
        }
    },
    {
        "name": "create_segment",
        "description": "Create a new audience segment with specific targeting rules. Rules use conditions with fields (lifetime_value, total_orders, avg_order_value, last_purchase_at, city, gender, preferred_channel) and operators (eq, neq, gt, gte, lt, lte, contains, in, between, days_ago_lt, days_ago_gt).",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Segment name (e.g., 'VIP Dormant Customers')"
                },
                "description": {
                    "type": "string",
                    "description": "Human-readable description of the segment"
                },
                "rules": {
                    "type": "object",
                    "description": "Segment rules with 'logic' (AND/OR) and 'conditions' array. Each condition has 'field', 'operator', and 'value'.",
                    "properties": {
                        "logic": {"type": "string", "enum": ["AND", "OR"]},
                        "conditions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "field": {"type": "string"},
                                    "operator": {"type": "string"},
                                    "value": {}
                                }
                            }
                        }
                    }
                }
            },
            "required": ["name", "description", "rules"]
        }
    },
    {
        "name": "get_segment_stats",
        "description": "Get detailed demographics and statistics for a segment, including city distribution, gender breakdown, channel preferences, and LTV metrics.",
        "parameters": {
            "type": "object",
            "properties": {
                "segment_id": {
                    "type": "string",
                    "description": "The segment ID to analyze"
                }
            },
            "required": ["segment_id"]
        }
    },
    {
        "name": "list_segments",
        "description": "List all existing audience segments with their names, sizes, and descriptions.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
    {
        "name": "draft_campaign_message",
        "description": "Generate a campaign message draft. Does NOT send anything — just creates the text for review.",
        "parameters": {
            "type": "object",
            "properties": {
                "goal": {
                    "type": "string",
                    "description": "Campaign goal (e.g., 're-engage dormant customers', 'promote new collection', 'flash sale')"
                },
                "channel": {
                    "type": "string",
                    "enum": ["whatsapp", "email", "sms"],
                    "description": "Target channel for the message"
                },
                "tone": {
                    "type": "string",
                    "enum": ["warm", "urgent", "professional", "casual", "exciting"],
                    "description": "Desired tone of the message"
                },
                "offer": {
                    "type": "string",
                    "description": "Specific offer or promotion details (optional)"
                }
            },
            "required": ["goal", "channel", "tone"]
        }
    },
    {
        "name": "recommend_channel",
        "description": "Analyze a segment's channel preferences and past engagement to recommend the optimal communication channel.",
        "parameters": {
            "type": "object",
            "properties": {
                "segment_id": {
                    "type": "string",
                    "description": "Segment to analyze for channel recommendation"
                }
            },
            "required": ["segment_id"]
        }
    },
    {
        "name": "create_campaign",
        "description": "Create a new campaign (in draft status). Requires segment_id, channel, and message. Does NOT launch the campaign.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Campaign name"
                },
                "description": {
                    "type": "string",
                    "description": "Campaign description"
                },
                "segment_id": {
                    "type": "string",
                    "description": "Target segment ID"
                },
                "channel": {
                    "type": "string",
                    "enum": ["whatsapp", "email", "sms"],
                    "description": "Communication channel"
                },
                "message_template": {
                    "type": "string",
                    "description": "Message content with {{first_name}}, {{name}} placeholders"
                },
                "subject_line": {
                    "type": "string",
                    "description": "Email subject line (required for email channel)"
                },
                "ai_goal": {
                    "type": "string",
                    "description": "The original business goal for this campaign"
                }
            },
            "required": ["name", "segment_id", "channel", "message_template"]
        }
    },
    {
        "name": "launch_campaign",
        "description": "Launch a draft campaign — this actually sends messages to all segment members. ALWAYS confirm with the user before calling this.",
        "parameters": {
            "type": "object",
            "properties": {
                "campaign_id": {
                    "type": "string",
                    "description": "ID of the draft campaign to launch"
                }
            },
            "required": ["campaign_id"]
        }
    },
    {
        "name": "get_campaign_analytics",
        "description": "Get detailed performance analytics for a campaign, including delivery funnel, rates, and status distribution.",
        "parameters": {
            "type": "object",
            "properties": {
                "campaign_id": {
                    "type": "string",
                    "description": "Campaign ID to analyze"
                }
            },
            "required": ["campaign_id"]
        }
    },
    {
        "name": "get_dashboard_overview",
        "description": "Get the overall dashboard KPIs including total customers, active campaigns, delivery rates, and revenue impact.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": []
        }
    },
]


# ──────────────────────────────────────────────────────────────────────
# Tool Implementations
# ──────────────────────────────────────────────────────────────────────

def execute_tool(tool_name, arguments):
    """
    Execute a tool by name with the given arguments.
    Returns structured result data.

    Args:
        tool_name: Name of the tool to execute
        arguments: Dict of tool arguments

    Returns:
        Dict with tool execution result
    """
    logger.info(f"Executing tool: {tool_name} with args: {json.dumps(arguments, default=str)[:200]}")

    try:
        if tool_name == "search_customers":
            return _search_customers(arguments)
        elif tool_name == "create_segment":
            return _create_segment(arguments)
        elif tool_name == "get_segment_stats":
            return _get_segment_stats(arguments)
        elif tool_name == "list_segments":
            return _list_segments(arguments)
        elif tool_name == "draft_campaign_message":
            return _draft_campaign_message(arguments)
        elif tool_name == "recommend_channel":
            return _recommend_channel(arguments)
        elif tool_name == "create_campaign":
            return _create_campaign(arguments)
        elif tool_name == "launch_campaign":
            return _launch_campaign(arguments)
        elif tool_name == "get_campaign_analytics":
            return _get_campaign_analytics(arguments)
        elif tool_name == "get_dashboard_overview":
            return _get_dashboard_overview(arguments)
        else:
            return {"error": f"Unknown tool: {tool_name}"}
    except Exception as e:
        logger.error(f"Tool execution error: {tool_name}: {e}")
        return {"error": str(e)}


def _search_customers(args):
    """Search customers with filters."""
    result = CustomerService.get_all(
        page=1,
        per_page=20,
        search=args.get("search"),
        city=args.get("city"),
        min_ltv=args.get("min_ltv"),
        max_ltv=args.get("max_ltv"),
        sort_by=args.get("sort_by", "lifetime_value"),
        sort_dir=args.get("sort_dir", "desc"),
        inactive_days=args.get("inactive_days"),
    )
    return {
        "total_matching": result["total"],
        "showing": len(result["items"]),
        "customers": result["items"][:10],  # Limit for AI context
        "summary": f"Found {result['total']} customers matching your criteria."
    }


def _create_segment(args):
    """Create a new segment."""
    # First preview the count
    preview = SegmentService.preview_count(args["rules"])

    segment = SegmentService.create({
        "name": args["name"],
        "description": args.get("description", ""),
        "rules": args["rules"],
        "ai_query": args.get("description", ""),
        "segment_type": "ai",
    })

    return {
        "segment_id": segment["id"],
        "segment_name": segment["name"],
        "customer_count": segment["customer_count"],
        "message": f"Created segment '{segment['name']}' with {segment['customer_count']} customers."
    }


def _get_segment_stats(args):
    """Get segment demographics."""
    return SegmentService.get_segment_demographics(args["segment_id"])


def _list_segments(args):
    """List all segments."""
    segments = SegmentService.get_all()
    return {
        "total_segments": len(segments),
        "segments": [
            {
                "id": s["id"],
                "name": s["name"],
                "description": s["description"],
                "customer_count": s["customer_count"],
                "type": s["segment_type"],
            }
            for s in segments
        ]
    }


def _draft_campaign_message(args):
    """Generate campaign message drafts."""
    channel = args["channel"]
    goal = args["goal"]
    tone = args.get("tone", "warm")
    offer = args.get("offer", "")

    # Generate channel-appropriate message templates
    templates = {
        "whatsapp": _generate_whatsapp_message(goal, tone, offer),
        "email": _generate_email_message(goal, tone, offer),
        "sms": _generate_sms_message(goal, tone, offer),
    }

    return {
        "channel": channel,
        "message": templates.get(channel, templates["email"]),
        "note": "This is a draft. You can edit it before creating the campaign."
    }


def _generate_whatsapp_message(goal, tone, offer):
    """Generate WhatsApp message template."""
    tone_greeting = {
        "warm": "Hey {{first_name}}! 👋",
        "urgent": "🚨 {{first_name}}, don't miss this!",
        "professional": "Hello {{first_name}},",
        "casual": "Hi {{first_name}}! 😊",
        "exciting": "🎉 {{first_name}}, exciting news!",
    }

    greeting = tone_greeting.get(tone, tone_greeting["warm"])

    if "re-engage" in goal.lower() or "comeback" in goal.lower() or "dormant" in goal.lower():
        return f"""{greeting}

We've missed you at LUXE THREADS! 💕

It's been a while since your last visit, and we've been adding some amazing new pieces to our collection.

{f"🎁 Special for you: {offer}" if offer else "🎁 Here's an exclusive 20% OFF on your next order — just for you!"}

Shop now: luxethreads.com/shop

Reply STOP to unsubscribe"""

    elif "sale" in goal.lower() or "discount" in goal.lower():
        return f"""{greeting}

{f"🔥 {offer}" if offer else "🔥 FLASH SALE — Up to 50% OFF!"}

Our biggest sale of the season is LIVE! 🛍️

✨ Ethnic Wear from ₹999
✨ Western Wear from ₹699
✨ Accessories from ₹499

Hurry — limited stock! ⏰

Shop now: luxethreads.com/sale

Reply STOP to unsubscribe"""

    else:
        return f"""{greeting}

We've got something special for you at LUXE THREADS! ✨

{f"{offer}" if offer else "Check out our latest collection — handpicked styles you'll love!"}

👉 Shop now: luxethreads.com/new

Reply STOP to unsubscribe"""


def _generate_email_message(goal, tone, offer):
    """Generate email message template with subject line."""
    if "re-engage" in goal.lower() or "comeback" in goal.lower() or "dormant" in goal.lower():
        return {
            "subject_line": "We miss you, {{first_name}}! Here's something special 💕",
            "body": f"""Hi {{first_name}},

It's been a while since you last shopped with us, and we wanted to check in!

We've been busy adding beautiful new pieces to our collection, and we think you'd love what's new.

{f"As a special welcome back offer: {offer}" if offer else "To welcome you back, here's an exclusive 20% OFF your next order with code COMEBACK20."}

We'd love to see you again!

Warm regards,
Team LUXE THREADS

P.S. This offer expires in 7 days — don't miss out!"""
        }

    elif "sale" in goal.lower() or "discount" in goal.lower():
        return {
            "subject_line": "🔥 Flash Sale is LIVE — Up to 50% OFF!",
            "body": f"""Hi {{first_name}},

The wait is over — our BIGGEST SALE of the season is now LIVE! 🎉

{f"Featured offer: {offer}" if offer else "Up to 50% OFF on your favorite categories:"}

• Ethnic Wear — Starting ₹999
• Western Wear — Starting ₹699
• Footwear — Starting ₹799
• Accessories — Starting ₹499

Shop now before your favorites sell out!

[SHOP THE SALE →]

Happy shopping!
Team LUXE THREADS"""
        }

    else:
        return {
            "subject_line": "{{first_name}}, check out what's new at LUXE THREADS ✨",
            "body": f"""Hi {{first_name}},

{offer if offer else "We're excited to share our latest collection with you!"}

From stunning ethnic pieces to trendy western wear, there's something for every mood and occasion.

Explore what's new and find your next favorite outfit.

[SHOP NEW ARRIVALS →]

With love,
Team LUXE THREADS"""
        }


def _generate_sms_message(goal, tone, offer):
    """Generate SMS message template (max 160 chars)."""
    if "re-engage" in goal.lower() or "comeback" in goal.lower() or "dormant" in goal.lower():
        return f"{{{{first_name}}}}, we miss you! {offer if offer else '20% OFF your next order'} at LUXE THREADS. Shop: luxethreads.com/comeback"

    elif "sale" in goal.lower() or "discount" in goal.lower():
        return f"{{{{first_name}}}}, {offer if offer else 'FLASH SALE: Up to 50% OFF'}! Limited time at LUXE THREADS. Shop: luxethreads.com/sale"

    else:
        return f"Hi {{{{first_name}}}}! {offer if offer else 'New arrivals just dropped'} at LUXE THREADS. Shop now: luxethreads.com/new"


def _recommend_channel(args):
    """Recommend optimal channel for a segment."""
    demographics = SegmentService.get_segment_demographics(args["segment_id"])
    channel_prefs = demographics.get("demographics", {}).get("preferred_channels", [])

    # Find the most popular channel in the segment
    if channel_prefs:
        best_channel = max(channel_prefs, key=lambda x: x["count"])
        total = sum(c["count"] for c in channel_prefs)

        # Channel-specific benchmark data
        benchmarks = {
            "whatsapp": {"avg_open_rate": 78, "avg_click_rate": 12, "cost_per_msg": 0.5},
            "email": {"avg_open_rate": 22, "avg_click_rate": 3.5, "cost_per_msg": 0.1},
            "sms": {"avg_open_rate": 90, "avg_click_rate": 5, "cost_per_msg": 0.3},
        }

        recommendations = []
        for pref in channel_prefs:
            ch = pref["channel"]
            bench = benchmarks.get(ch, {})
            recommendations.append({
                "channel": ch,
                "segment_preference": round(pref["count"] / total * 100, 1),
                "expected_open_rate": bench.get("avg_open_rate", 0),
                "expected_click_rate": bench.get("avg_click_rate", 0),
                "cost_per_message": bench.get("cost_per_msg", 0),
            })

        recommendations.sort(key=lambda x: x["segment_preference"], reverse=True)

        return {
            "recommended_channel": best_channel["channel"],
            "reason": f"{round(best_channel['count'] / total * 100, 1)}% of this segment prefers {best_channel['channel']}",
            "all_options": recommendations,
            "segment_name": demographics["segment_name"],
        }

    return {
        "recommended_channel": "email",
        "reason": "Default recommendation — no channel preference data available",
        "all_options": [],
    }


def _create_campaign(args):
    """Create a campaign in draft status."""
    # Handle email subject line
    message_template = args["message_template"]
    subject_line = args.get("subject_line")

    # If message_template is a dict (from email drafting), extract parts
    if isinstance(message_template, dict):
        subject_line = message_template.get("subject_line", subject_line)
        message_template = message_template.get("body", str(message_template))

    campaign = CampaignService.create({
        "name": args["name"],
        "description": args.get("description", ""),
        "segment_id": args["segment_id"],
        "channel": args["channel"],
        "message_template": message_template,
        "subject_line": subject_line,
        "ai_goal": args.get("ai_goal", ""),
    })

    return {
        "campaign_id": campaign["id"],
        "campaign_name": campaign["name"],
        "segment_name": campaign.get("segment_name"),
        "channel": campaign["channel"],
        "status": campaign["status"],
        "message": f"Campaign '{campaign['name']}' created in draft status. Say 'launch it' to send messages to all segment members."
    }


def _launch_campaign(args):
    """Launch a campaign."""
    campaign = CampaignService.launch(args["campaign_id"])
    return {
        "campaign_id": campaign["id"],
        "campaign_name": campaign["name"],
        "status": campaign["status"],
        "total_sent": campaign["total_sent"],
        "total_failed": campaign["total_failed"],
        "message": f"🚀 Campaign '{campaign['name']}' launched! {campaign['total_sent']} messages sent. Delivery tracking is active."
    }


def _get_campaign_analytics(args):
    """Get campaign analytics."""
    return CampaignService.get_campaign_analytics(args["campaign_id"])


def _get_dashboard_overview(args):
    """Get dashboard overview."""
    return AnalyticsService.get_overview()
