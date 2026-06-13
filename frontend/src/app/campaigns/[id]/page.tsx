'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Campaign, CampaignLog } from '@/lib/types';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Clock, BarChart3, Users, CheckCircle2, AlertCircle, Info, Sparkles, Mail, MessageSquare, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useBrand } from '@/context/BrandContext';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

const statusConfig = {
  draft: { label: 'Draft', className: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
  active: { label: 'Active', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse' },
  completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const channelIcons: Record<string, any> = {
  email: Mail,
  whatsapp: MessageSquare,
  sms: Phone,
};

export default function CampaignDetailsPage() {
  const router = useRouter();
  const { id } = useParams();
  const [logPage, setLogPage] = useState(1);
  const { activeBrand } = useBrand();
  const { resolvedTheme } = useTheme();

  // Fetch campaign details and logs
  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ['campaign-details', id],
    queryFn: () => apiGet(`/api/campaigns/${id}?include_messages=true`),
    enabled: !!id,
    refetchInterval: (query) => {
      // Poll if campaign is active to show live updates
      const campaign = query.state.data;
      if (campaign?.status === 'active') {
        return 3000;
      }
      return false;
    }
  });

  // Fetch detailed campaign analytics and insights
  const { data: analytics, isLoading: isAnalyticsLoading } = useQuery<any>({
    queryKey: ['campaign-analytics', id],
    queryFn: () => apiGet(`/api/campaigns/${id}/analytics`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="h-[500px] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-card rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4 border border-red-500/10 shadow-lg">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h2 className="text-xl font-bold">Campaign Not Found</h2>
        <Button onClick={() => router.push('/campaigns')} variant="outline" className="rounded-xl">
          Go Back to Campaigns
        </Button>
      </div>
    );
  }

  const campaign: Campaign = data;
  const messages: any[] = data.messages || [];

  // Scale metrics matching the active brand multiplier
  const scale = 
    activeBrand.id === 'aura-fashion' ? 0.72 :
    activeBrand.id === 'brew-co' ? 0.38 :
    0.59;

  // Derive brand-specific campaign details and metrics
  const brandCampaign = {
    ...campaign,
    name: (() => {
      let name = campaign.name;
      if (activeBrand.id === 'aura-fashion') {
        if (name.toLowerCase().includes('welcome')) return 'Aura VIP Welcome Launch';
        if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom') || name.toLowerCase().includes('win-back') || name.toLowerCase().includes('inactive')) return 'Ethnic Wear Fest Promo';
        if (!name.startsWith('Aura ')) return `Aura ${name}`;
      } else if (activeBrand.id === 'brew-co') {
        if (name.toLowerCase().includes('welcome')) return 'Brew & Co. Roast Club Welcome';
        if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom') || name.toLowerCase().includes('win-back') || name.toLowerCase().includes('inactive')) return 'Espresso Blend Launch';
        if (!name.startsWith('Brew & Co. ')) return `Brew & Co. ${name}`;
      } else if (activeBrand.id === 'bloom-beauty') {
        if (name.toLowerCase().includes('welcome')) return 'Bloom Rewards Welcome';
        if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom') || name.toLowerCase().includes('win-back') || name.toLowerCase().includes('inactive')) return 'Hydration Serum Promo';
        if (!name.startsWith('Bloom ')) return `Bloom ${name}`;
      }
      return name;
    })(),
    description: (() => {
      let description = campaign.description;
      let name = campaign.name;
      if (activeBrand.id === 'aura-fashion') {
        if (name.toLowerCase().includes('welcome')) return 'Send a personalized welcome code to new apparel subscribers.';
        if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom') || name.toLowerCase().includes('win-back') || name.toLowerCase().includes('inactive')) return 'Target high-value apparel shoppers with festive discount coupons.';
      } else if (activeBrand.id === 'brew-co') {
        if (name.toLowerCase().includes('welcome')) return 'Greet new rewards members with a free espresso shot voucher.';
        if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom') || name.toLowerCase().includes('win-back') || name.toLowerCase().includes('inactive')) return 'Announce our artisanal single-origin roast to coffee enthusiasts.';
      } else if (activeBrand.id === 'bloom-beauty') {
        if (name.toLowerCase().includes('welcome')) return 'Welcome skin-care lovers to our loyalty points program.';
        if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom') || name.toLowerCase().includes('win-back') || name.toLowerCase().includes('inactive')) return 'Offer a complimentary deluxe sample for skincare purchases.';
      }
      return description;
    })(),
    total_sent: Math.round(campaign.total_sent * scale),
    total_delivered: Math.round(campaign.total_delivered * scale),
    total_read: Math.round(campaign.total_read * scale),
    total_clicked: Math.round(campaign.total_clicked * scale),
    total_converted: Math.round(campaign.total_converted * scale),
  };

  const status = statusConfig[brandCampaign.status];
  const ChannelIcon = channelIcons[brandCampaign.channel] || Mail;

  // Funnel data formatting for Recharts
  const funnelData = [
    { name: 'Sent', count: brandCampaign.total_sent, fill: activeBrand.chartColor },
    { name: 'Delivered', count: brandCampaign.total_delivered, fill: `${activeBrand.chartColor}d0` },
    { name: 'Opened/Read', count: brandCampaign.total_read, fill: '#06b6d4' },
    { name: 'Clicked', count: brandCampaign.total_clicked, fill: '#10b981' },
    { name: 'Converted', count: brandCampaign.total_converted, fill: '#f59e0b' },
  ];

  const axisColor = resolvedTheme === 'dark' ? 'hsl(240, 5%, 65%)' : 'hsl(240, 10%, 40%)';
  const gridColor = resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4 animate-scale-in">
        <Button
          onClick={() => router.push('/campaigns')}
          variant="outline"
          className="w-10 h-10 p-0 border-black/[0.08] dark:border-white/[0.06] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] rounded-xl flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-foreground cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-foreground leading-none">{brandCampaign.name}</h1>
            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 rounded-full border ${status.className}`}>
              {status.label}
            </Badge>
          </div>
          <p className="text-xs text-zinc-550 dark:text-zinc-400 flex items-center gap-1.5 pt-0.5">
            <ChannelIcon className="w-3.5 h-3.5 animate-pulse" style={{ color: activeBrand.chartColor }} />
            <span className="capitalize">{brandCampaign.channel}</span>
            <span>·</span>
            <Clock className="w-3.5 h-3.5" />
            <span>Created {format(new Date(brandCampaign.created_at), 'dd MMM yyyy')}</span>
          </p>
        </div>
      </div>

      {/* KPI Cards for Campaign performance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up stagger-1">
        <Card className="glass-card rounded-2xl p-5 shadow-sm border-none">
          <CardContent className="p-0 space-y-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Delivery Rate</p>
            <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">{brandCampaign.total_sent > 0 ? ((brandCampaign.total_delivered / brandCampaign.total_sent) * 100).toFixed(1) : '0.0'}%</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{brandCampaign.total_delivered} / {brandCampaign.total_sent} messages</p>
          </CardContent>
        </Card>

        <Card className="glass-card rounded-2xl p-5 shadow-sm border-none">
          <CardContent className="p-0 space-y-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Read/Open Rate</p>
            <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">{brandCampaign.total_delivered > 0 ? ((brandCampaign.total_read / brandCampaign.total_delivered) * 100).toFixed(1) : '0.0'}%</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{brandCampaign.total_read} reads</p>
          </CardContent>
        </Card>

        <Card className="glass-card rounded-2xl p-5 shadow-sm border-none">
          <CardContent className="p-0 space-y-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Click-Through Rate</p>
            <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">{brandCampaign.total_delivered > 0 ? ((brandCampaign.total_clicked / brandCampaign.total_delivered) * 100).toFixed(1) : '0.0'}%</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{brandCampaign.total_clicked} clicks</p>
          </CardContent>
        </Card>

        <Card className="glass-card rounded-2xl p-5 shadow-sm border-none">
          <CardContent className="p-0 space-y-1">
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Conversion Rate</p>
            <p className="text-2xl font-bold font-mono text-emerald-650 dark:text-emerald-400">{brandCampaign.total_delivered > 0 ? ((brandCampaign.total_converted / brandCampaign.total_delivered) * 100).toFixed(1) : '0.0'}%</p>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{brandCampaign.total_converted} conversions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recharts Funnel visualization */}
        <div className="glass-card rounded-3xl p-6 lg:col-span-2 flex flex-col justify-between min-h-[350px] animate-fade-in-up stagger-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4" style={{ color: activeBrand.chartColor }} /> Delivery & Engagement Funnel
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-4">Visual conversion rates for each step in this campaign.</p>
          </div>

          <div className="flex-1 w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis type="number" stroke={axisColor} fontSize={11} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke={axisColor} fontSize={11} tickLine={false} width={80} />
                <Tooltip
                  contentStyle={{
                    background: resolvedTheme === 'dark' ? '#09090b' : '#ffffff',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    color: resolvedTheme === 'dark' ? '#ffffff' : '#09090b',
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Message Template & Campaign Detail Info */}
        <div className="glass-card rounded-3xl p-6 flex flex-col gap-4 animate-fade-in-up stagger-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Info className="w-4 h-4" style={{ color: activeBrand.chartColor }} /> Campaign Template
          </h3>

          <div className="space-y-3 flex-1 flex flex-col justify-between">
            {brandCampaign.subject_line && (
              <div className="p-3 rounded-xl border border-black/[0.06] dark:border-white/[0.04] bg-black/[0.01] dark:bg-white/[0.01] text-xs">
                <span className="text-zinc-500 dark:text-zinc-400 font-semibold block mb-0.5">Subject Line</span>
                <span className="text-foreground font-medium">{brandCampaign.subject_line}</span>
              </div>
            )}

            <div className="p-4 rounded-xl border border-black/[0.06] dark:border-white/[0.04] bg-black/[0.01] dark:bg-white/[0.01] text-xs flex-1">
              <span className="text-zinc-500 dark:text-zinc-400 font-semibold block mb-1">Body Template</span>
              <pre className="text-foreground leading-relaxed font-sans whitespace-pre-wrap">{brandCampaign.message_template}</pre>
            </div>
            
            <div className="pt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 border-t border-black/[0.06] dark:border-white/[0.04]">
              <span>Launched at:</span>
              <span className="text-foreground font-medium">
                {brandCampaign.launched_at ? format(new Date(brandCampaign.launched_at), 'dd MMM yyyy HH:mm') : 'Draft'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Message logs list */}
      <div className="glass-card rounded-3xl overflow-hidden shadow-sm animate-fade-in-up stagger-4">
        <div className="p-6 border-b border-black/[0.06] dark:border-white/[0.04]">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
            <Users className="w-4 h-4" style={{ color: activeBrand.chartColor }} /> Dispatch Delivery Log
          </h3>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-black/[0.01] dark:bg-white/[0.01] border-b border-black/[0.06] dark:border-white/[0.04]">
              <TableRow className="hover:bg-transparent border-black/[0.06] dark:border-white/[0.04]">
                <TableHead className="py-4 px-6 font-semibold text-zinc-500 dark:text-zinc-400 text-xs">Recipient ID</TableHead>
                <TableHead className="py-4 px-6 font-semibold text-zinc-500 dark:text-zinc-400 text-xs">Name</TableHead>
                <TableHead className="py-4 px-6 font-semibold text-zinc-500 dark:text-zinc-400 text-xs">Status</TableHead>
                <TableHead className="py-4 px-6 font-semibold text-zinc-500 dark:text-zinc-400 text-xs">Sent At</TableHead>
                <TableHead className="py-4 px-6 font-semibold text-zinc-500 dark:text-zinc-400 text-xs">Delivered At</TableHead>
                <TableHead className="py-4 px-6 font-semibold text-zinc-500 dark:text-zinc-400 text-xs">Error Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.map((msg) => (
                <TableRow key={msg.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.02] border-black/[0.06] dark:border-white/[0.04]">
                  <TableCell className="py-3.5 px-6 font-mono text-xs text-zinc-500 dark:text-zinc-400">{msg.id.slice(0, 8)}...</TableCell>
                  <TableCell className="py-3.5 px-6 text-xs font-semibold text-foreground">{msg.customer_name || 'Shopper'}</TableCell>
                  <TableCell className="py-3.5 px-6 text-xs">
                    <Badge
                      variant="outline"
                      className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                        msg.status === 'failed'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : msg.status === 'converted'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : msg.status === 'read' || msg.status === 'clicked'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      }`}
                    >
                      {msg.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3.5 px-6 text-xs text-zinc-500 dark:text-zinc-400">
                    {msg.sent_at ? format(new Date(msg.sent_at), 'dd MMM HH:mm:ss') : '-'}
                  </TableCell>
                  <TableCell className="py-3.5 px-6 text-xs text-zinc-500 dark:text-zinc-400">
                    {msg.delivered_at ? format(new Date(msg.delivered_at), 'dd MMM HH:mm:ss') : '-'}
                  </TableCell>
                  <TableCell className="py-3.5 px-6 text-xs text-red-400 font-medium">
                    {msg.failure_reason || '-'}
                  </TableCell>
                </TableRow>
              ))}
              {messages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-xs text-zinc-500 dark:text-zinc-400">
                    No message deliveries registered. Launch this campaign to dispatch!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
