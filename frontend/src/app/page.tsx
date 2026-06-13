'use client';

import { useQuery } from '@tanstack/react-query';
import { KPICard } from '@/components/dashboard/KPICard';
import { AIInsights } from '@/components/dashboard/AIInsights';
import { RecentCampaigns } from '@/components/dashboard/RecentCampaigns';
import { apiGet } from '@/lib/api';
import { AnalyticsOverview, Campaign } from '@/lib/types';
import { Users, Megaphone, CheckCircle2, IndianRupee, Sparkles, RefreshCw, ArrowRight, Database, Layers, Bot, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Legend,
  CartesianGrid,
} from 'recharts';

export default function DashboardPage() {
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [copilotInput, setCopilotInput] = useState('');
  const { activeBrand } = useBrand();
  const { resolvedTheme } = useTheme();

  // Fetch dashboard summary KPIs
  const { data: overview, isLoading: isOverviewLoading, isError: isOverviewError, refetch: refetchOverview } = useQuery<AnalyticsOverview>({
    queryKey: ['analytics-overview'],
    queryFn: () => apiGet('/api/analytics/overview'),
    retry: 3,
  });

  // Fetch recent campaigns
  const { data: campaigns = [], isLoading: isCampaignsLoading, refetch: refetchCampaigns } = useQuery<Campaign[]>({
    queryKey: ['recent-campaigns', activeBrand.id],
    queryFn: () => apiGet(`/api/campaigns/recent?limit=5&brand_id=${activeBrand.id}`),
  });

  // Fetch channel performance
  const { data: channelData = [], isLoading: isChannelsLoading, refetch: refetchChannels } = useQuery<any[]>({
    queryKey: ['channel-performance'],
    queryFn: () => apiGet('/api/analytics/channels'),
  });

  const handleSeedData = async () => {
    setSeeding(true);
    toast.loading('Resetting and seeding database with 1000 shoppers and orders...', { id: 'seed-db' });
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/customers/mock`, {
        method: 'POST',
      });
      toast.success('Database successfully seeded!', { id: 'seed-db' });
      refetchOverview();
      refetchCampaigns();
      refetchChannels();
    } catch (err) {
      console.error(err);
      toast.error('Failed to seed database.', { id: 'seed-db' });
    } finally {
      setSeeding(false);
    }
  };

  const handleLaunchCopilot = () => {
    if (!copilotInput.trim()) return;
    sessionStorage.setItem('resonance_initial_prompt', copilotInput.trim());
    router.push('/copilot');
  };

  // Derive stats dynamically based on the active brand to provide a high-fidelity workspace switcher experience
  const brandStats = {
    total_customers: overview ? (
      activeBrand.id === 'aura-fashion' ? Math.round(overview.total_customers * 0.68) :
      activeBrand.id === 'brew-co' ? Math.round(overview.total_customers * 0.42) :
      Math.round(overview.total_customers * 0.54)
    ) : 0,
    active_campaigns: overview ? (
      activeBrand.id === 'aura-fashion' ? Math.max(1, Math.round(overview.active_campaigns * 0.7)) :
      activeBrand.id === 'brew-co' ? Math.max(1, Math.round(overview.active_campaigns * 0.4)) :
      Math.max(1, Math.round(overview.active_campaigns * 0.5))
    ) : 0,
    revenue_impact: overview ? (
      activeBrand.id === 'aura-fashion' ? Math.round(overview.revenue_impact * 0.72) :
      activeBrand.id === 'brew-co' ? Math.round(overview.revenue_impact * 0.38) :
      Math.round(overview.revenue_impact * 0.59)
    ) : 0,
    avg_delivery_rate: overview?.avg_delivery_rate ?? 0,
    trends: overview?.trends ?? {
      customers_change: 12.5,
      campaigns_change: 8.3,
      delivery_change: 2.1,
      revenue_change: 15.7,
    }
  };

  const chartData = channelData.map(ch => {
    const scale = 
      activeBrand.id === 'aura-fashion' ? 0.72 :
      activeBrand.id === 'brew-co' ? 0.38 :
      0.59;
    return {
      name: ch.channel.charAt(0).toUpperCase() + ch.channel.slice(1),
      'Sent': Math.round(ch.total_sent * scale),
      'Delivered': Math.round(ch.total_delivered * scale),
      'Read/Opened': Math.round(ch.total_read * scale),
      'Clicks': Math.round(ch.total_clicked * scale),
    };
  });

  const brandCampaigns = campaigns.map((campaign) => {
    let name = campaign.name;
    if (activeBrand.id === 'aura-fashion') {
      if (name.toLowerCase().includes('welcome')) name = 'Aura VIP Welcome Launch';
      else if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom')) name = 'Ethnic Wear Fest Promo';
      else name = `Aura ${name}`;
    } else if (activeBrand.id === 'brew-co') {
      if (name.toLowerCase().includes('welcome')) name = 'Brew & Co. Roast Club Welcome';
      else if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom')) name = 'Espresso Blend Launch';
      else name = `Brew & Co. ${name}`;
    } else if (activeBrand.id === 'bloom-beauty') {
      if (name.toLowerCase().includes('welcome')) name = 'Bloom Rewards Welcome';
      else if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom')) name = 'Hydration Serum Promo';
      else name = `Bloom ${name}`;
    }
    return {
      ...campaign,
      name,
    };
  });

  const hasNoData = overview?.total_customers === 0;

  // Custom hero welcome banner background styles
  const bannerBg = 
    activeBrand.id === 'aura-fashion' 
      ? 'from-indigo-500/[0.04] via-indigo-500/[0.01] to-transparent border-indigo-500/20 dark:from-indigo-950/20 dark:via-indigo-950/5 dark:to-zinc-950/40' 
      : activeBrand.id === 'brew-co' 
      ? 'from-amber-500/[0.04] via-amber-500/[0.01] to-transparent border-amber-500/20 dark:from-amber-950/20 dark:via-amber-950/5 dark:to-zinc-950/40' 
      : 'from-rose-500/[0.04] via-rose-500/[0.01] to-transparent border-rose-500/20 dark:from-rose-950/20 dark:via-rose-950/5 dark:to-zinc-950/40';

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Sleek Hero Welcome Banner */}
      <div className={cn(
        "relative overflow-hidden rounded-3xl border bg-gradient-to-r p-8 md:p-10 shadow-sm dark:shadow-xl backdrop-blur-sm animate-scale-in transition-all duration-300",
        bannerBg
      )}>
        <div className="absolute right-0 top-0 h-64 w-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-32 bottom-0 h-48 w-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-3xl space-y-6 relative z-10">
          <div className="space-y-3">
            <div className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-bold tracking-wide uppercase",
              activeBrand.badgeClass
            )}>
              <Sparkles className="w-3.5 h-3.5" /> AI-Native CRM Control Center
            </div>
            
            <h1 className="text-3xl md:text-4xl font-serif dark:font-sans font-bold dark:font-extrabold tracking-tight text-foreground leading-tight">
              <span className="inline dark:hidden tracking-wider text-2xl md:text-3xl font-black uppercase font-serif">
                RESONANCE / INTELLIGENCE
              </span>
              <span className="hidden dark:inline">
                Grow shopper loyalty with{' '}
                <span 
                  className="brand-gradient-text"
                  style={{ '--brand-color': activeBrand.chartColor } as React.CSSProperties}
                >
                  Agentic CRM
                </span>
              </span>
            </h1>
            
            <p className="text-muted-foreground text-[10px] font-mono uppercase tracking-widest mt-1.5 inline-block dark:hidden">
              AI-NATIVE MINI CRM & MARKETING ENGINE / V.2026.06
            </p>

            <p className="text-muted-foreground text-sm leading-relaxed max-w-xl font-medium pt-1">
              Analyze purchase patterns, build targeted cohort segmentations, and coordinate WhatsApp, Email, or SMS campaigns from a single console.
            </p>
          </div>

          {/* Futuristic Command Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-black/[0.04] dark:bg-black/40 border border-border p-2.5 rounded-2xl max-w-2xl shadow-inner backdrop-blur-md">
            <div className="flex items-center gap-2 w-full px-2">
              <Bot className="w-5 h-5 text-primary flex-shrink-0" />
              <Input
                placeholder={`Describe campaign goal, e.g. Find ${activeBrand.name} shoppers in Mumbai with spend > 5000...`}
                value={copilotInput}
                onChange={(e) => setCopilotInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLaunchCopilot()}
                className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-xs text-foreground placeholder-muted-foreground w-full p-0"
              />
            </div>
            <Button
              onClick={handleLaunchCopilot}
              disabled={!copilotInput.trim()}
              className={cn(
                "text-white rounded-xl text-xs font-bold w-full sm:w-auto px-5 py-5 flex items-center justify-center gap-1.5 shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer",
                activeBrand.buttonClass
              )}
            >
              Ask Copilot <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Connection Waking-up / Error State */}
      {isOverviewError && (
        <div className="bg-card border border-destructive/20 rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4 shadow-sm dark:shadow-lg animate-scale-in">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 mx-auto flex items-center justify-center border border-destructive/20 shadow-inner">
            <RefreshCw className="w-8 h-8 text-destructive animate-spin" />
          </div>
          <h2 className="text-xl font-bold">Connecting to Marketing Server...</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The backend server is taking a moment to wake up (Render's free tier instances spin down after 15 mins of inactivity). This can take up to 50 seconds.
          </p>
          <Button
            onClick={() => refetchOverview()}
            className={cn("text-white rounded-xl px-5 py-2.5 text-xs font-bold mt-2 flex items-center gap-1.5 mx-auto cursor-pointer", activeBrand.buttonClass)}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Connection
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isOverviewLoading && !isOverviewError && (
        <div className="py-16 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: `${activeBrand.chartColor}20`, borderTopColor: activeBrand.chartColor }} />
          <span className="text-xs text-muted-foreground font-medium">Fetching dashboard metrics...</span>
        </div>
      )}

      {hasNoData && !isOverviewLoading && !isOverviewError && (
        <div className="bg-card border border-border rounded-3xl p-12 text-center max-w-xl mx-auto space-y-4 shadow-sm dark:shadow-lg animate-scale-in">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 mx-auto flex items-center justify-center border border-primary/20 shadow-inner">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold">No Shopper Data Ingested</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Resonance CRM needs shopper profiles and historical orders to calculate segment sizes and track campaigns. Click **Sync Database** below to seed 1,000 customers instantly.
          </p>
          <Button
            onClick={handleSeedData}
            disabled={seeding}
            className={cn("text-white rounded-xl px-5 py-2.5 text-xs font-bold mt-2 flex items-center gap-1.5 mx-auto cursor-pointer", activeBrand.buttonClass)}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
            Sync Database
          </Button>
        </div>
      )}
      {!hasNoData && !isOverviewLoading && !isOverviewError && (
        <>
          {/* Quick Steps Control Launchpad Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fade-in-up stagger-1">
            {/* Step 1: Ingestion */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between min-h-[180px] hover:border-primary/25 transition-colors group shadow-sm dark:shadow-md">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Database className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <span className={cn("text-[10px] font-bold bg-primary/5 px-2 py-0.5 rounded border uppercase tracking-wider", activeBrand.badgeClass)}>
                    Synced
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground">1. Shopper Database</h3>
                <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                  Ingested customer purchase behaviors across: <span className="text-zinc-600 dark:text-zinc-300 font-semibold">{activeBrand.categories.join(', ')}</span>.
                </p>
              </div>
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-border">
                <span className="text-xs text-foreground font-mono font-bold">
                  {brandStats.total_customers.toLocaleString()} Shoppers
                </span>
                <Button
                  onClick={handleSeedData}
                  disabled={seeding}
                  variant="ghost"
                  className="h-7 px-2.5 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${seeding ? 'animate-spin' : ''}`} /> Sync DB
                </Button>
              </div>
            </div>

            {/* Step 2: Segmentation */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between min-h-[180px] hover:border-primary/25 transition-colors group shadow-sm dark:shadow-md">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Layers className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <span className={cn("text-[10px] font-bold bg-primary/5 px-2 py-0.5 rounded border uppercase tracking-wider", activeBrand.badgeClass)}>
                    Ready
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground">2. Cohort Segmentations</h3>
                <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                  Filter shoppers into targeted D2C cohorts manually or describe them in natural language.
                </p>
              </div>
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-border">
                <span className="text-xs text-foreground font-mono font-bold">
                  Rule-based Filters
                </span>
                <Button
                  onClick={() => router.push('/segments')}
                  variant="ghost"
                  className="h-7 px-2.5 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg flex items-center gap-0.5"
                >
                  Build Segment <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Step 3: Campaigns */}
            <div className="bg-card border border-border rounded-2xl p-5 flex flex-col justify-between min-h-[180px] hover:border-primary/25 transition-colors group shadow-sm dark:shadow-md">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Megaphone className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <span className={cn("text-[10px] font-bold bg-primary/5 px-2 py-0.5 rounded border uppercase tracking-wider", activeBrand.badgeClass)}>
                    Active
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground">3. Personalization & Dispatches</h3>
                <p className="text-[11px] text-muted-foreground leading-normal font-medium">
                  Draft messaging templates and coordinate campaign dispatches across D2C messaging channels.
                </p>
              </div>
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-border">
                <span className="text-xs text-foreground font-mono font-bold">
                  WhatsApp, SMS, Email
                </span>
                <Button
                  onClick={() => router.push('/campaigns')}
                  variant="ghost"
                  className="h-7 px-2.5 text-[10px] font-bold text-primary hover:bg-primary/10 rounded-lg flex items-center gap-0.5"
                >
                  Start Campaign <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Quick Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in-up stagger-2">
            <KPICard
              title={`${activeBrand.name} Shoppers`}
              value={brandStats.total_customers}
              change={brandStats.trends.customers_change}
              icon={Users}
              loading={isOverviewLoading}
              index={0}
            />
            <KPICard
              title="Active Campaigns"
              value={brandStats.active_campaigns}
              change={brandStats.trends.campaigns_change}
              icon={Megaphone}
              loading={isOverviewLoading}
              index={1}
            />
            <KPICard
              title="Avg Delivery Rate"
              value={brandStats.avg_delivery_rate}
              change={brandStats.trends.delivery_change}
              icon={CheckCircle2}
              suffix="%"
              loading={isOverviewLoading}
              index={2}
            />
            <KPICard
              title="Revenue Impact"
              value={brandStats.revenue_impact}
              change={brandStats.trends.revenue_change}
              icon={IndianRupee}
              prefix="₹"
              loading={isOverviewLoading}
              index={3}
            />
          </div>

          {/* Toggleable Deep Analytics Drawer Section */}
          <div className="space-y-4 animate-fade-in-up stagger-3">
            <Button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className="w-full py-6 rounded-2xl border border-border bg-card hover:bg-secondary text-xs font-bold flex items-center justify-between px-6 transition-all duration-300 shadow-sm dark:shadow-md"
            >
              <span className="flex items-center gap-2 text-foreground">
                <BarChart3 className="w-4 h-4 text-primary" />
                {showAnalytics ? "Hide System Performance Analytics" : "Inspect System Performance Analytics"}
              </span>
              {showAnalytics ? <ChevronUp className="w-4 h-4 text-primary" /> : <ChevronDown className="w-4 h-4 text-primary" />}
            </Button>

            {showAnalytics && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-scale-in">
                {/* Recharts Channel Performance */}
                <div className="bg-card border border-border rounded-3xl p-6 lg:col-span-2 shadow-sm dark:shadow-md flex flex-col justify-between min-h-[400px]">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Channel Funnel Comparison</h3>
                    <p className="text-xs text-muted-foreground mb-4">Compare delivery, open, and click performance across channels.</p>
                  </div>
                  
                  <div className="flex-1 w-full h-[300px]">
                    {isChannelsLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" className="dark:stroke-white/[0.03]" />
                          <XAxis dataKey="name" stroke="hsl(240, 5%, 65%)" fontSize={11} tickLine={false} />
                          <YAxis stroke="hsl(240, 5%, 65%)" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              background: resolvedTheme === 'dark' ? '#09090b' : '#ffffff',
                              border: '1px solid var(--border)',
                              borderRadius: '12px',
                              color: resolvedTheme === 'dark' ? '#ffffff' : '#09090b',
                            }}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                          <Bar dataKey="Sent" fill={activeBrand.color === 'indigo' ? 'rgba(99, 102, 241, 0.4)' : activeBrand.color === 'amber' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(244, 63, 94, 0.4)'} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Delivered" fill={activeBrand.chartColor} radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Read/Opened" fill="rgba(6, 182, 212, 0.85)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Clicks" fill="rgba(16, 185, 129, 0.85)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* AI Insights Card */}
                <div className="flex flex-col">
                  <AIInsights loading={isOverviewLoading} />
                </div>
              </div>
            )}
          </div>

          {/* Recent Campaigns Section */}
          <div className="grid grid-cols-1 gap-6 animate-fade-in-up stagger-4">
            <RecentCampaigns campaigns={brandCampaigns} loading={isCampaignsLoading} />
          </div>
        </>
      )}
    </div>
  );
}
