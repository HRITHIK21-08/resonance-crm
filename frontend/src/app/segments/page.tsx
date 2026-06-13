'use client';

import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { Segment, Customer } from '@/lib/types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, Plus, Sparkles, RefreshCw, Trash2, ArrowUpDown, Play, Check, AlertCircle, X, Users, MapPin, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';

interface RuleCondition {
  field: string;
  operator: string;
  value: string;
}

export default function SegmentsPage() {
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  
  // Segment builder state
  const [newSegmentName, setNewSegmentName] = useState('');
  const [newSegmentDesc, setNewSegmentDesc] = useState('');
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<RuleCondition[]>([
    { field: 'lifetime_value', operator: 'gte', value: '5000' }
  ]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  // AI Segment Suggester state
  const [aiSegmentPrompt, setAiSegmentPrompt] = useState('');
  const [isAiSegmentPending, setIsAiSegmentPending] = useState(false);
  const [showAiSegmentInput, setShowAiSegmentInput] = useState(false);

  // Fetch all segments
  const { data: segments = [], isLoading: isSegmentsLoading, refetch: refetchSegments } = useQuery<Segment[]>({
    queryKey: ['segments'],
    queryFn: () => apiGet('/api/segments'),
  });

  // Fetch details & members of selected segment
  const { data: segmentDetails, isLoading: isDetailsLoading, refetch: refetchDetails } = useQuery<any>({
    queryKey: ['segment-details', selectedSegmentId],
    queryFn: () => apiGet(`/api/segments/${selectedSegmentId}?include_members=true`),
    enabled: !!selectedSegmentId,
  });

  const handleRefreshSegment = async (id: string) => {
    setRefreshingId(id);
    toast.loading('Recalculating segment memberships...', { id: 'refresh-seg' });
    try {
      await apiPost(`/api/segments/${id}/refresh`, {});
      toast.success('Segment members successfully updated!', { id: 'refresh-seg' });
      refetchSegments();
      if (selectedSegmentId === id) refetchDetails();
    } catch (err) {
      console.error(err);
      toast.error('Failed to refresh segment.', { id: 'refresh-seg' });
    } finally {
      setRefreshingId(null);
    }
  };

  const handleAddCondition = () => {
    setConditions([...conditions, { field: 'lifetime_value', operator: 'gte', value: '1000' }]);
  };

  const handleRemoveCondition = (index: number) => {
    const updated = conditions.filter((_, i) => i !== index);
    setConditions(updated);
    setPreviewCount(null);
  };

  const handleConditionChange = (index: number, key: keyof RuleCondition, value: string) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [key]: value };
    setConditions(updated);
    setPreviewCount(null);
  };

  const handlePreviewAudience = async () => {
    setPreviewing(true);
    try {
      const payload = {
        rules: {
          logic,
          conditions: conditions.map(c => ({
            field: c.field,
            operator: c.operator,
            value: c.field === 'lifetime_value' || c.field === 'total_orders' || c.field === 'avg_order_value'
              ? parseFloat(c.value) || 0
              : c.value
          }))
        }
      };
      const result: any = await apiPost('/api/segments/preview', payload);
      setPreviewCount(result.count);
      toast.success(`Preview ready: matches ${result.count} customers`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to evaluate rules.');
    } finally {
      setPreviewing(false);
    }
  };

  const handleAiSegmentSuggest = async () => {
    if (!aiSegmentPrompt.trim()) {
      toast.error('Describe the audience (e.g. "shoppers in Delhi who bought 3+ times")');
      return;
    }
    setIsAiSegmentPending(true);
    try {
      const res: any = await apiPost('/api/segments/draft-rules', {
        prompt: aiSegmentPrompt
      });
      if (res.rules && res.rules.conditions) {
        setLogic(res.rules.logic || 'AND');
        const mappedConditions = res.rules.conditions.map((c: any) => ({
          field: c.field,
          operator: c.operator,
          value: String(c.value)
        }));
        setConditions(mappedConditions);
        toast.success('Rules updated using AI suggestions!');
        setShowAiSegmentInput(false);
        setAiSegmentPrompt('');
        
        // Auto trigger preview
        setTimeout(async () => {
          setPreviewing(true);
          try {
            const payload = {
              rules: {
                logic: res.rules.logic || 'AND',
                conditions: res.rules.conditions.map((c: any) => ({
                  field: c.field,
                  operator: c.operator,
                  value: c.field === 'lifetime_value' || c.field === 'total_orders' || c.field === 'avg_order_value'
                    ? parseFloat(c.value) || 0
                    : c.value
                }))
              }
            };
            const result: any = await apiPost('/api/segments/preview', payload);
            setPreviewCount(result.count);
          } catch (e) {
            console.error(e);
          } finally {
            setPreviewing(false);
          }
        }, 100);
        
      } else {
        toast.error('AI was unable to generate rules.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate AI rules.');
    } finally {
      setIsAiSegmentPending(false);
    }
  };

  const handleSaveSegment = async () => {
    if (!newSegmentName.trim()) {
      toast.error('Please enter a segment name.');
      return;
    }
    setSaving(true);
    toast.loading('Creating audience segment...', { id: 'save-seg' });
    try {
      const payload = {
        name: newSegmentName,
        description: newSegmentDesc,
        rules: {
          logic,
          conditions: conditions.map(c => ({
            field: c.field,
            operator: c.operator,
            value: c.field === 'lifetime_value' || c.field === 'total_orders' || c.field === 'avg_order_value'
              ? parseFloat(c.value) || 0
              : c.value
          }))
        }
      };
      const result: any = await apiPost('/api/segments', payload);
      toast.success(`Segment '${newSegmentName}' created with ${result.customer_count} members!`, { id: 'save-seg' });
      refetchSegments();
      setSelectedSegmentId(result.segment_id);
      
      // Reset form
      setNewSegmentName('');
      setNewSegmentDesc('');
      setConditions([{ field: 'lifetime_value', operator: 'gte', value: '5000' }]);
      setPreviewCount(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to save segment. (Ensure name is unique)', { id: 'save-seg' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Segments List & Rule Builder */}
      <div className="space-y-6 lg:col-span-1">
        {/* Segments List */}
        <div className="glass-card rounded-2xl p-5 border border-border shadow-md animate-scale-in">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            <h3 className="text-base font-semibold">Audience Segments</h3>
          </div>

          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            {isSegmentsLoading ? (
              <div className="py-8 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
              </div>
            ) : (
              segments.map((seg) => (
                <div
                  key={seg.id}
                  onClick={() => setSelectedSegmentId(seg.id)}
                  className={`flex flex-col gap-1 p-3 rounded-xl cursor-pointer transition-all duration-200 border ${
                    selectedSegmentId === seg.id
                      ? 'bg-gradient-to-r from-violet-500/15 to-cyan-500/10 border-violet-500/30'
                      : 'bg-black/[0.01] dark:bg-white/[0.01] hover:bg-black/[0.03] dark:hover:bg-white/[0.03] border-border hover:border-black/[0.12] dark:hover:border-white/[0.12]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground truncate">{seg.name}</span>
                    <Badge variant="secondary" className="font-mono text-[10px] bg-black/[0.04] dark:bg-white/[0.06] text-muted-foreground">
                      {seg.customer_count} mem
                    </Badge>
                  </div>
                  {seg.description && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{seg.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/40 text-[10px]">
                    <span className="text-muted-foreground uppercase tracking-wider font-bold">
                      Type: {seg.segment_type}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRefreshSegment(seg.id);
                      }}
                      disabled={refreshingId === seg.id}
                      className="text-violet-400 hover:text-violet-300 font-semibold flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${refreshingId === seg.id ? 'animate-spin' : ''}`} />
                      Sync
                    </button>
                  </div>
                </div>
              ))
            )}
            {segments.length === 0 && !isSegmentsLoading && (
              <p className="text-xs text-muted-foreground text-center py-6">No segments. Create one below!</p>
            )}
          </div>
        </div>

        {/* Rule Builder */}
        <div className="glass-card glass-card-hover rounded-2xl p-5 border border-black/[0.06] dark:border-white/[0.04] shadow-md animate-scale-in stagger-2">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-black/[0.06] dark:border-white/[0.04]">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Sparkles className="w-4 h-4 text-violet-650 dark:text-violet-400 flex-shrink-0" />
              <h3 className="text-sm font-bold text-foreground truncate">Interactive Segment Builder</h3>
              <button
                type="button"
                onClick={() => setShowAiSegmentInput(!showAiSegmentInput)}
                className="text-[9px] font-bold text-violet-600 dark:text-violet-400 hover:text-violet-500 flex items-center gap-0.5 bg-violet-500/5 px-2 py-0.5 rounded border border-violet-500/10 cursor-pointer ml-1.5 flex-shrink-0 ai-glow-border"
              >
                <Sparkles className="w-2.5 h-2.5 text-violet-600 dark:text-violet-400" /> AI Suggest
              </button>
            </div>
            <Select value={logic} onValueChange={(val) => { setLogic((val as any) || 'AND'); setPreviewCount(null); }}>
              <SelectTrigger className="w-[80px] h-7 bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-lg text-xs font-bold text-violet-600 dark:text-violet-400 flex-shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">AND</SelectItem>
                <SelectItem value="OR">OR</SelectItem>
              </SelectContent>
            </Select>
          </div>
 
          <div className="space-y-3">
            {showAiSegmentInput && (
              <div className="p-3.5 rounded-xl border border-violet-500/20 bg-violet-500/[0.02] space-y-2.5 animate-scale-in">
                <span className="text-[10px] text-violet-600 dark:text-violet-300 font-bold block">AI Segment Advisor</span>
                <div className="flex gap-2">
                  <Input
                    placeholder="Describe cohort (e.g. Pune shoppers spent > 5000)"
                    value={aiSegmentPrompt}
                    onChange={(e) => setAiSegmentPrompt(e.target.value)}
                    className="bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-xl text-[11px] h-8 text-foreground"
                  />
                  <Button
                    type="button"
                    onClick={handleAiSegmentSuggest}
                    disabled={isAiSegmentPending}
                    className="bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-[11px] h-8 px-3"
                  >
                    {isAiSegmentPending ? "..." : "Compile"}
                  </Button>
                </div>
              </div>
            )}
            {/* Conditions list */}
            <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
              {conditions.map((cond, index) => (
                <div key={index} className="flex flex-col gap-2 p-2.5 rounded-lg border border-black/[0.06] dark:border-white/[0.04] bg-black/[0.005] dark:bg-white/[0.01]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Condition #{index + 1}</span>
                    {conditions.length > 1 && (
                      <button
                        onClick={() => handleRemoveCondition(index)}
                        className="text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
 
                  <div className="grid grid-cols-3 gap-1.5">
                    {/* Field select */}
                    <Select
                      value={cond.field}
                      onValueChange={(val) => handleConditionChange(index, 'field', val || '')}
                    >
                      <SelectTrigger className="h-8 bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-md text-[11px] text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lifetime_value">LTV (Spend)</SelectItem>
                        <SelectItem value="total_orders">Orders Count</SelectItem>
                        <SelectItem value="avg_order_value">Avg Order Val</SelectItem>
                        <SelectItem value="city">City</SelectItem>
                        <SelectItem value="preferred_channel">Channel Pref</SelectItem>
                      </SelectContent>
                    </Select>
 
                    {/* Operator select */}
                    <Select
                      value={cond.operator}
                      onValueChange={(val) => handleConditionChange(index, 'operator', val || '')}
                    >
                      <SelectTrigger className="h-8 bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-md text-[11px] text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cond.field === 'city' || cond.field === 'preferred_channel' ? (
                          <>
                            <SelectItem value="eq">Equals</SelectItem>
                            <SelectItem value="neq">Not Equals</SelectItem>
                            <SelectItem value="contains">Contains</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="gte">gte (&gt;=)</SelectItem>
                            <SelectItem value="lte">lte (&lt;=)</SelectItem>
                            <SelectItem value="gt">gt (&gt;)</SelectItem>
                            <SelectItem value="lt">lt (&lt;)</SelectItem>
                            <SelectItem value="eq">eq (==)</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
 
                    {/* Value input */}
                    <Input
                      placeholder="Value"
                      value={cond.value}
                      onChange={(e) => handleConditionChange(index, 'value', e.target.value)}
                      className="h-8 bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-md text-[11px] px-2 text-foreground"
                    />
                  </div>
                </div>
              ))}
            </div>
 
            {/* Form inputs */}
            <div className="space-y-2.5 pt-2 border-t border-black/[0.06] dark:border-white/[0.04]">
              <Input
                placeholder="Segment Name (e.g. VIP Mumbai Shoppers)"
                value={newSegmentName}
                onChange={(e) => setNewSegmentName(e.target.value)}
                className="bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-xl text-xs text-foreground"
              />
              <Input
                placeholder="Description"
                value={newSegmentDesc}
                onChange={(e) => setNewSegmentDesc(e.target.value)}
                className="bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-xl text-xs text-foreground"
              />
            </div>
 
            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCondition}
                className="flex-1 border-black/[0.08] dark:border-white/[0.06] text-xs h-9 rounded-xl flex items-center justify-center gap-1 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] text-foreground"
              >
                <Plus className="w-3.5 h-3.5" /> Condition
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePreviewAudience}
                disabled={previewing || conditions.length === 0}
                className="flex-1 border-violet-500/20 text-violet-600 dark:text-violet-300 hover:text-violet-700 dark:hover:text-white bg-violet-500/5 hover:bg-violet-500/10 text-xs h-9 rounded-xl flex items-center justify-center gap-1"
              >
                <Play className="w-3 h-3" /> Preview
              </Button>
            </div>
 
            {previewCount !== null && (
              <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-center font-medium text-violet-600 dark:text-violet-300 animate-scale-in">
                Matches <span className="font-bold font-mono text-violet-650 dark:text-white text-sm">{previewCount}</span> shoppers in database.
              </div>
            )}
 
            <Button
              type="button"
              onClick={handleSaveSegment}
              disabled={saving || !newSegmentName}
              className="w-full bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-bold text-xs h-9 rounded-xl flex items-center justify-center gap-1 shadow-lg shadow-violet-500/15 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> Save Segment
            </Button>
          </div>
        </div>
      </div>
 
      {/* Right: Selected Segment Members / Details */}
      <div className="lg:col-span-2">
        {selectedSegmentId ? (
          <div className="glass-card rounded-3xl border border-border p-6 shadow-md space-y-6 animate-fade-in-up min-h-[500px]">
            {isDetailsLoading ? (
              <div className="h-[500px] flex items-center justify-center">
                <div className="w-8 h-8 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin" />
              </div>
            ) : (
              <>
                {/* Header detail */}
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-border pb-4 gap-4">
                  <div className="space-y-1">
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                      {segmentDetails?.name}
                      <Badge variant="outline" className="text-[10px] uppercase border-violet-500/20 text-violet-600 dark:text-violet-300">
                        {segmentDetails?.segment_type}
                      </Badge>
                    </h2>
                    {segmentDetails?.description && (
                      <p className="text-xs text-muted-foreground">{segmentDetails?.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-xs border-border px-3 py-1 text-foreground">
                      {segmentDetails?.customer_count} Members
                    </Badge>
                    <Button
                      size="sm"
                      onClick={() => handleRefreshSegment(segmentDetails.id)}
                      className="border-border bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-xs h-8 rounded-xl text-foreground"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-sync
                    </Button>
                  </div>
                </div>

                {/* Rules Summary */}
                <div className="p-4 rounded-xl bg-black/[0.01] dark:bg-white/[0.01] border border-border space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Layers className="w-3 h-3" /> Target Conditions
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="bg-violet-500/10 text-violet-600 dark:text-violet-300 font-bold border-violet-500/10">
                      {segmentDetails?.rules?.logic || 'AND'}
                    </Badge>
                    {segmentDetails?.rules?.conditions?.map((c: any, i: number) => (
                      <span key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                        {i > 0 && <span className="text-[10px] font-bold text-muted-foreground opacity-50">AND</span>}
                        <code className="px-1.5 py-0.5 rounded bg-black/[0.02] dark:bg-white/[0.04] border border-border text-foreground">
                          {c.field} {c.operator} {Array.isArray(c.value) ? c.value.join('-') : c.value}
                        </code>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Members list */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Sample Members (Showing top 200)
                  </h4>
                  <div className="border border-border rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader className="bg-black/[0.01] dark:bg-white/[0.01]">
                        <TableRow className="hover:bg-transparent border-border">
                          <TableHead className="py-3 px-4 font-semibold text-muted-foreground text-xs">Name</TableHead>
                          <TableHead className="py-3 px-4 font-semibold text-muted-foreground text-xs">Email</TableHead>
                          <TableHead className="py-3 px-4 font-semibold text-muted-foreground text-xs">City</TableHead>
                          <TableHead className="py-3 px-4 font-semibold text-muted-foreground text-xs">LTV</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {segmentDetails?.members?.map((member: Customer) => (
                          <TableRow key={member.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.02] border-border">
                            <TableCell className="py-3 px-4 font-medium text-foreground text-xs">{member.name}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-muted-foreground">{member.email}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-violet-600 dark:text-violet-400" />
                                {member.city || 'unspecified'}
                              </span>
                            </TableCell>
                            <TableCell className="py-3 px-4 text-xs font-semibold font-mono text-foreground">
                              ₹{member.lifetime_value.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        {segmentDetails?.members?.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground">
                              No members currently match these rules.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="glass-card rounded-3xl border border-border p-12 text-center flex flex-col items-center justify-center min-h-[500px] text-muted-foreground">
            <Layers className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <h3 className="font-bold text-foreground">Select an Audience</h3>
            <p className="text-xs max-w-xs mt-1 leading-relaxed">
              Click a segment on the left to inspect its parameters, refresh memberships, and view matching customers.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
