'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { Customer } from '@/lib/types';
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Mail, MessageSquare, Phone, MapPin, IndianRupee, ArrowUpDown, ChevronLeft, ChevronRight, UserMinus } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function CustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('all');
  const [channel, setChannel] = useState('all');
  const [minLTV, setMinLTV] = useState('');
  const [inactiveDays, setInactiveDays] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');

  // Fetch unique cities for filter dropdown
  const { data: cities = [] } = useQuery<string[]>({
    queryKey: ['customer-cities'],
    queryFn: () => apiGet('/api/customers/cities'),
  });

  // Fetch customers with current filters/pagination
  const { data, isLoading, refetch } = useQuery<{
    items: Customer[];
    total: number;
    pages: number;
  }>({
    queryKey: ['customers', page, search, city, minLTV, inactiveDays, sortBy, sortDir],
    queryFn: () => {
      let url = `/api/customers?page=${page}&per_page=12&sort_by=${sortBy}&sort_dir=${sortDir}`;
      if (search) url += `&search=${search}`;
      if (city && city !== 'all') url += `&city=${city}`;
      if (minLTV) url += `&min_ltv=${minLTV}`;
      if (inactiveDays && inactiveDays !== 'all') url += `&inactive_days=${inactiveDays}`;
      return apiGet(url);
    },
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  const channelIcons: Record<string, any> = {
    whatsapp: MessageSquare,
    email: Mail,
    sms: Phone,
  };

  const channelColors: Record<string, string> = {
    whatsapp: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    email: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    sms: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  const handleResetFilters = () => {
    setSearch('');
    setCity('all');
    setChannel('all');
    setMinLTV('');
    setInactiveDays('all');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Search and Filter Panel */}
      <div className="glass-card rounded-2xl p-6 border border-black/[0.06] dark:border-white/[0.04] space-y-4 animate-scale-in">
        <h3 className="text-base font-semibold text-foreground">Filter Shoppers</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9 bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-xl text-sm text-foreground"
            />
          </div>

          {/* City filter */}
          <Select value={city} onValueChange={(val) => { setCity(val || 'all'); setPage(1); }}>
            <SelectTrigger className="bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-xl text-sm text-foreground">
              <SelectValue placeholder="All Cities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Inactivity filter */}
          <Select value={inactiveDays} onValueChange={(val) => { setInactiveDays(val || 'all'); setPage(1); }}>
            <SelectTrigger className="bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-xl text-sm text-foreground">
              <SelectValue placeholder="All Activity statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Last Order Date</SelectItem>
              <SelectItem value="30">Dormant (30d+)</SelectItem>
              <SelectItem value="60">Inactive (60d+)</SelectItem>
              <SelectItem value="90">Cold (90d+)</SelectItem>
            </SelectContent>
          </Select>

          {/* Min LTV filter */}
          <div className="relative">
            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              type="number"
              placeholder="Min Spend (LTV)"
              value={minLTV}
              onChange={(e) => {
                setMinLTV(e.target.value);
                setPage(1);
              }}
              className="pl-9 bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-xl text-sm text-foreground"
            />
          </div>

          {/* Clear button */}
          <Button
            onClick={handleResetFilters}
            variant="ghost"
            className="text-muted-foreground hover:text-foreground bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.06] rounded-xl text-xs cursor-pointer"
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Customer Data Table */}
      <div className="glass-card rounded-3xl border border-black/[0.06] dark:border-white/[0.04] overflow-hidden shadow-md animate-fade-in-up stagger-3">
        <div className="overflow-x-auto min-h-[350px]">
          {isLoading ? (
            <div className="h-[350px] flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-black/[0.01] dark:bg-white/[0.01] border-b border-black/[0.06] dark:border-white/[0.04]">
                <TableRow className="hover:bg-transparent border-black/[0.06] dark:border-white/[0.04]">
                  <TableHead className="font-semibold text-muted-foreground py-4 px-6">Name</TableHead>
                  <TableHead className="font-semibold text-muted-foreground py-4 px-6">Contact Info</TableHead>
                  <TableHead className="font-semibold text-muted-foreground py-4 px-6 cursor-pointer hover:text-foreground" onClick={() => handleSort('city')}>
                    <span className="flex items-center gap-1.5">
                      City <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-muted-foreground py-4 px-6 cursor-pointer hover:text-foreground" onClick={() => handleSort('lifetime_value')}>
                    <span className="flex items-center gap-1.5">
                      Lifetime Value <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-muted-foreground py-4 px-6 cursor-pointer hover:text-foreground" onClick={() => handleSort('total_orders')}>
                    <span className="flex items-center gap-1.5">
                      Orders <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-muted-foreground py-4 px-6 cursor-pointer hover:text-foreground" onClick={() => handleSort('last_purchase_at')}>
                    <span className="flex items-center gap-1.5">
                      Last Order <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-muted-foreground py-4 px-6">Channel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((cust) => {
                  const ChannelIcon = channelIcons[cust.preferred_channel] || Mail;
                  return (
                    <TableRow key={cust.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.02] border-black/[0.06] dark:border-white/[0.04]">
                      {/* Name */}
                      <TableCell className="py-4 px-6 font-medium text-foreground">{cust.name}</TableCell>
                      {/* Contact Info */}
                      <TableCell className="py-4 px-6 text-xs text-muted-foreground space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{cust.email}</span>
                        </div>
                        {cust.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{cust.phone}</span>
                          </div>
                        )}
                      </TableCell>
                      {/* City */}
                      <TableCell className="py-4 px-6 text-sm text-muted-foreground font-medium">
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-violet-400/80" />
                          {cust.city || 'unspecified'}
                        </span>
                      </TableCell>
                      {/* LTV */}
                      <TableCell className="py-4 px-6 text-sm font-semibold text-foreground font-mono">
                        ₹{cust.lifetime_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      {/* Total orders */}
                      <TableCell className="py-4 px-6 text-sm text-muted-foreground font-mono">{cust.total_orders}</TableCell>
                      {/* Last purchase date */}
                      <TableCell className="py-4 px-6 text-xs text-muted-foreground">
                        {cust.last_purchase_at ? (
                          <span className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {format(new Date(cust.last_purchase_at), 'dd MMM yyyy')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ({formatDistanceToNow(new Date(cust.last_purchase_at), { addSuffix: true })})
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <UserMinus className="w-3 h-3" /> Never
                          </span>
                        )}
                      </TableCell>
                      {/* Preferred channel */}
                      <TableCell className="py-4 px-6">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${channelColors[cust.preferred_channel] || ''}`}
                        >
                          <ChannelIcon className="w-3 h-3 mr-1" />
                          {cust.preferred_channel}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {data?.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                      No shoppers match the specified filter criteria. Try resetting.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination controls */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.04] bg-white/[0.005]">
            <p className="text-xs text-muted-foreground">
              Showing page <span className="font-semibold text-foreground">{page}</span> of{' '}
              <span className="font-semibold text-foreground">{data.pages}</span> (Total{' '}
              <span className="font-semibold text-foreground">{data.total}</span> customers)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="border-white/[0.06] hover:bg-white/[0.04] text-xs h-8 rounded-lg"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(p + 1, data.pages))}
                disabled={page === data.pages}
                className="border-white/[0.06] hover:bg-white/[0.04] text-xs h-8 rounded-lg"
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
