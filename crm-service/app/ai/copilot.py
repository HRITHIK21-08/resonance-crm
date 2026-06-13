"""
Resonance CRM — AI Copilot Orchestrator

The core AI engine that processes marketer messages, calls the LLM with tool
definitions, executes tool calls, and generates responses.

Supports two AI providers:
1. Google Gemini (default, free tier available)
2. OpenAI (GPT-4o-mini, requires paid key)

Architecture:
- Multi-turn conversation with tool calling loop
- The LLM receives the conversation history + available tools
- When the LLM wants to use a tool, it returns a tool call
- We execute the tool and feed the result back to the LLM
- The LLM then generates a human-readable response
- This loop can iterate multiple times for complex queries

This pattern is called "agentic tool use" and is what makes
the copilot AI-native rather than AI-assisted.
"""
import json
import logging
from datetime import datetime, timezone

from flask import current_app

from app.ai.prompts import COPILOT_SYSTEM_PROMPT, INSIGHT_GENERATION_PROMPT, DASHBOARD_INSIGHTS_PROMPT
from app.ai.tools import TOOL_DECLARATIONS, execute_tool
from app.extensions import db
from app.models.copilot import CopilotConversation

logger = logging.getLogger(__name__)


class CopilotEngine:
    """
    AI Copilot orchestrator. Manages conversations, tool calling, and response generation.
    """

    def __init__(self):
        self.provider = None
        self._gemini_model = None
        self._openai_client = None

    def _init_provider(self):
        """Lazy-initialize the AI provider."""
        from flask import has_request_context, request

        client_gemini_key = None
        client_openai_key = None
        if has_request_context():
            client_gemini_key = request.headers.get("x-gemini-key")
            client_openai_key = request.headers.get("x-openai-key")

        # Determine keys
        gemini_key = client_gemini_key or current_app.config.get("GEMINI_API_KEY")
        openai_key = client_openai_key or current_app.config.get("OPENAI_API_KEY")

        provider = current_app.config.get("AI_PROVIDER", "gemini")
        if client_openai_key:
            provider = "openai"
        elif client_gemini_key:
            provider = "gemini"

        # Fallback to mock provider if no API keys are specified
        if not gemini_key and not openai_key:
            self.provider = "mock"
            return

        # Always re-init if a client key is supplied via headers to ensure correct key is used
        if client_gemini_key or client_openai_key or not self.provider or self.provider != provider:
            if provider == "gemini":
                self._init_gemini(gemini_key)
            elif provider == "openai":
                self._init_openai(openai_key)
            self.provider = provider
            logger.info(f"AI provider initialized dynamically: {provider}")

    def _init_gemini(self, api_key=None):
        """Initialize Google Gemini client."""
        import google.generativeai as genai

        if not api_key:
            api_key = current_app.config.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required when AI_PROVIDER=gemini")

        genai.configure(api_key=api_key)
        self._gemini_model = genai.GenerativeModel(
            model_name=current_app.config.get("AI_MODEL", "gemini-2.0-flash"),
            system_instruction=COPILOT_SYSTEM_PROMPT,
            tools=self._get_gemini_tools(),
        )

    def _init_openai(self, api_key=None):
        """Initialize OpenAI client."""
        from openai import OpenAI

        if not api_key:
            api_key = current_app.config.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required when AI_PROVIDER=openai")

        self._openai_client = OpenAI(api_key=api_key)

    def chat(self, conversation_id, user_message):
        """
        Process a user message in a conversation.

        Args:
            conversation_id: Existing conversation ID or None for new conversation
            user_message: The marketer's message text

        Returns:
            Dict with response, tool_calls, and conversation metadata
        """
        self._init_provider()

        # Get or create conversation
        if conversation_id:
            conversation = CopilotConversation.query.get(conversation_id)
            if not conversation:
                conversation = self._create_conversation()
        else:
            conversation = self._create_conversation()

        # Add user message
        conversation.add_message("user", user_message)

        # Auto-generate title from first user message
        if not conversation.title and user_message:
            conversation.title = user_message[:80] + ("..." if len(user_message) > 80 else "")

        db.session.commit()

        # Process with AI
        try:
            if self.provider == "gemini":
                result = self._process_gemini(conversation)
            elif self.provider == "openai":
                result = self._process_openai(conversation)
            elif self.provider == "mock":
                result = self._process_mock(conversation, user_message)
            else:
                result = {
                    "response": "AI provider not configured. Please set GEMINI_API_KEY or OPENAI_API_KEY.",
                    "tool_calls": [],
                }
        except Exception as e:
            logger.error(f"AI processing error: {e}", exc_info=True)
            result = {
                "response": f"I encountered an error while processing your request. Please try again. (Error: {str(e)[:100]})",
                "tool_calls": [],
            }

        # Add assistant response
        conversation.add_message(
            "assistant",
            result["response"],
            tool_calls=result.get("tool_calls"),
        )
        db.session.commit()

        return {
            "conversation_id": conversation.id,
            "response": result["response"],
            "tool_calls": result.get("tool_calls", []),
            "title": conversation.title,
        }

    def _create_conversation(self):
        """Create a new copilot conversation."""
        conversation = CopilotConversation(status="active")
        db.session.add(conversation)
        db.session.flush()
        return conversation

    # ──────────────────────────────────────────────────────────────────
    # Gemini Implementation
    # ──────────────────────────────────────────────────────────────────

    def _get_gemini_tools(self):
        """Convert tool declarations to Gemini function declarations."""
        import google.generativeai as genai
        from google.generativeai.types import FunctionDeclaration, Tool

        functions = []
        for tool_def in TOOL_DECLARATIONS:
            # Clean up parameters for Gemini format
            params = tool_def.get("parameters", {})
            properties = params.get("properties", {})

            # Gemini doesn't support empty required arrays well
            cleaned_params = {
                "type": "object",
                "properties": properties,
            }
            required = params.get("required", [])
            if required:
                cleaned_params["required"] = required

            functions.append(
                FunctionDeclaration(
                    name=tool_def["name"],
                    description=tool_def["description"],
                    parameters=cleaned_params if properties else None,
                )
            )

        return [Tool(function_declarations=functions)]

    def _process_gemini(self, conversation):
        """Process conversation with Gemini, handling tool calling loop."""
        import google.generativeai as genai
        from google.generativeai.types import content_types

        # Build conversation history for Gemini
        history = self._build_gemini_history(conversation)

        # Start chat
        chat = self._gemini_model.start_chat(history=history[:-1] if len(history) > 1 else [])

        # Send the latest message
        latest_msg = history[-1] if history else None
        if not latest_msg:
            return {"response": "No message to process.", "tool_calls": []}

        # Get user content from the last message
        user_text = conversation.messages[-1]["content"]

        all_tool_calls = []
        max_iterations = 5  # Prevent infinite loops

        response = chat.send_message(user_text)

        for iteration in range(max_iterations):
            # Check if response contains function calls
            function_calls = []
            for candidate in response.candidates:
                for part in candidate.content.parts:
                    if hasattr(part, "function_call") and part.function_call:
                        function_calls.append(part.function_call)

            if not function_calls:
                # No more tool calls — extract text response
                text_response = ""
                for candidate in response.candidates:
                    for part in candidate.content.parts:
                        if hasattr(part, "text") and part.text:
                            text_response += part.text
                return {
                    "response": text_response or "I processed your request.",
                    "tool_calls": all_tool_calls,
                }

            # Execute tool calls and build responses
            tool_responses = []
            for fc in function_calls:
                tool_name = fc.name
                args = dict(fc.args) if fc.args else {}

                logger.info(f"Gemini tool call: {tool_name}({json.dumps(args, default=str)[:200]})")

                # Execute the tool
                result = execute_tool(tool_name, args)

                all_tool_calls.append({
                    "name": tool_name,
                    "args": args,
                    "result": result,
                    "status": "error" if "error" in result else "completed",
                })

                tool_responses.append(
                    genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=tool_name,
                            response={"result": json.loads(json.dumps(result, default=str))}
                        )
                    )
                )

            # Send tool results back to Gemini
            response = chat.send_message(tool_responses)

        # If we hit max iterations, return what we have
        return {
            "response": "I've completed the analysis. Let me know if you need anything else.",
            "tool_calls": all_tool_calls,
        }

    def _build_gemini_history(self, conversation):
        """Convert conversation history to Gemini format."""
        import google.generativeai as genai

        history = []
        for msg in (conversation.messages or [])[:-1]:  # Exclude last (will be sent as new)
            role = "user" if msg["role"] == "user" else "model"
            history.append(
                genai.types.ContentDict(
                    role=role,
                    parts=[msg["content"]],
                )
            )
        return history

    # ──────────────────────────────────────────────────────────────────
    # OpenAI Implementation
    # ──────────────────────────────────────────────────────────────────

    def _process_openai(self, conversation):
        """Process conversation with OpenAI, handling tool calling loop."""
        # Build messages for OpenAI
        messages = [{"role": "system", "content": COPILOT_SYSTEM_PROMPT}]

        for msg in conversation.messages or []:
            messages.append({
                "role": msg["role"],
                "content": msg["content"],
            })

        # Convert tool declarations to OpenAI format
        tools = [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t["parameters"],
                },
            }
            for t in TOOL_DECLARATIONS
        ]

        all_tool_calls = []
        max_iterations = 5

        for iteration in range(max_iterations):
            response = self._openai_client.chat.completions.create(
                model=current_app.config.get("AI_MODEL", "gpt-4o-mini"),
                messages=messages,
                tools=tools,
                tool_choice="auto",
            )

            choice = response.choices[0]

            # Check if there are tool calls
            if choice.message.tool_calls:
                # Add assistant message with tool calls to history
                messages.append(choice.message.model_dump())

                for tc in choice.message.tool_calls:
                    tool_name = tc.function.name
                    args = json.loads(tc.function.arguments)

                    logger.info(f"OpenAI tool call: {tool_name}({json.dumps(args, default=str)[:200]})")

                    result = execute_tool(tool_name, args)

                    all_tool_calls.append({
                        "name": tool_name,
                        "args": args,
                        "result": result,
                        "status": "error" if "error" in result else "completed",
                    })

                    # Add tool result to messages
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result, default=str),
                    })
            else:
                # No tool calls — return the text response
                return {
                    "response": choice.message.content or "I processed your request.",
                    "tool_calls": all_tool_calls,
                }

        return {
            "response": "I've completed the analysis. Let me know if you need anything else.",
            "tool_calls": all_tool_calls,
        }

    # ──────────────────────────────────────────────────────────────────
    # Utility Methods
    # ──────────────────────────────────────────────────────────────────

    def generate_insights(self, campaign_data):
        """Generate AI insights for a campaign."""
        self._init_provider()

        prompt = INSIGHT_GENERATION_PROMPT.format(**campaign_data)

        try:
            if self.provider == "gemini":
                import google.generativeai as genai
                model = genai.GenerativeModel("gemini-2.0-flash")
                response = model.generate_content(prompt)
                return response.text
            elif self.provider == "openai":
                response = self._openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                )
                return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Insight generation error: {e}")
            return "Unable to generate insights at this time."

    def generate_dashboard_insights(self, dashboard_data):
        """Generate proactive AI insights for the dashboard."""
        self._init_provider()

        prompt = DASHBOARD_INSIGHTS_PROMPT.format(**dashboard_data)

        try:
            if self.provider == "gemini":
                import google.generativeai as genai
                model = genai.GenerativeModel("gemini-2.0-flash")
                response = model.generate_content(prompt)
                text = response.text
            elif self.provider == "openai":
                response = self._openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                )
                text = response.choices[0].message.content

            # Try to parse as JSON
            try:
                # Extract JSON from markdown code blocks if present
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0]
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0]
                return json.loads(text)
            except (json.JSONDecodeError, IndexError):
                return [{"title": "AI Insights", "description": text, "priority": "medium", "action": "Review dashboard"}]

        except Exception as e:
            logger.error(f"Dashboard insight generation error: {e}")
            return [
                {
                    "title": "Welcome to Resonance",
                    "description": "Start by creating your first AI-powered campaign using the Copilot.",
                    "priority": "high",
                    "action": "Open Copilot"
                }
            ]

    def _process_mock(self, conversation, user_message):
        """
        Processes message with a rule-based mock agent when API keys are not supplied.
        Executes actual DB tool-calling based on intent to make CRM functional out-of-the-box.
        """
        msg_lower = user_message.lower()
        tool_calls = []
        response = ""

        # Check intent: search customers
        if "find" in msg_lower or "search" in msg_lower or "spent" in msg_lower or "ltv" in msg_lower:
            args = {"sort_by": "lifetime_value", "sort_dir": "desc"}
            if "bangalore" in msg_lower:
                args["city"] = "Bangalore"
            elif "mumbai" in msg_lower:
                args["city"] = "Mumbai"
            elif "delhi" in msg_lower:
                args["city"] = "Delhi"
            
            if "5000" in msg_lower or "5k" in msg_lower:
                args["min_ltv"] = 5000
            elif "10000" in msg_lower or "10k" in msg_lower:
                args["min_ltv"] = 10000
            
            result = execute_tool("search_customers", args)
            tool_calls.append({
                "name": "search_customers",
                "args": args,
                "result": result,
                "status": "completed"
            })
            
            customers = result.get('customers', [])
            cust_list = ""
            if customers:
                cust_list = "\n\n### Top Matching Shoppers\n\n| Name | City | LTV | Preferred Channel |\n| :--- | :--- | :--- | :--- |\n"
                for c in customers[:5]:
                    cust_list += f"| **{c['name']}** | {c['city']} | ₹{c['lifetime_value']:.2f} | {c['preferred_channel']} |\n"

            response = (
                f"I've searched our Luxe Threads database for matching shoppers.\n\n"
                f"Found **{result.get('total_matching', 0)} customers** matching your criteria.{cust_list}\n\n"
                f"Would you like me to save these shoppers as an audience segment? Just reply **'create segment'**."
            )

        # Check intent: segment
        elif "segment" in msg_lower or "save" in msg_lower:
            from app.models.segment import Segment
            seg_count = Segment.query.count() + 1
            name = f"AI Auto-Segment #{seg_count}"
            desc = "Created dynamically via Resonance AI Copilot"
            rules = {
                "logic": "AND",
                "conditions": [
                    {"field": "lifetime_value", "operator": "gte", "value": 5000}
                ]
            }
            if "bangalore" in msg_lower:
                rules["conditions"].append({"field": "city", "operator": "eq", "value": "Bangalore"})
                name = f"Bangalore Spenders #{seg_count}"
            elif "mumbai" in msg_lower:
                rules["conditions"].append({"field": "city", "operator": "eq", "value": "Mumbai"})
                name = f"Mumbai Spenders #{seg_count}"

            args = {"name": name, "description": desc, "rules": rules}
            result = execute_tool("create_segment", args)
            tool_calls.append({
                "name": "create_segment",
                "args": args,
                "result": result,
                "status": "completed"
            })
            response = (
                f"### Segment Created Successfully! 🎉\n\n"
                f"- **Segment Name**: '{result.get('segment_name')}'\n"
                f"- **Description**: {desc}\n"
                f"- **Member Count**: **{result.get('customer_count', 0)} customers**\n"
                f"- **Evaluation Status**: Active & Evaluated\n\n"
                f"Next, let's choose the best communication channel for this audience. "
                f"Ask me to **'recommend a channel for this segment'**."
            )

        # Check intent: channel recommendation
        elif "channel" in msg_lower or "recommend" in msg_lower:
            from app.models.segment import Segment
            latest_seg = Segment.query.order_by(Segment.created_at.desc()).first()
            seg_id = latest_seg.id if latest_seg else "default"
            
            args = {"segment_id": seg_id}
            result = execute_tool("recommend_channel", args)
            tool_calls.append({
                "name": "recommend_channel",
                "args": args,
                "result": result,
                "status": "completed"
            })
            
            options = result.get('all_options', [])
            opt_list = ""
            if options:
                opt_list = "\n\n### Channel Engagement Breakdown\n\n| Channel | Preference Split | Expected Open Rate | Cost per Message |\n| :--- | :--- | :--- | :--- |\n"
                for o in options:
                    opt_list += f"| **{o['channel'].capitalize()}** | {o['segment_preference']}% | {o['expected_open_rate']}% | ₹{o['cost_per_message']:.2f} |\n"

            response = (
                f"I've analyzed the customer engagement channel preferences for segment **'{result.get('segment_name', 'your audience')}'**.\n\n"
                f"I recommend using **{result.get('recommended_channel', 'email').upper()}** as the optimal channel. "
                f"{result.get('reason')}.{opt_list}\n\n"
                f"Should I go ahead and draft a campaign message? Just reply **'draft WhatsApp message'** or **'draft Email message'**."
            )

        # Check intent: draft template
        elif "draft" in msg_lower or "message" in msg_lower or "write" in msg_lower:
            channel = "whatsapp"
            if "email" in msg_lower:
                channel = "email"
            elif "sms" in msg_lower:
                channel = "sms"
                
            args = {"goal": "re-engage dormant customers", "channel": channel, "tone": "warm"}
            result = execute_tool("draft_campaign_message", args)
            tool_calls.append({
                "name": "draft_campaign_message",
                "args": args,
                "result": result,
                "status": "completed"
            })
            
            msg_text = result.get("message")
            formatted_msg = ""
            if isinstance(msg_text, dict):
                formatted_msg = f"**Subject:** {msg_text.get('subject_line')}\n\n**Body:**\n```\n{msg_text.get('body')}\n```"
            else:
                formatted_msg = f"**Message Body:**\n```\n{msg_text}\n```"
                
            response = (
                f"### Campaign Message Drafted ✍️\n\n"
                f"Here is a warm re-engagement template generated for **{channel.upper()}**:\n\n"
                f"{formatted_msg}\n\n"
                f"If this layout and copy look good to you, reply with **'create campaign'** to save this as a draft."
            )

        # Check intent: create campaign
        elif "campaign" in msg_lower or "create campaign" in msg_lower:
            from app.models.segment import Segment
            latest_seg = Segment.query.order_by(Segment.created_at.desc()).first()
            seg_id = latest_seg.id if latest_seg else "default"
            seg_name = latest_seg.name if latest_seg else "audience"
            channel = "whatsapp"
            if "email" in msg_lower:
                channel = "email"
            elif "sms" in msg_lower:
                channel = "sms"
                
            args = {
                "name": f"Re-engagement Campaign via {channel.capitalize()}",
                "description": f"Targeting {seg_name} dynamically",
                "segment_id": seg_id,
                "channel": channel,
                "message_template": "Hey {{first_name}}! We missed you. Get 20% off with coupon COMEBACK20. luxethreads.com/shop"
            }
            result = execute_tool("create_campaign", args)
            tool_calls.append({
                "name": "create_campaign",
                "args": args,
                "result": result,
                "status": "completed"
            })
            response = (
                f"### Campaign Draft Created! 🚀\n\n"
                f"- **Campaign Name**: '{result.get('campaign_name')}'\n"
                f"- **Target Audience**: {result.get('segment_name')} ({result.get('customer_count')} recipients)\n"
                f"- **Channel**: {result.get('channel').upper()}\n"
                f"- **Status**: **Draft**\n\n"
                f"To execute this campaign and send messages to all recipients, reply with **'launch campaign'**."
            )

        # Check intent: launch
        elif "launch" in msg_lower or "send" in msg_lower or "execute" in msg_lower:
            from app.models.campaign import Campaign
            latest_camp = Campaign.query.filter_by(status="draft").order_by(Campaign.created_at.desc()).first()
            if not latest_camp:
                latest_camp = Campaign.query.order_by(Campaign.created_at.desc()).first()
                
            if not latest_camp:
                response = "No campaign draft found. Please create a campaign draft first!"
            else:
                args = {"campaign_id": latest_camp.id}
                result = execute_tool("launch_campaign", args)
                tool_calls.append({
                    "name": "launch_campaign",
                    "args": args,
                    "result": result,
                    "status": "completed"
                })
                response = (
                    f"### 🚀 Campaign Dispatched & Active!\n\n"
                    f"The campaign has been successfully launched! Here is the dispatch report:\n\n"
                    f"- **Total Dispatches**: **{result.get('total_sent', 0)} messages**\n"
                    f"- **Delivery Failures**: **{result.get('total_failed', 0)}**\n"
                    f"- **Current Status**: **Active (Simulating live delivery events)**\n\n"
                    f"You can now head over to the **Campaigns** page or click on this campaign to view real-time delivery and click metrics!"
                )

        # General greeting / guide
        else:
            if "get" in msg_lower or "more" in msg_lower or "strategy" in msg_lower or "increase" in msg_lower or "grow" in msg_lower:
                response = (
                    "To grow your customer base and boost sales, the best strategy is targeted retention marketing. "
                    "Since acquiring a new customer costs 5x more than retaining an existing one, I recommend starting with a re-engagement flow:\n\n"
                    "1. **Analyze your base**: Ask me to *'Find customers in Bangalore who spent more than 5000'* to view your high-value cohorts.\n"
                    "2. **Build an audience**: Ask me to *'Create a segment for Bangalore spenders'* to save them dynamically.\n"
                    "3. **Select optimal channel**: Ask me to *'Recommend a channel'* to analyze their historical open rates.\n"
                    "4. **Draft & Send**: Ask me to *'Draft a WhatsApp template'* and then *'Create campaign'*\n\n"
                    "Let's try: ask me to *'Find customers in Bangalore who spent more than 5000'* to begin!"
                )
            elif "who" in msg_lower or "what" in msg_lower or "how" in msg_lower or "why" in msg_lower or "help" in msg_lower:
                response = (
                    "I am your Resonance AI Copilot. I help you search customer records, create dynamic audience segments, "
                    "recommend optimal marketing channels, write campaign copy templates, and launch dispatches to our simulated channel service.\n\n"
                    "Here are a few quick things you can ask me to do:\n"
                    "- *'Find customers in Mumbai who spent over 5000'*\n"
                    "- *'Create a segment for them'*\n"
                    "- *'Recommend a channel'*\n"
                    "- *'Draft a WhatsApp template'*\n"
                    "- *'Create campaign'*\n"
                    "- *'Launch campaign'*"
                )
            else:
                response = (
                    "Hello! I am Resonance AI, your marketing copilot (Demo Mode: Active). How can I help you today?\n\n"
                    "Here are some examples of what you can ask me:\n"
                    "- *'Find customers in Mumbai who spent over 5000'* (Inspects customer records)\n"
                    "- *'Create a segment for them'* (Saves segment to database)\n"
                    "- *'Recommend a channel'* (Checks engagement preferences)\n"
                    "- *'Draft a WhatsApp template'* (Generates templates)\n"
                    "- *'Create campaign'* (Creates campaign draft)\n"
                    "- *'Launch campaign'* (Dispatches campaign to channel simulator)"
                )

        return {
            "response": response,
            "tool_calls": tool_calls
        }


# Singleton instance
copilot = CopilotEngine()
