'use client';

import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useBrand } from '@/context/BrandContext';

interface KPICardProps {
  title: string;
  value: string | number;
  change: number;
  icon: LucideIcon;
  prefix?: string;
  suffix?: string;
  loading?: boolean;
  index?: number;
}

export function KPICard({
  title,
  value,
  change,
  icon: Icon,
  prefix = '',
  suffix = '',
  loading = false,
  index = 0,
}: KPICardProps) {
  const isPositive = change >= 0;
  const { activeBrand } = useBrand();

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 animate-shimmer">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="h-4 w-24 bg-white/[0.06] rounded-lg" />
            <div className="h-8 w-32 bg-white/[0.06] rounded-lg" />
            <div className="h-3 w-20 bg-white/[0.06] rounded-lg" />
          </div>
          <div className="h-12 w-12 bg-white/[0.06] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-2xl p-6 transition-all duration-300 hover:scale-[1.01] hover:border-primary/25 cursor-default opacity-0 animate-fade-in-up group',
        `stagger-${index + 1}`
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-foreground font-mono">
            {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
          </p>
          <div className="flex items-center gap-1.5 pt-1">
            {isPositive ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-red-400" />
            )}
            <span
              className={cn(
                'text-xs font-semibold',
                isPositive ? 'text-emerald-400' : 'text-red-400'
              )}
            >
              {isPositive ? '+' : ''}{change.toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">vs last month</span>
          </div>
        </div>
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-all duration-300">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      </div>
    </div>
  );
}
