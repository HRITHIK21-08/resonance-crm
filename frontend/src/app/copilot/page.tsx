'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api';
import { CopilotConversation, CopilotMessage, ToolCall } from '@/lib/types';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bot,
  User,
  Send,
  Plus,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Mail,
  Phone,
  Play,
  Check,
  TrendingUp,
  Layers,
  MapPin,
  HelpCircle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CopilotPage() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [expandedToolCalls, setExpandedToolCalls] = useState<Record<number, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // AI Keys settings state
  const [geminiKey, setGeminiKey] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('resonance_gemini_key') || '';
    }
    return '';
  });
  const [openaiKey, setOpenaiKey] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('resonance_openai_key') || '';
    }
    return '';
  });
  const [aiModelProvider, setAiModelProvider] = useState<'mock' | 'gemini' | 'openai'>(() => {
    if (typeof window !== 'undefined') {
      const ok = localStorage.getItem('resonance_openai_key');
      const gk = localStorage.getItem('resonance_gemini_key');
      if (ok) return 'openai';
      if (gk) return 'gemini';
    }
    return 'mock';
  });

  const handleSaveKeys = (provider: 'gemini' | 'openai', val: string) => {
    if (provider === 'gemini') {
      localStorage.setItem('resonance_gemini_key', val);
      setGeminiKey(val);
      if (val) {
        setAiModelProvider('gemini');
        toast.success('Google Gemini API Key activated!');
      } else {
        setAiModelProvider('mock');
        toast.info('Gemini Key removed. Falling back to Mock Demo.');
      }
    } else {
      localStorage.setItem('resonance_openai_key', val);
      setOpenaiKey(val);
      if (val) {
        setAiModelProvider('openai');
        toast.success('OpenAI API Key activated!');
      } else {
        setAiModelProvider('mock');
        toast.info('OpenAI Key removed. Falling back to Mock Demo.');
      }
    }
  };

  // Fetch conversations list
  const { data: conversations = [], refetch: refetchConversations } = useQuery<CopilotConversation[]>({
    queryKey: ['copilot-conversations'],
    queryFn: () => apiGet('/api/copilot/conversations'),
  });

  // Fetch active conversation messages
  const { data: activeThread, isLoading: isThreadLoading, refetch: refetchThread } = useQuery<CopilotConversation>({
    queryKey: ['copilot-conversation', activeThreadId],
    queryFn: () => apiGet(`/api/copilot/conversations/${activeThreadId}`),
    enabled: !!activeThreadId,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages, isThreadLoading]);

  // Mutation to send a message to copilot
  const chatMutation = useMutation<any, Error, string>({
    mutationFn: (messageText) =>
      apiPost('/api/copilot/chat', {
        conversation_id: activeThreadId,
        message: messageText,
      }),
    onMutate: () => {
      // Clear input
      setInputValue('');
    },
    onSuccess: (data) => {
      setActiveThreadId(data.conversation_id);
      refetchConversations();
      refetchThread();
    },
    onError: (err) => {
      console.error(err);
      toast.error('Copilot failed to respond. Check API keys.');
    },
  });

  useEffect(() => {
    const initialPrompt = sessionStorage.getItem('resonance_initial_prompt');
    if (initialPrompt) {
      setInputValue(initialPrompt);
      sessionStorage.removeItem('resonance_initial_prompt');
      chatMutation.mutate(initialPrompt);
    }
  }, []);

  const handleSend = () => {
    if (!inputValue.trim() || chatMutation.isPending) return;
    chatMutation.mutate(inputValue.trim());
  };

  const handleCreateNewThread = () => {
    setActiveThreadId(null);
    toast.success('Started a new AI conversation thread!');
  };

  const toggleToolCall = (index: number) => {
    setExpandedToolCalls((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  // Extract the last executed tool call to drive the Visual Context Panel (Right Pane)
  const getLastToolCall = (): ToolCall | null => {
    if (!activeThread?.messages) return null;
    
    // Scan messages backwards
    for (let i = activeThread.messages.length - 1; i >= 0; i--) {
      const msg = activeThread.messages[i];
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        return msg.tool_calls[msg.tool_calls.length - 1];
      }
    }
    return null;
  };

  const activeToolCall = getLastToolCall();

  const handleExampleClick = (prompt: string) => {
    setInputValue(prompt);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-120px)]">
      {/* Left: Chat Pane */}
      <div className="lg:col-span-2 flex flex-col glass-card glass-card-hover rounded-3xl border border-black/[0.06] dark:border-white/[0.04] overflow-hidden shadow-lg h-full animate-scale-in">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-black/[0.06] dark:border-white/[0.06] bg-black/[0.005] dark:bg-white/[0.005]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
              <Bot className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                Resonance AI Copilot
              </h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                Powered by Gemini / OpenAI
              </p>
            </div>
          </div>

          <Button
            onClick={handleCreateNewThread}
            variant="outline"
            size="sm"
            className="border-black/[0.08] dark:border-white/[0.06] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] text-foreground text-xs h-8 rounded-xl"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> New Thread
          </Button>
        </div>

        {/* Messages List Area */}
        <ScrollArea className="flex-1 min-h-0 p-6 space-y-4">
          <div className="space-y-4">
            {/* Thread starting / empty state */}
            {!activeThreadId && !chatMutation.isPending && (
              <div className="py-10 max-w-md mx-auto text-center space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-violet-500/10 mx-auto flex items-center justify-center border border-violet-500/20 shadow-inner">
                  <Sparkles className="w-6 h-6 text-violet-400" />
                </div>
                 <div className="space-y-1.5">
                  <h4 className="text-sm font-bold text-foreground">How can I assist you today?</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    I have access to Luxe Threads customer records and campaigns. You can ask me to search customers, create segments, or draft messaging templates.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 pt-2 text-left">
                  <button
                    onClick={() => handleExampleClick('Find customers in Bangalore who spent more than ₹5000')}
                    className="p-3.5 text-xs bg-black/[0.01] dark:bg-white/[0.01] hover:bg-violet-500/[0.04] border border-black/[0.04] dark:border-white/[0.04] hover:border-violet-500/25 rounded-xl text-muted-foreground hover:text-foreground dark:hover:text-white transition-all duration-300 text-left flex items-center gap-2 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-violet-400" />
                    "Find customers in Bangalore who spent more than ₹5000"
                  </button>
                  <button
                    onClick={() => handleExampleClick('Recommend the optimal channel for segment Loyal Customers')}
                    className="p-3.5 text-xs bg-black/[0.01] dark:bg-white/[0.01] hover:bg-cyan-500/[0.04] border border-black/[0.04] dark:border-white/[0.04] hover:border-cyan-500/25 rounded-xl text-muted-foreground hover:text-foreground dark:hover:text-white transition-all duration-300 text-left flex items-center gap-2 cursor-pointer"
                  >
                    <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                    "Recommend the optimal channel for segment Loyal Customers"
                  </button>
                  <button
                    onClick={() => handleExampleClick('Draft a warm WhatsApp message template to re-engage dormant customers')}
                    className="p-3.5 text-xs bg-black/[0.01] dark:bg-white/[0.01] hover:bg-emerald-500/[0.04] border border-black/[0.04] dark:border-white/[0.04] hover:border-emerald-500/25 rounded-xl text-muted-foreground hover:text-foreground dark:hover:text-white transition-all duration-300 text-left flex items-center gap-2 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-emerald-400" />
                    "Draft a warm WhatsApp message to re-engage dormant customers"
                  </button>
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {activeThread?.messages?.map((msg, mIdx) => {
              const isAI = msg.role === 'assistant';
              return (
                <div
                  key={mIdx}
                  className={`flex gap-3 max-w-xl ${isAI ? '' : 'ml-auto flex-row-reverse'}`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                      isAI
                        ? 'bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border-violet-500/20 text-violet-400'
                        : 'bg-black/[0.04] dark:bg-white/[0.04] border-black/[0.06] dark:border-white/[0.06] text-muted-foreground'
                    }`}
                  >
                    {isAI ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>

                  {/* Bubble content */}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div
                      className={`p-4 rounded-2xl text-xs leading-relaxed border ${
                        isAI
                          ? 'bg-black/[0.01] dark:bg-white/[0.01] border-black/[0.06] dark:border-white/[0.04] text-foreground'
                          : 'bg-gradient-to-r from-violet-600 to-violet-500 text-white border-transparent'
                      }`}
                    >
                      {/* Formatted Text */}
                      <div className="whitespace-pre-wrap font-sans">{msg.content}</div>

                      {/* Tool Calls Logs (Agent actions) */}
                      {isAI && msg.tool_calls && msg.tool_calls.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-black/[0.04] dark:border-white/[0.04] space-y-2">
                          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                            Agent Executions
                          </p>
                          {msg.tool_calls.map((tc, tcIdx) => (
                            <div
                              key={tcIdx}
                              className="rounded-lg border border-black/[0.06] dark:border-white/[0.04] bg-black/[0.005] dark:bg-white/[0.005] overflow-hidden text-[11px]"
                            >
                              <div
                                onClick={() => toggleToolCall(tcIdx)}
                                className="flex items-center justify-between p-2 cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                              >
                                <span className="font-mono text-violet-600 dark:text-violet-400 font-semibold">
                                  tool::{tc.name}()
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] font-bold px-1.5 py-0 rounded ${
                                      tc.status === 'completed'
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                        : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                                    }`}
                                  >
                                    {tc.status}
                                  </Badge>
                                  {expandedToolCalls[tcIdx] ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </div>
                              </div>
                              {expandedToolCalls[tcIdx] && (
                                <div className="p-3 border-t border-black/[0.04] dark:border-white/[0.04] bg-black/[0.02] dark:bg-black/10 font-mono text-[10px] text-muted-foreground space-y-2">
                                  <div>
                                    <span className="text-foreground block mb-0.5">Arguments:</span>
                                    <pre className="overflow-x-auto text-[9px] leading-relaxed">
                                      {JSON.stringify(tc.args, null, 2)}
                                    </pre>
                                  </div>
                                  {!!tc.result && (
                                    <div>
                                      <span className="text-foreground block mb-0.5">Result:</span>
                                      <pre className="overflow-x-auto text-[9px] leading-relaxed text-foreground">
                                        {JSON.stringify(tc.result, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
 
            {/* Typing Indicator */}
            {chatMutation.isPending && (
              <div className="flex gap-3 max-w-xl">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border-violet-500/20 text-violet-400">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="p-4 rounded-2xl border border-black/[0.06] dark:border-white/[0.04] bg-black/[0.01] dark:bg-white/[0.01] flex items-center gap-1.5 h-10">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 typing-dot" />
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 typing-dot" />
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 typing-dot" />
                </div>
              </div>
            )}
 
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
 
        {/* Chat Input Bar */}
        <div className="p-4 border-t border-black/[0.06] dark:border-white/[0.06] bg-black/[0.005] dark:bg-white/[0.005] flex gap-2">
          <Input
            placeholder="Ask AI to search customers, create segments, or draft campaign templates..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={chatMutation.isPending}
            className="bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.08] dark:border-white/[0.06] rounded-xl text-xs leading-relaxed text-foreground font-sans"
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || chatMutation.isPending}
            className="bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white rounded-xl w-10 h-10 p-0 shadow-lg shadow-violet-500/15 flex items-center justify-center cursor-pointer"
          >
            <Send className="w-4.5 h-4.5" />
          </Button>
        </div>
      </div>
 
      {/* Right: Visual Context Panel */}
      <div className="lg:col-span-1 glass-card glass-card-hover rounded-3xl border border-black/[0.06] dark:border-white/[0.04] p-5 shadow-lg flex flex-col justify-between h-full animate-fade-in-up stagger-3 overflow-hidden">
        <div className="space-y-4 flex-1 flex flex-col">
          {/* Header */}
          <div className="pb-3 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-650 dark:text-violet-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Visual Context</h3>
          </div>
 
          <div className="flex-1 overflow-y-auto">
            {/* 1. Context: Customer Search / demographics stats */}
            {activeToolCall?.name === 'search_customers' && !!activeToolCall.result && (
              <div className="space-y-4 animate-scale-in">
                <Badge variant="outline" className="border-violet-500/20 text-violet-600 dark:text-violet-300 text-[10px] uppercase font-bold">
                  Customers Searched
                </Badge>
                <div className="p-4 rounded-2xl bg-black/[0.01] dark:bg-white/[0.01] border border-border text-center space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Matching Count</span>
                  <p className="text-3xl font-extrabold text-foreground font-mono">{(activeToolCall.result as any).total_matching}</p>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Top Matches</span>
                  <div className="space-y-2 pr-1">
                    {(activeToolCall.result as any).customers?.map((cust: any) => (
                      <div key={cust.id} className="p-2.5 rounded-xl border border-border bg-black/[0.005] dark:bg-white/[0.005] flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-foreground block">{cust.name}</span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {cust.city}
                          </span>
                        </div>
                        <span className="font-semibold font-mono text-foreground">₹{cust.lifetime_value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 2. Context: Segment creation */}
            {activeToolCall?.name === 'create_segment' && !!activeToolCall.result && (
              <div className="space-y-4 animate-scale-in">
                <Badge variant="outline" className="border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] uppercase font-bold">
                  Segment Saved
                </Badge>
                <div className="rounded-2xl p-5 border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/[0.02] text-center space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 mx-auto flex items-center justify-center">
                    <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-foreground">{(activeToolCall.result as any).segment_name}</h4>
                    <p className="text-[10px] text-muted-foreground">Successfully Evaluated & Saved</p>
                  </div>
                  <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Segment Population:</span>
                    <strong className="text-foreground font-mono text-sm">{(activeToolCall.result as any).customer_count} mem</strong>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Context: Channel recommendation stats */}
            {activeToolCall?.name === 'recommend_channel' && !!activeToolCall.result && (
              <div className="space-y-4 animate-scale-in">
                <Badge variant="outline" className="border-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[10px] uppercase font-bold">
                  Optimal Channel Selection
                </Badge>
                <div className="rounded-2xl p-4 border border-cyan-500/20 bg-cyan-500/5 dark:bg-cyan-500/[0.02] space-y-2 text-center">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Recommended Channel</span>
                  <span className="text-lg font-bold text-foreground capitalize flex items-center justify-center gap-1.5">
                    {(activeToolCall.result as any).recommended_channel === 'whatsapp' ? (
                      <MessageSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (activeToolCall.result as any).recommended_channel === 'email' ? (
                      <Mail className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                    ) : (
                      <Phone className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    )}
                    {(activeToolCall.result as any).recommended_channel}
                  </span>
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1">{(activeToolCall.result as any).reason}</p>
                </div>

                <div className="space-y-2 pt-2">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">Channel preference split</span>
                  <div className="space-y-2">
                    {(activeToolCall.result as any).all_options?.map((opt: any) => (
                      <div key={opt.channel} className="p-3 rounded-xl border border-border bg-black/[0.005] dark:bg-white/[0.005] space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground capitalize">{opt.channel}</span>
                          <span className="font-mono font-bold text-foreground">{opt.segment_preference}%</span>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full h-1.5 rounded-full bg-black/[0.06] dark:bg-white/[0.06] overflow-hidden">
                          <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${opt.segment_preference}%` }} />
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1">
                          <span>Est Open: {opt.expected_open_rate}%</span>
                          <span>Est cost/msg: ₹{opt.cost_per_message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 4. Context: Message Drafting / Device simulator preview */}
            {(activeToolCall?.name === 'draft_campaign_message' || activeToolCall?.name === 'create_campaign') && !!activeToolCall.result && (
              <div className="space-y-4 animate-scale-in">
                <Badge variant="outline" className="border-violet-500/20 text-violet-600 dark:text-violet-350 text-[10px] uppercase font-bold">
                  Device Preview
                </Badge>
                
                {/* Device container simulating WhatsApp / SMS */}
                <div className="border border-black/[0.08] dark:border-white/[0.08] rounded-3xl bg-zinc-950 p-2.5 mx-auto max-w-[250px] shadow-inner relative">
                  {/* Speaker slot */}
                  <div className="w-20 h-4 bg-zinc-900 border border-black/[0.04] dark:border-white/[0.04] rounded-full mx-auto mb-2 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-black/40" />
                  </div>

                  <div className="rounded-2xl bg-zinc-900 border border-black/[0.02] dark:border-white/[0.02] p-3 text-[10px] leading-relaxed min-h-[220px] relative flex flex-col justify-between">
                    {/* Simulator content bubble */}
                    <div className="space-y-2">
                      <div className="w-full py-1 border-b border-black/[0.04] dark:border-white/[0.04] text-[9px] text-muted-foreground flex items-center justify-between">
                        <span>LUXE THREADS</span>
                        <span className="font-bold">WhatsApp</span>
                      </div>
                      
                      <div className="p-2.5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] text-[10px] text-white whitespace-pre-wrap leading-normal">
                        {typeof (activeToolCall.result as any).message === 'string'
                          ? (activeToolCall.result as any).message.replace('{{first_name}}', 'Harsh')
                          : (activeToolCall.result as any).message?.body?.replace('{{first_name}}', 'Harsh') || (activeToolCall.result as any).message_template?.replace('{{first_name}}', 'Harsh')}
                      </div>
                    </div>

                    <div className="text-[9px] text-muted-foreground text-center pt-2">
                      Device simulation preview
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 5. Context: Campaign launched success */}
            {activeToolCall?.name === 'launch_campaign' && !!activeToolCall.result && (
              <div className="space-y-4 animate-scale-in text-center py-6">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 mx-auto flex items-center justify-center border border-emerald-500/25 shadow-inner animate-pulse-glow">
                  <Play className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-foreground">Campaign Dispatched!</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    🚀 Campaign is now **active**. Dispatched successfully to channel service simulating events.
                  </p>
                </div>
                
                <div className="pt-4 border-t border-black/[0.04] dark:border-white/[0.04] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total Dispatches:</span>
                    <strong className="text-foreground font-mono">{(activeToolCall.result as any).total_sent}</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Failures:</span>
                    <strong className="text-red-600 dark:text-red-400 font-mono">{(activeToolCall.result as any).total_failed}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Default guide state */}
            {!activeToolCall && (
              <div className="space-y-4 text-xs text-muted-foreground leading-relaxed text-center py-10">
                <HelpCircle className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <p>
                  Context Visualizer reflects live cards based on what the Copilot executes.
                </p>
                <div className="p-3.5 rounded-2xl bg-black/[0.01] dark:bg-white/[0.01] border border-border text-left text-[11px] space-y-1.5 mb-6">
                  <span className="font-bold text-foreground block mb-0.5">Try asking:</span>
                  <span>1. "Find customers in Pune"</span>
                  <br />
                  <span>2. "Segment them as VIP Pune Shoppers"</span>
                  <br />
                  <span>3. "Draft a campaign message on WhatsApp"</span>
                </div>

                {/* AI Configuration Section */}
                <div className="mt-8 pt-5 border-t border-border text-left space-y-4">
                  <span className="text-[10px] text-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" /> AI Engine Configuration
                  </span>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground font-semibold block">Google Gemini API Key (Recommended)</span>
                      <Input
                        type="password"
                        placeholder="Paste Gemini Key..."
                        value={geminiKey}
                        onChange={(e) => handleSaveKeys('gemini', e.target.value)}
                        className="bg-black/[0.02] dark:bg-white/[0.02] border-border rounded-xl text-[10px] h-7 font-mono text-foreground"
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground font-semibold block">OpenAI API Key</span>
                      <Input
                        type="password"
                        placeholder="Paste OpenAI Key..."
                        value={openaiKey}
                        onChange={(e) => handleSaveKeys('openai', e.target.value)}
                        className="bg-black/[0.02] dark:bg-white/[0.02] border-border rounded-xl text-[10px] h-7 font-mono text-foreground"
                      />
                    </div>
                    
                    <div className="p-2.5 rounded-xl border border-border bg-black/[0.005] dark:bg-white/[0.005] flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Active Engine:</span>
                      <Badge variant="outline" className={`text-[9px] font-bold ${
                        aiModelProvider === 'mock' 
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25' 
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                      }`}>
                        {aiModelProvider === 'mock' ? 'MOCK AGENT FALLBACK' : `${aiModelProvider.toUpperCase()} ACTIVE`}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
