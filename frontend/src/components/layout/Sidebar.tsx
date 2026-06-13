'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  Bot,
  Megaphone,
  Users,
  Layers,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Shirt,
  Coffee,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBrand, BRANDS } from '@/context/BrandContext';

const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'AI Copilot', href: '/copilot', icon: Bot },
  { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { label: 'Customers', href: '/customers', icon: Users },
  { label: 'Segments', href: '/segments', icon: Layers },
  { label: 'Analytics', href: '/analytics', icon: BarChart3 },
];

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed }: SidebarProps) {
  const pathname = usePathname();
  const { activeBrand, setActiveBrand } = useBrand();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isExpanded = !collapsed || isHovered;

  // Close dropdown on clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsDropdownOpen(false);
      }}
      className={cn(
        'fixed left-0 top-0 z-40 h-screen flex flex-col border-r transition-all duration-300 ease-in-out backdrop-blur-xl',
        'bg-background/40 border-border shadow-2xl',
        collapsed && !isHovered ? 'w-[68px]' : 'w-[240px]'
      )}
    >
      {/* Workspace Switcher */}
      <div className="flex items-center justify-between px-3.5 h-16 border-b border-white/[0.06] flex-shrink-0 relative z-30">
        {/* Compact Logo Icon */}
        <div className={cn(
          "absolute inset-0 flex items-center justify-center transition-all duration-300",
          isExpanded ? "opacity-0 scale-90 pointer-events-none" : "opacity-100 scale-100"
        )}>
          <button
            onClick={() => setCollapsed(false)}
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center border border-white/[0.06] transition-all duration-200 hover:bg-white/[0.06] cursor-pointer",
              activeBrand.color === 'indigo' ? 'text-indigo-400 bg-indigo-500/5' :
              activeBrand.color === 'amber' ? 'text-amber-400 bg-amber-500/5' :
              'text-rose-400 bg-rose-500/5'
            )}
            title={`Active: ${activeBrand.name}`}
          >
            {activeBrand.id === 'aura-fashion' && <Shirt className="w-5 h-5" />}
            {activeBrand.id === 'brew-co' && <Coffee className="w-5 h-5" />}
            {activeBrand.id === 'bloom-beauty' && <Sparkles className="w-5 h-5" />}
          </button>
        </div>

        {/* Full Workspace Dropdown Selector */}
        <div ref={dropdownRef} className={cn(
          "absolute inset-x-3.5 top-[12px] transition-all duration-300",
          isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-90 pointer-events-none"
        )}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all duration-200 text-left cursor-pointer"
          >
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
              activeBrand.color === 'indigo' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' :
              activeBrand.color === 'amber' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : // amber-600
              'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            )}>
              {activeBrand.id === 'aura-fashion' && <Shirt className="w-4 h-4" />}
              {activeBrand.id === 'brew-co' && <Coffee className="w-4 h-4" />}
              {activeBrand.id === 'bloom-beauty' && <Sparkles className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold text-foreground leading-none truncate">{activeBrand.name}</div>
              <div className="text-[9px] text-muted-foreground leading-none mt-1 truncate">{activeBrand.description}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          </button>
 
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl border border-border bg-popover p-1.5 shadow-2xl animate-scale-in">
              {BRANDS.map((brand) => (
                <button
                  key={brand.id}
                  onClick={() => {
                    setActiveBrand(brand);
                    setIsDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-150 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer",
                    brand.id === activeBrand.id ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  <div className={cn(
                    "w-6.5 h-6.5 rounded-md flex items-center justify-center flex-shrink-0",
                    brand.color === 'indigo' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' :
                    brand.color === 'amber' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                    'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  )}>
                    {brand.id === 'aura-fashion' && <Shirt className="w-3.5 h-3.5" />}
                    {brand.id === 'brew-co' && <Coffee className="w-3.5 h-3.5" />}
                    {brand.id === 'bloom-beauty' && <Sparkles className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 truncate">
                    <div className="font-semibold leading-none">{brand.name}</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5 leading-none">{brand.description}</div>
                  </div>
                  {brand.id === activeBrand.id && (
                    <Check className="w-3 h-3 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]',
                isActive
                  ? 'bg-primary/10 text-primary dark:text-white font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="relative flex-shrink-0">
                <Icon
                  className={cn(
                    'w-5 h-5 transition-colors flex-shrink-0',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                {isActive && (
                  <div className="absolute -left-[18px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                )}
              </div>
              <span className={cn(
                "truncate transition-all duration-300 ease-in-out font-medium whitespace-nowrap",
                isExpanded ? "opacity-100 max-w-[150px] ml-0" : "opacity-0 max-w-0 overflow-hidden pointer-events-none"
              )}>
                {item.label}
              </span>
              {isActive && item.href === '/copilot' && (
                <span className={cn(
                  "ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary text-white animate-scale-in transition-all duration-300",
                  isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75 overflow-hidden pointer-events-none"
                )}>
                  AI
                </span>
              )}
              {/* Collapsed Tooltip (Only triggers when collapsed AND not hovered) */}
              {collapsed && !isHovered && (
                <span className="absolute left-16 scale-0 group-hover:scale-100 transition-all duration-150 origin-left bg-zinc-950 border border-white/[0.08] text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-xl font-semibold pointer-events-none z-50 whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Status Dashboard Footer */}
      <div className={cn(
        "px-4 py-3 border-t border-white/[0.04] bg-white/[0.01] transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
        isExpanded ? "opacity-100 max-h-12" : "opacity-0 max-h-0 py-0 pointer-events-none"
      )}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-semibold text-zinc-400 font-mono tracking-tight whitespace-nowrap">SYSTEM NODES ONLINE</span>
        </div>
      </div>

      {/* Collapse toggle */}
      <div className="px-3 py-3 border-t border-white/[0.06] flex-shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all duration-200 cursor-pointer"
        >
          <div className="flex items-center justify-center gap-2 w-full">
            {collapsed ? (
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            ) : (
              <ChevronLeft className="w-4 h-4 flex-shrink-0" />
            )}
            <span className={cn(
              "text-xs font-semibold truncate transition-all duration-300 ease-in-out whitespace-nowrap",
              isExpanded ? "opacity-100 max-w-[100px] ml-0" : "opacity-0 max-w-0 overflow-hidden pointer-events-none"
            )}>
              Collapse
            </span>
          </div>
        </button>
      </div>
    </aside>
  );
}
