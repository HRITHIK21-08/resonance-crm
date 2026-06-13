'use client';

import { useState, useCallback, useRef } from 'react';
import { CopilotMessage, ToolCall } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export function useCopilot() {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;
    
    setError(null);
    const userMessage: CopilotMessage = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const assistantMessage: CopilotMessage = {
      role: 'assistant',
      content: '',
      tool_calls: [],
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    try {
      abortControllerRef.current = new AbortController();
      
      const res = await fetch(`${API_BASE}/api/copilot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content.trim(),
          history: messages.map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      // Check if it's a streaming response
      const contentType = res.headers.get('content-type');
      
      if (contentType?.includes('text/event-stream') || contentType?.includes('text/plain')) {
        // Handle streaming response
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');
        
        const decoder = new TextDecoder();
        let fullContent = '';
        const toolCalls: ToolCall[] = [];

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(l => l.trim());
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                if (parsed.type === 'content') {
                  fullContent += parsed.content;
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      updated[updated.length - 1] = { ...last, content: fullContent };
                    }
                    return updated;
                  });
                } else if (parsed.type === 'tool_call') {
                  const tc: ToolCall = {
                    name: parsed.name,
                    args: parsed.args || {},
                    status: 'pending',
                  };
                  toolCalls.push(tc);
                  setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      updated[updated.length - 1] = { ...last, tool_calls: [...toolCalls] };
                    }
                    return updated;
                  });
                } else if (parsed.type === 'tool_result') {
                  const idx = toolCalls.findIndex(t => t.name === parsed.name);
                  if (idx >= 0) {
                    toolCalls[idx] = { ...toolCalls[idx], result: parsed.result, status: 'completed' };
                    setMessages(prev => {
                      const updated = [...prev];
                      const last = updated[updated.length - 1];
                      if (last.role === 'assistant') {
                        updated[updated.length - 1] = { ...last, tool_calls: [...toolCalls] };
                      }
                      return updated;
                    });
                  }
                }
              } catch {
                // Not JSON, treat as raw text
                fullContent += data;
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, content: fullContent };
                  }
                  return updated;
                });
              }
            }
          }
        }
      } else {
        // Handle JSON response
        const data = await res.json();
        const responseContent = data.response || data.content || data.message || JSON.stringify(data);
        const responseTc: ToolCall[] = (data.tool_calls || []).map((tc: Record<string, unknown>) => ({
          name: tc.name || tc.tool || '',
          args: tc.args || tc.arguments || {},
          result: tc.result,
          status: tc.result ? 'completed' : 'pending',
        }));

        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: responseContent,
            tool_calls: responseTc.length > 0 ? responseTc : undefined,
            timestamp: new Date().toISOString(),
          };
          return updated;
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `I encountered an error: ${errorMessage}. Please try again.`,
          timestamp: new Date().toISOString(),
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [isLoading, messages]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    stopGeneration,
  };
}
