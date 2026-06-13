'use client';

import { Campaign } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Mail, MessageSquare, Bell, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { useBrand } from '@/context/BrandContext';

const statusConfig = {
  draft: { label: 'Draft', className: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  active: { label: 'Active', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse' },
  completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageSquare, // fallback
  push: Bell,
};

interface RecentCampaignsProps {
  campaigns: Campaign[];
  loading?: boolean;
}

export function RecentCampaigns({ campaigns, loading }: RecentCampaignsProps) {
  const { activeBrand } = useBrand();

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Campaigns</h3>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-black/[0.01] dark:bg-white/[0.02]">
              <div className="w-9 h-9 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] animate-shimmer" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 bg-black/[0.04] dark:bg-white/[0.06] rounded animate-shimmer" />
                <div className="h-3 w-24 bg-black/[0.04] dark:bg-white/[0.06] rounded animate-shimmer" />
              </div>
              <div className="h-5 w-16 bg-black/[0.04] dark:bg-white/[0.06] rounded-full animate-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 animate-fade-in-up stagger-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Recent Campaigns</h3>
        <Link
          href="/campaigns"
          className="text-xs text-primary hover:text-primary/80 transition-colors font-semibold"
        >
          View all →
        </Link>
      </div>
      <div className="space-y-2">
        {campaigns.slice(0, 5).map((campaign) => {
          const status = statusConfig[campaign.status] || statusConfig.draft;
          const ChannelIcon = channelIcons[campaign.channel] || Mail;
          const deliveryRate = campaign.total_sent > 0
            ? ((campaign.total_delivered / campaign.total_sent) * 100).toFixed(0)
            : '0';

          return (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-all duration-200 group border border-transparent hover:border-border"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-all">
                <ChannelIcon className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-primary dark:group-hover:text-white transition-colors">
                  {campaign.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {campaign.created_at ? formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true }) : 'Recently'}
                  <span>·</span>
                  <span>{deliveryRate}% delivered</span>
                </div>
              </div>
              <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5 rounded-full border font-semibold', status.className)}>
                {status.label}
              </Badge>
            </Link>
          );
        })}
        {campaigns.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No campaigns yet. Create one with AI Copilot!
          </p>
        )}
      </div>
    </div>
  );
}
