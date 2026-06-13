'use client';

import { Sparkles, TrendingUp, Users, Target } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useBrand } from '@/context/BrandContext';
import { cn } from '@/lib/utils';

interface AIInsightsProps {
  loading?: boolean;
}

export function AIInsights({ loading }: AIInsightsProps) {
  const { activeBrand } = useBrand();

  const getInsights = () => {
    if (activeBrand.id === 'aura-fashion') {
      return [
        {
          icon: Users,
          title: 'High-Value Apparel Cohort',
          description: 'Fashion shoppers in Delhi with >₹10K LTV are 3.2x more likely to purchase Western Wear.',
          action: 'Explore Segment',
          href: '/copilot',
          color: 'from-indigo-500/10 to-indigo-600/10 text-indigo-400 border-indigo-500/20',
        },
        {
          icon: TrendingUp,
          title: 'Optimal Send Time',
          description: 'Your fashion alerts perform 47% better when sent on Thursday evenings before weekends.',
          action: 'Apply Insight',
          href: '/copilot',
          color: 'from-indigo-400/10 to-indigo-500/10 text-indigo-400 border-indigo-500/20',
        },
        {
          icon: Target,
          title: 'Ethnic Wear Recovery',
          description: '156 customers haven\'t purchased in 90+ days. A targeted ethnic wear SMS could recover ₹2.3L.',
          action: 'Create Campaign',
          href: '/copilot',
          color: 'from-emerald-500/10 to-emerald-600/10 text-emerald-400 border-emerald-500/20',
        }
      ];
    } else if (activeBrand.id === 'brew-co') {
      return [
        {
          icon: Users,
          title: 'Loyal Bean Subscribers',
          description: 'Coffee lovers in Bangalore with >₹5K spend are 4.5x more likely to buy monthly bean bags.',
          action: 'Explore Segment',
          href: '/copilot',
          color: 'from-amber-500/10 to-amber-600/10 text-amber-400 border-amber-500/20',
        },
        {
          icon: TrendingUp,
          title: 'Morning Send Time',
          description: 'Brew promotions perform 65% better when sent between 7 AM - 9 AM on weekdays.',
          action: 'Apply Insight',
          href: '/copilot',
          color: 'from-amber-400/10 to-amber-500/10 text-amber-400 border-amber-500/20',
        },
        {
          icon: Target,
          title: 'Dormant Coffee Drinkers',
          description: '89 members haven\'t ordered a blend in 45+ days. A WhatsApp coupon could generate 300+ orders.',
          action: 'Create Campaign',
          href: '/copilot',
          color: 'from-emerald-500/10 to-emerald-600/10 text-emerald-400 border-emerald-500/20',
        }
      ];
    } else { // bloom-beauty
      return [
        {
          icon: Users,
          title: 'Skincare VIP Cohort',
          description: 'Beauty shoppers in Mumbai with >₹8K LTV are 3.8x more likely to purchase facial serums.',
          action: 'Explore Segment',
          href: '/copilot',
          color: 'from-rose-500/10 to-rose-600/10 text-rose-400 border-rose-500/20',
        },
        {
          icon: TrendingUp,
          title: 'Self-Care Sunday Send Time',
          description: 'Beauty alerts perform 52% better when sent Sunday mornings during weekly self-care routines.',
          action: 'Apply Insight',
          href: '/copilot',
          color: 'from-rose-400/10 to-rose-500/10 text-rose-400 border-rose-500/20',
        },
        {
          icon: Target,
          title: 'Cosmetics Replenishment Alert',
          description: '124 VIPs are due to replenish their beauty kits. A personalized email could recover ₹1.8L.',
          action: 'Create Campaign',
          href: '/copilot',
          color: 'from-emerald-500/10 to-emerald-600/10 text-emerald-400 border-emerald-500/20',
        }
      ];
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="text-lg font-semibold mb-4">AI Insights</h3>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-4 rounded-xl bg-black/[0.01] dark:bg-white/[0.02] animate-shimmer">
              <div className="h-4 w-48 bg-black/[0.04] dark:bg-white/[0.06] rounded mb-2" />
              <div className="h-3 w-full bg-black/[0.04] dark:bg-white/[0.06] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const insights = getInsights();

  return (
    <div className="bg-card border border-border rounded-2xl p-6 animate-fade-in-up stagger-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">AI Insights</h3>
        <span className={cn(
          "px-2 py-0.5 text-[10px] font-bold rounded-full border",
          activeBrand.badgeClass
        )}>
          LIVE
        </span>
      </div>
      <div className="space-y-3">
        {insights.map((insight, i) => {
          const Icon = insight.icon;
          return (
            <div
              key={i}
              className="group p-4 rounded-xl bg-black/[0.01] dark:bg-white/[0.02] hover:bg-black/[0.02] dark:hover:bg-white/[0.04] border border-border transition-all duration-300"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0 border",
                    insight.color
                  )}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground mb-1">
                    {insight.title}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {insight.description}
                  </p>
                  <Link href={insight.href}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-7 px-3 text-xs text-primary hover:text-primary/80 hover:bg-primary/10 rounded-lg"
                    >
                      {insight.action} →
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
