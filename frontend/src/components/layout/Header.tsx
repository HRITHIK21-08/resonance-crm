'use client';

import { usePathname } from 'next/navigation';
import { Bell, Search, Sparkles, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import { useBrand } from '@/context/BrandContext';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/copilot': 'AI Copilot',
  '/campaigns': 'Campaigns',
  '/customers': 'Customers',
  '/segments': 'Segments',
  '/analytics': 'Analytics',
};

export function Header({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { activeBrand } = useBrand();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const pageTitle = pageTitles[pathname] || 
    (pathname.startsWith('/campaigns/') ? 'Campaign Details' : 'Resonance');

  return (
    <header className={cn(
      "fixed top-0 right-0 z-30 h-16 border-b transition-all duration-300 ease-in-out backdrop-blur-xl",
      "bg-background/40 border-border",
      collapsed ? "left-[68px]" : "left-[240px]"
    )}>
      <div className="flex items-center justify-between h-full px-6">
        {/* Left: Page Title */}
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            {pageTitle}
          </h2>
          <span className={cn(
            "px-2.5 py-0.5 text-[10px] font-bold rounded-full border tracking-wide uppercase",
            activeBrand.badgeClass
          )}>
            {activeBrand.name}
          </span>
          {pathname === '/copilot' && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary/10 text-primary border border-primary/20">
              POWERED BY AI
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Switcher Toggle Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-muted-foreground hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] rounded-xl cursor-pointer"
            title="Toggle theme"
          >
            {mounted && (theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />)}
            {!mounted && <div className="w-4 h-4" />}
          </Button>

          <Link href="/copilot">
            <Button
              size="sm"
              className={cn(
                "ml-2 text-white rounded-xl shadow-lg transition-all duration-300 hover:scale-[1.02] cursor-pointer",
                activeBrand.buttonClass
              )}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Ask AI
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
