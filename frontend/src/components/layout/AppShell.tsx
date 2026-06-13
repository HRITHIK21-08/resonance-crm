'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';
import { useBrand } from '@/context/BrandContext';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { activeBrand } = useBrand();

  useEffect(() => {
    const saved = localStorage.getItem('resonance_sidebar_collapsed');
    if (saved === 'true') {
      setCollapsed(true);
    }
  }, []);

  const handleSetCollapsed = (val: boolean) => {
    setCollapsed(val);
    localStorage.setItem('resonance_sidebar_collapsed', String(val));
  };

  // Map brand color string to HSL values for Tailwind v4 CSS variables injection
  const primaryHsl = 
    activeBrand.color === 'indigo' 
      ? '243.4 75.4% 58.6%' 
      : activeBrand.color === 'amber' 
      ? '37.7 92.1% 50.2%' 
      : '346.8 84.1% 50.2%';

  return (
    <div 
      style={{ 
        '--primary': primaryHsl,
        '--ring': primaryHsl,
      } as React.CSSProperties}
      className="flex min-h-screen bg-background relative bg-tech-grid"
    >
      <Sidebar collapsed={collapsed} setCollapsed={handleSetCollapsed} />
      
      <div className={cn(
        "flex-1 min-h-screen transition-all duration-300 ease-in-out relative z-10",
        collapsed ? "ml-[68px]" : "ml-[240px]"
      )}>
        <Header collapsed={collapsed} />
        <main className="p-6 pt-[88px]">
          {children}
        </main>
      </div>
    </div>
  );
}

