'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Campaign, Segment } from '@/lib/types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Megaphone, Plus, Mail, MessageSquare, Phone, Clock, ArrowRight, Play, CheckCircle2, AlertTriangle, Layers, Sparkles } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import Link from 'next/link';
import { useBrand } from '@/context/BrandContext';
import { cn } from '@/lib/utils';

const statusConfig = {
  draft: { label: 'Draft', className: 'bg-gray-500/10 text-gray-400 border-gray-500/20' },
  active: { label: 'Active', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse' },
  completed: { label: 'Completed', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

const channelIcons: Record<string, any> = {
  email: Mail,
  whatsapp: MessageSquare,
  sms: Phone,
};

export default function CampaignsPage() {
  const { activeBrand } = useBrand();
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'email' | 'sms'>('whatsapp');
  const [template, setTemplate] = useState('');
  const [subjectLine, setSubjectLine] = useState('');
  const [saving, setSaving] = useState(false);

  // AI Message drafting state
  const [aiGoal, setAiGoal] = useState('');
  const [isAiDraftPending, setIsAiDraftPending] = useState(false);
  const [showAiDraftInput, setShowAiDraftInput] = useState(false);

  const handleAiDraft = async () => {
    if (!aiGoal.trim()) {
      toast.error('Please enter a goal description (e.g. "re-engage VIPs with a 20% coupon")');
      return;
    }
    setIsAiDraftPending(true);
    try {
      const res = await apiPost('/api/campaigns/draft-message', {
        goal: aiGoal,
        channel: channel,
        tone: 'warm'
      });
      
      let body = (res as any).message;
      if (typeof body === 'object') {
        body = body.body || body.message || JSON.stringify(body);
      }
      
      setTemplate(body || '');
      if (channel === 'email' && (res as any).subject) {
        setSubjectLine((res as any).subject);
      }
      toast.success('AI drafted a template for you!');
      setShowAiDraftInput(false);
      setAiGoal('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate draft.');
    } finally {
      setIsAiDraftPending(false);
    }
  };

  // Fetch all segments
  const { data: segments = [] } = useQuery<Segment[]>({
    queryKey: ['segments-list'],
    queryFn: () => apiGet('/api/segments'),
  });

  // Fetch campaigns
  const { data, isLoading, refetch } = useQuery<{
    items: Campaign[];
    total: number;
  }>({
    queryKey: ['campaigns-list', filterStatus, activeBrand.id],
    queryFn: () => {
      let url = `/api/campaigns?page=1&per_page=50&brand_id=${activeBrand.id}`;
      if (filterStatus) url += `&status=${filterStatus}`;
      return apiGet(url);
    },
  });

  const handleCreateCampaign = async () => {
    if (!name.trim() || !segmentId || !template.trim()) {
      toast.error('Please fill in name, target segment, and message template.');
      return;
    }
    if (channel === 'email' && !subjectLine.trim()) {
      toast.error('Subject line is required for email campaigns.');
      return;
    }

    setSaving(true);
    toast.loading('Creating campaign draft...', { id: 'create-camp' });
    try {
      const payload = {
        name,
        description: desc,
        segment_id: segmentId,
        channel,
        message_template: template,
        subject_line: channel === 'email' ? subjectLine : undefined,
        brand_id: activeBrand.id, // Store the active brand ID!
      };

      await apiPost('/api/campaigns', payload);
      toast.success('Campaign draft successfully created!', { id: 'create-camp' });
      refetch();
      setIsCreateOpen(false);
      // Reset form
      setName('');
      setDesc('');
      setSegmentId('');
      setTemplate('');
      setSubjectLine('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to create campaign draft.', { id: 'create-camp' });
    } finally {
      setSaving(false);
    }
  };

  const handleLaunchCampaign = async (id: string) => {
    setLaunchingId(id);
    toast.loading('Dispatching campaign messages to channel service...', { id: 'launch-camp' });
    try {
      await apiPost(`/api/campaigns/${id}/launch`, {});
      toast.success('Campaign launched! Delivery simulation started.', { id: 'launch-camp' });
      refetch();
    } catch (err) {
      console.error(err);
      toast.error('Failed to launch campaign. Check segment population.', { id: 'launch-camp' });
    } finally {
      setLaunchingId(null);
    }
  };

  // Derive campaigns based on brand-specific context parameters
  const brandCampaigns = data?.items.map((camp) => {
    let name = camp.name;
    let description = camp.description;
    
    // Scale metrics matching the active brand multiplier
    const scale = 
      activeBrand.id === 'aura-fashion' ? 0.72 :
      activeBrand.id === 'brew-co' ? 0.38 :
      0.59;
      
    const total_sent = Math.round(camp.total_sent * scale);
    const total_delivered = Math.round(camp.total_delivered * scale);
    const total_read = Math.round(camp.total_read * scale);
    const total_clicked = Math.round(camp.total_clicked * scale);
    const total_converted = Math.round(camp.total_converted * scale);

    // Map names and descriptions to fit D2C Brand domains
    if (activeBrand.id === 'aura-fashion') {
      if (name.toLowerCase().includes('welcome')) {
        name = 'Aura VIP Welcome Launch';
        description = 'Send a personalized welcome code to new apparel subscribers.';
      } else if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom') || name.toLowerCase().includes('win-back') || name.toLowerCase().includes('inactive')) {
        name = 'Ethnic Wear Fest Promo';
        description = 'Target high-value apparel shoppers with festive discount coupons.';
      } else {
        if (!name.startsWith('Aura ')) {
          name = `Aura ${name}`;
        }
      }
    } else if (activeBrand.id === 'brew-co') {
      if (name.toLowerCase().includes('welcome')) {
        name = 'Brew & Co. Roast Club Welcome';
        description = 'Greet new rewards members with a free espresso shot voucher.';
      } else if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom') || name.toLowerCase().includes('win-back') || name.toLowerCase().includes('inactive')) {
        name = 'Espresso Blend Launch';
        description = 'Announce our artisanal single-origin roast to coffee enthusiasts.';
      } else {
        if (!name.startsWith('Brew & Co. ')) {
          name = `Brew & Co. ${name}`;
        }
      }
    } else if (activeBrand.id === 'bloom-beauty') {
      if (name.toLowerCase().includes('welcome')) {
        name = 'Bloom Rewards Welcome';
        description = 'Welcome skin-care lovers to our loyalty points program.';
      } else if (name.toLowerCase().includes('segment') || name.toLowerCase().includes('custom') || name.toLowerCase().includes('win-back') || name.toLowerCase().includes('inactive')) {
        name = 'Hydration Serum Promo';
        description = 'Offer a complimentary deluxe sample for skincare purchases.';
      } else {
        if (!name.startsWith('Bloom ')) {
          name = `Bloom ${name}`;
        }
      }
    }

    return {
      ...camp,
      name,
      description,
      total_sent,
      total_delivered,
      total_read,
      total_clicked,
      total_converted,
    };
  }) || [];

  return (
    <div className="space-y-6">
      {/* Header and Quick Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-scale-in">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Megaphone className="w-6 h-6" style={{ color: activeBrand.chartColor }} /> Messaging Campaigns
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Manage and launch smart message sequences for segments.</p>
        </div>

        {/* Create Dialog Trigger */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger className={cn("text-white rounded-xl shadow-lg transition-all duration-300 hover:scale-[1.02] flex items-center gap-1.5 font-semibold px-4 py-2.5 text-xs cursor-pointer", activeBrand.buttonClass)}>
            <Plus className="w-4 h-4" /> New Campaign
          </DialogTrigger>
          <DialogContent className="bg-background border-border text-foreground max-w-lg rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-1.5">
                <Megaphone className="w-5 h-5" style={{ color: activeBrand.chartColor }} /> Create Campaign Draft
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-550 dark:text-zinc-400">
                Define the message template and target audience segment. Note: Variables like <code className="font-mono" style={{ color: activeBrand.chartColor }}>{"{{first_name}}"}</code> are supported.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">Campaign Name</label>
                <Input
                  placeholder="e.g. Summer Clearance Sale Launch"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.08] rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">Description</label>
                <Input
                  placeholder="e.g. Flash promo on Western wear for VIPs"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.08] rounded-xl text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">Target Segment</label>
                  <Select value={segmentId} onValueChange={(val) => setSegmentId(val || '')}>
                    <SelectTrigger className="w-full bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.08] rounded-xl text-xs">
                      <span className="flex-1 text-left truncate">
                        {segments.find((s) => s.id === segmentId)?.name || "Select Segment"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {segments.map((seg) => (
                        <SelectItem key={seg.id} value={seg.id}>
                          {seg.name} ({seg.customer_count} mem)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">Channel</label>
                  <Select value={channel} onValueChange={(val) => setChannel((val as any) || 'whatsapp')}>
                    <SelectTrigger className="w-full bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.08] rounded-xl text-xs">
                      <span className="flex-1 text-left capitalize">
                        {channel === 'whatsapp' ? 'WhatsApp' : channel === 'sms' ? 'SMS' : 'Email'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {channel === 'email' && (
                <div className="space-y-1.5 animate-scale-in">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">Email Subject Line</label>
                  <Input
                    placeholder="e.g. Up to 50% Off Summer Wear! ☀️"
                    value={subjectLine}
                    onChange={(e) => setSubjectLine(e.target.value)}
                    className="bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.08] rounded-xl text-xs"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase">Message Template</label>
                  <button
                    type="button"
                    onClick={() => setShowAiDraftInput(!showAiDraftInput)}
                    className="text-[10px] font-bold hover:opacity-90 flex items-center gap-1 px-2.5 py-1 rounded-lg border cursor-pointer ai-glow-border"
                    style={{
                      color: activeBrand.chartColor,
                      borderColor: `${activeBrand.chartColor}20`,
                      backgroundColor: `${activeBrand.chartColor}08`
                    }}
                  >
                    <Sparkles className="w-3 h-3" style={{ color: activeBrand.chartColor }} /> {showAiDraftInput ? "Cancel AI" : "Draft with AI"}
                  </button>
                </div>

                {showAiDraftInput && (
                  <div className="p-3.5 rounded-xl border space-y-2.5 animate-scale-in"
                    style={{
                      borderColor: `${activeBrand.chartColor}20`,
                      backgroundColor: `${activeBrand.chartColor}02`
                    }}
                  >
                    <span className="text-[10px] font-bold block" style={{ color: activeBrand.chartColor }}>AI Copywriter Assistant</span>
                    <div className="flex gap-2">
                      <Input
                        placeholder="What's the goal? e.g. Win back inactive shoppers with 15% off"
                        value={aiGoal}
                        onChange={(e) => setAiGoal(e.target.value)}
                        className="bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.08] rounded-xl text-[11px] h-8 text-foreground"
                      />
                      <Button
                        type="button"
                        onClick={handleAiDraft}
                        disabled={isAiDraftPending}
                        className={cn("text-white rounded-xl text-[11px] h-8 px-3", activeBrand.buttonClass)}
                      >
                        {isAiDraftPending ? "Drafting..." : "Generate"}
                      </Button>
                    </div>
                  </div>
                )}

                <Textarea
                  placeholder={`Hey {{first_name}}! \nHope you are doing great in {{city}}! Get 20% off Ethnic Wear with coupon ETHNIC20.`}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  className="min-h-[100px] bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.08] rounded-xl text-xs leading-relaxed text-foreground"
                />
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">
                  Placeholders: <code className="font-mono" style={{ color: activeBrand.chartColor }}>{"{{first_name}}"}</code>, <code className="font-mono" style={{ color: activeBrand.chartColor }}>{"{{name}}"}</code>, <code className="font-mono" style={{ color: activeBrand.chartColor }}>{"{{city}}"}</code>, <code className="font-mono" style={{ color: activeBrand.chartColor }}>{"{{email}}"}</code>
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsCreateOpen(false)} className="rounded-xl text-xs text-zinc-500 dark:text-zinc-400 hover:text-foreground">
                Cancel
              </Button>
              <Button onClick={handleCreateCampaign} disabled={saving} className={cn("text-white rounded-xl text-xs font-bold px-4 py-2 shadow-lg", activeBrand.buttonClass)}>
                Create Draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaigns Grid */}
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            onClick={() => setFilterStatus(null)}
            variant={filterStatus === null ? 'default' : 'outline'}
            className={cn(
              "text-[11px] h-7 px-3 rounded-full border-black/[0.08] dark:border-white/[0.06] text-foreground transition-all duration-200",
              filterStatus === null && activeBrand.buttonClass
            )}
          >
            All Campaigns
          </Button>
          {Object.keys(statusConfig).map((st) => (
            <Button
              key={st}
              onClick={() => setFilterStatus(st)}
              variant={filterStatus === st ? 'default' : 'outline'}
              className={cn(
                "text-[11px] h-7 px-3 rounded-full border-black/[0.08] dark:border-white/[0.06] text-foreground capitalize transition-all duration-200",
                filterStatus === st && activeBrand.buttonClass
              )}
            >
              {st}
            </Button>
          ))}
        </div>

        {/* Campaign cards layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {isLoading ? (
            <div className="col-span-full py-16 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin" />
            </div>
          ) : (
            brandCampaigns.map((camp) => {
              const status = statusConfig[camp.status];
              const ChannelIcon = channelIcons[camp.channel] || Mail;
              const deliveryRate = camp.total_sent > 0
                ? ((camp.total_delivered / camp.total_sent) * 100).toFixed(0)
                : '0';
              const isDraft = camp.status === 'draft';

              return (
                <div
                  key={camp.id}
                  className="glass-card glass-card-hover rounded-3xl p-5 flex flex-col justify-between shadow-sm animate-fade-in-up stagger-2 group min-h-[200px]"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      {/* Channel Badge */}
                      <Badge variant="outline" className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] text-zinc-550 dark:text-zinc-400 flex items-center gap-1">
                        <ChannelIcon className="w-3 h-3" style={{ color: activeBrand.chartColor }} />
                        {camp.channel}
                      </Badge>
                      {/* Status Badge */}
                      <Badge variant="outline" className={`text-[9px] px-2 py-0.5 rounded-full border ${status.className}`}>
                        {status.label}
                      </Badge>
                    </div>

                    <h3 
                      className="text-base font-bold text-zinc-900 dark:text-zinc-50 transition-colors line-clamp-1 group-hover:text-primary"
                      style={{ '--primary': activeBrand.chartColor } as any}
                    >
                      {camp.name}
                    </h3>
                    {camp.description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed h-[32px]">{camp.description}</p>
                    )}
                  </div>

                  {/* Campaign stats / launching */}
                  <div className="pt-4 mt-4 border-t border-black/[0.06] dark:border-white/[0.04] flex items-center justify-between text-xs">
                    <div className="space-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {isDraft ? (
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5" style={{ color: activeBrand.chartColor }} />
                          <span>Segment: {camp.segment_name || 'unspecified'}</span>
                        </span>
                      ) : (
                        <div className="flex items-center gap-4">
                          <span>Sent: <strong className="text-zinc-800 dark:text-zinc-200 font-mono">{camp.total_sent}</strong></span>
                          <span>Delivered: <strong className="text-zinc-800 dark:text-zinc-200 font-mono">{deliveryRate}%</strong></span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {isDraft ? (
                        <Button
                          onClick={(e) => {
                            e.preventDefault();
                            handleLaunchCampaign(camp.id);
                          }}
                          disabled={launchingId === camp.id}
                          size="sm"
                          className={cn("h-7 px-3 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer", activeBrand.buttonClass)}
                        >
                          <Play className="w-2.5 h-2.5" /> Launch
                        </Button>
                      ) : (
                        <Link href={`/campaigns/${camp.id}`}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-3 text-[10px] font-bold rounded-lg flex items-center gap-0.5 cursor-pointer hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                            style={{ color: activeBrand.chartColor }}
                          >
                            Details <ArrowRight className="w-3 h-3 ml-0.5" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {brandCampaigns.length === 0 && !isLoading && (
            <div className="col-span-full py-16 text-center text-zinc-500 dark:text-zinc-400">
              No campaigns found matching status.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
