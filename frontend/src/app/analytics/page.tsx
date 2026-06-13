'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { BarChart3, LineChart, PieChart, Users, CheckCircle2, IndianRupee, Megaphone } from 'lucide-react';
import { useBrand } from '@/context/BrandContext';
import { useTheme } from 'next-themes';

export default function AnalyticsPage() {
  const { activeBrand } = useBrand();
  const { resolvedTheme } = useTheme();

  // Fetch overview
  const { data: overview, isLoading: isOverviewLoading } = useQuery<any>({
    queryKey: ['analytics-overview'],
    queryFn: () => apiGet('/api/analytics/overview'),
  });

  // Fetch campaign trends
  const { data: trends = [], isLoading: isTrendsLoading } = useQuery<any[]>({
    queryKey: ['analytics-trends', activeBrand.id],
    queryFn: () => apiGet(`/api/analytics/trends?days=30&brand_id=${activeBrand.id}`),
  });

  // Fetch segments summary
  const { data: segmentSummary, isLoading: isSegmentsLoading } = useQuery<any>({
    queryKey: ['analytics-segments-summary'],
    queryFn: () => apiGet('/api/analytics/segments'),
  });

  // Calculate scaled metrics matching dashboard brand parameters
  const scaledStats = {
    total_campaigns: overview ? Math.round(overview.total_campaigns * (
      activeBrand.id === 'aura-fashion' ? 0.7 :
      activeBrand.id === 'brew-co' ? 0.4 :
      0.5
    )) : 0,
    completed_campaigns: overview ? Math.round(overview.completed_campaigns * (
      activeBrand.id === 'aura-fashion' ? 0.7 :
      activeBrand.id === 'brew-co' ? 0.4 :
      0.5
    )) : 0,
    total_messages_sent: overview ? Math.round(overview.total_messages_sent * (
      activeBrand.id === 'aura-fashion' ? 0.68 :
      activeBrand.id === 'brew-co' ? 0.42 :
      0.54
    )) : 0,
    revenue_impact: overview ? Math.round(overview.revenue_impact * (
      activeBrand.id === 'aura-fashion' ? 0.72 :
      activeBrand.id === 'brew-co' ? 0.38 :
      0.59
    )) : 0,
    avg_open_rate: overview?.avg_open_rate ?? 0,
  };

  const scale = 
    activeBrand.id === 'aura-fashion' ? 0.72 :
    activeBrand.id === 'brew-co' ? 0.38 :
    0.59;

  const trendData = trends.map(t => ({
    date: t.date ? new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Date',
    'Sent': Math.round(t.sent * scale),
    'Delivered': Math.round(t.delivered * scale),
    'Read': Math.round(t.read * scale),
  }));

  const segmentData = segmentSummary?.segments.map((s: any) => ({
    name: s.name,
    'Shoppers': Math.round(s.count * (
      activeBrand.id === 'aura-fashion' ? 0.68 :
      activeBrand.id === 'brew-co' ? 0.42 :
      0.54
    )),
    'Percentage': s.percentage,
  })) || [];

  const axisColor = resolvedTheme === 'dark' ? 'hsl(240, 5%, 65%)' : 'hsl(240, 10%, 40%)';
  const gridColor = resolvedTheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)';

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-scale-in">
        <div className="glass-card rounded-2xl p-5 space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">Total Campaigns Run</p>
          <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">{scaledStats.total_campaigns}</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">{scaledStats.completed_campaigns} completed</p>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">Total Dispatches Sent</p>
          <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">{scaledStats.total_messages_sent.toLocaleString()}</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Across WhatsApp, SMS, Email</p>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">Avg Engagement Rate</p>
          <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-50">{scaledStats.avg_open_rate}%</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Message open/read ratios</p>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">Total Campaign ROI</p>
          <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">₹{scaledStats.revenue_impact.toLocaleString()}</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Attributed purchase value</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaign activity trends over time */}
        <div className="glass-card rounded-3xl p-6 shadow-md flex flex-col justify-between min-h-[380px] animate-fade-in-up stagger-1">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <LineChart className="w-4 h-4" style={{ color: activeBrand.chartColor }} /> Campaign Activity Trend (30 Days)
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-4">Total messages dispatched, delivered and read daily.</p>
          </div>

          <div className="flex-1 w-full h-[250px]">
            {isTrendsLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
              </div>
            ) : trends.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
                No campaign data found in past 30 days. Seed the database to load records.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={activeBrand.chartColor} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={activeBrand.chartColor} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRead" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="date" stroke={axisColor} fontSize={11} tickLine={false} />
                  <YAxis stroke={axisColor} fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: resolvedTheme === 'dark' ? '#09090b' : '#ffffff',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      color: resolvedTheme === 'dark' ? '#ffffff' : '#09090b',
                    }}
                  />
                  <Legend 
                    iconType="circle" 
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                    formatter={(value) => <span className="text-zinc-800 dark:text-zinc-200 font-medium">{value}</span>}
                  />
                  <Area type="monotone" dataKey="Sent" stroke={activeBrand.chartColor} fillOpacity={1} fill="url(#colorSent)" />
                  <Area type="monotone" dataKey="Read" stroke="#06b6d4" fillOpacity={1} fill="url(#colorRead)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Segments size distribution */}
        <div className="glass-card rounded-3xl p-6 shadow-md flex flex-col justify-between min-h-[380px] animate-fade-in-up stagger-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
              <PieChart className="w-4 h-4" style={{ color: activeBrand.chartColor }} /> Segment Size Distribution
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-4">Compare relative sizes of customer segments in the database.</p>
          </div>

          <div className="flex-1 w-full h-[250px]">
            {isSegmentsLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
              </div>
            ) : segmentData.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
                No segments found in the database.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={segmentData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                  <XAxis dataKey="name" stroke={axisColor} fontSize={10} tickLine={false} />
                  <YAxis stroke={axisColor} fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: resolvedTheme === 'dark' ? '#09090b' : '#ffffff',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      color: resolvedTheme === 'dark' ? '#ffffff' : '#09090b',
                    }}
                  />
                  <Bar dataKey="Shoppers" fill={activeBrand.chartColor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
