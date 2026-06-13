export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  gender: string;
  lifetime_value: number;
  total_orders: number;
  avg_order_value: number;
  last_purchase_at: string;
  preferred_channel: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  segment_id: string;
  segment_name?: string;
  channel: string;
  status: 'draft' | 'active' | 'completed' | 'failed';
  message_template: string;
  subject_line?: string;
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  total_read: number;
  total_clicked: number;
  total_converted: number;
  launched_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface Segment {
  id: string;
  name: string;
  description: string;
  customer_count: number;
  ai_query?: string;
  segment_type: string;
  rules: Record<string, unknown>;
  created_at: string;
}

export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: ToolCall[];
  timestamp: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'completed' | 'error';
}

export interface CopilotConversation {
  id: string;
  title: string;
  messages: CopilotMessage[];
  created_at: string;
  updated_at: string;
}

export interface AnalyticsOverview {
  total_customers: number;
  active_campaigns: number;
  avg_delivery_rate: number;
  revenue_impact: number;
  trends: {
    customers_change: number;
    campaigns_change: number;
    delivery_change: number;
    revenue_change: number;
  };
}

export interface CampaignLog {
  id: string;
  campaign_id: string;
  customer_id: string;
  customer_name: string;
  status: 'SENT' | 'FAILED' | 'DELIVERED' | 'READ' | 'CLICKED' | 'CONVERTED';
  message_content: string;
  sent_at: string;
  delivered_at?: string;
}

export interface APIResponse<T> {
  data: T;
  message?: string;
  total?: number;
  page?: number;
  limit?: number;
}
