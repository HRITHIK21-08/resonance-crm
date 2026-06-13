'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Brand {
  id: string;
  name: string;
  description: string;
  color: 'indigo' | 'amber' | 'rose';
  accentClass: string;
  badgeClass: string;
  buttonClass: string;
  chartColor: string;
  categories: string[];
}

export const BRANDS: Brand[] = [
  {
    id: 'aura-fashion',
    name: 'Aura Fashion',
    description: 'Premium D2C Apparel',
    color: 'indigo',
    accentClass: 'text-indigo-600 dark:text-indigo-400 border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 hover:bg-indigo-500/10 dark:hover:bg-indigo-500/20 hover:border-indigo-500/30',
    badgeClass: 'bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    buttonClass: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 focus-visible:ring-indigo-500',
    chartColor: '#6366f1',
    categories: ['Ethnic Wear', 'Western Wear', 'Footwear', 'Accessories'],
  },
  {
    id: 'brew-co',
    name: 'Brew & Co.',
    description: 'Artisanal Coffee Chain',
    color: 'amber',
    accentClass: 'text-amber-700 dark:text-amber-400 border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 hover:bg-amber-500/10 dark:hover:bg-amber-500/20 hover:border-amber-500/30',
    badgeClass: 'bg-amber-500/10 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
    buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20 focus-visible:ring-amber-500',
    chartColor: '#f59e0b',
    categories: ['Beverages', 'Coffee beans', 'Desserts', 'Merchandise'],
  },
  {
    id: 'bloom-beauty',
    name: 'Bloom Beauty',
    description: 'Cosmetics & Skincare',
    color: 'rose',
    accentClass: 'text-rose-600 dark:text-rose-400 border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 hover:border-rose-500/30',
    badgeClass: 'bg-rose-500/10 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20',
    buttonClass: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20 focus-visible:ring-rose-500',
    chartColor: '#f43f5e',
    categories: ['Beauty', 'Skincare', 'Cosmetics'],
  },
];

interface BrandContextType {
  activeBrand: Brand;
  setActiveBrand: (brand: Brand) => void;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [activeBrand, setActiveBrandState] = useState<Brand>(BRANDS[0]);

  useEffect(() => {
    const saved = localStorage.getItem('resonance_active_brand');
    if (saved) {
      const found = BRANDS.find((b) => b.id === saved);
      if (found) {
        setActiveBrandState(found);
      }
    }
  }, []);

  const setActiveBrand = (brand: Brand) => {
    setActiveBrandState(brand);
    localStorage.setItem('resonance_active_brand', brand.id);
  };

  return (
    <BrandContext.Provider value={{ activeBrand, setActiveBrand }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const context = useContext(BrandContext);
  if (!context) {
    throw new Error('useBrand must be used within a BrandProvider');
  }
  return context;
}
