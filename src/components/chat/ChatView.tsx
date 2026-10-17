import React, { useState, useRef, useEffect } from 'react';
import { Message, SourceCitation } from '@/types';
import { ChatMessage } from './ChatMessage';
import { ragService } from '@/services/ragService';
import { DEMO_REPO_ID } from '@/services/repositoryService';
import { Send, Terminal, Sparkles, Loader2, AlertCircle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatViewProps {
  repositoryId: string;
  repositoryName: string;
  onSelectCitation?: (citation: SourceCitation) => void;
  onWhyClick?: (filePath: string, symbolName: string) => void;
  onImpactClick?: (filePath: string, symbolName: string) => void;
}

const DEMO_SUGGESTIONS = [
  'How does payment retry work?',
  'Why was Redis introduced?',
  'How does JWT session refresh work?',
  'What changed recently?',
  'What could break if I modify RetryService?',
];

const GENERAL_SUGGESTIONS = [
  'How does authentication work in this codebase?',
  'Where are primary API routes configured?',
  'What database queries are executed?',
  'What could break if I change this module?',
];

export function ChatView({
  repositoryId,
  repositoryName,
  onSelectCitation,
  onWhyClick,
  onImpactClick,
}: ChatViewProps) {
  const isDemoBenchmark = repositoryId === DEMO_REPO_ID;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Prevent repository context leakage: reset conversation state when repository changes
  useEffect(() => {
    setMessages([]);
    setInput('');
    setError(null);
    if (activeTimerRef.current) {
      clearInterval(activeTimerRef.current);
      activeTimerRef.current = null;
    }
  }, [repositoryId]);

  // Clean up any running timer on unmount
  useEffect(() => {
    return () => {
      if (activeTimerRef.current) {
        clearInterval(activeTimerRef.current);
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0 || isLoading) {
      scrollToBottom();
    }
  }, [messages, loadingStatus, isLoading]);

  const handleSubmit = async (queryText?: string) => {
    const q = (queryText || input).trim();
    if (!q || isLoading) return;

    setError(null);
    setInput('');

    const userMsg: Message = {
      id: 'usr-' + Date.now(),
      conversation_id: 'conv-' + repositoryId,
      role: 'user',
      content: q,
      sources: [],
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    const statuses = [
      'Searching repository code chunks...',
      'Retrieving relevant context...',
      'Checking Git history and PRs...',
      'Synthesizing grounded response...',
    ];

    let statusIdx = 0;
    setLoadingStatus(statuses[0]);
    if (activeTimerRef.current) clearInterval(activeTimerRef.current);
    activeTimerRef.current = setInterval(() => {
      statusIdx = (statusIdx + 1) % statuses.length;
      setLoadingStatus(statuses[statusIdx]);
    }, 800);

    try {
      const history = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const res = await ragService.askQuestion(repositoryId, q, history);

      if (activeTimerRef.current) {
        clearInterval(activeTimerRef.current);
        activeTimerRef.current = null;
      }
      setLoadingStatus('');

      const assistantMsg: Message = {
        id: 'ast-' + Date.now(),
        conversation_id: 'conv-' + repositoryId,
        role: 'assistant',
        content: res.answer,
        sources: res.sources,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      if (activeTimerRef.current) {
        clearInterval(activeTimerRef.current);
        activeTimerRef.current = null;
      }
      setLoadingStatus('');
      const msg = err instanceof Error ? err.message : 'Failed to complete question investigation.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const currentSuggestions = isDemoBenchmark ? DEMO_SUGGESTIONS : GENERAL_SUGGESTIONS;

  return (
    <div className="flex flex-col h-full bg-intel-bg border border-intel-border rounded-lg overflow-hidden">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-lg mx-auto space-y-4 my-auto">
            <div className="w-10 h-10 rounded-md bg-intel-surface border border-intel-border flex items-center justify-center text-intel-accent shadow-subtle">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-intel-text font-mono">
                Ask IntelCode
              </h3>
              <p className="text-sm text-intel-text-secondary mt-1.5 leading-relaxed">
                Investigate code, Git commits, pull requests, and architecture in{' '}
                <span className="font-mono text-intel-text font-medium">{repositoryName}</span>.
              </p>
            </div>

            <div className="w-full space-y-2 pt-2 text-left">
              <span className="text-xs font-semibold text-intel-muted uppercase tracking-wider font-mono block">
                {isDemoBenchmark ? 'Benchmark Sample Inquiries' : 'Suggested Questions'}
              </span>
              <div className="flex flex-col gap-1.5">
                {currentSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSubmit(suggestion)}
                    className="p-2.5 rounded-md bg-intel-surface border border-intel-border hover:border-intel-border-strong hover:bg-intel-raised text-xs sm:text-sm text-intel-text-secondary hover:text-intel-text text-left font-mono transition-colors flex items-center justify-between group"
                  >
                    <span>{suggestion}</span>
                    <Sparkles className="w-3.5 h-3.5 text-intel-muted group-hover:text-intel-accent shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onSelectCitation={onSelectCitation}
              onWhyClick={onWhyClick}
              onImpactClick={onImpactClick}
            />
          ))
        )}

        {isLoading && (
          <div className="flex items-center gap-3 py-3 px-4 rounded-md bg-intel-surface border border-intel-border/60 text-xs text-intel-text-secondary animate-fade-in w-fit">
            <Loader2 className="w-4 h-4 animate-spin text-intel-accent" />
            <span className="font-mono text-xs">{loadingStatus}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2.5 p-3.5 rounded bg-intel-error/10 border border-intel-error/20 text-xs sm:text-sm text-intel-error">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Questions Bar (When Conversation is Active) */}
      {messages.length > 0 && messages.length <= 4 && (
        <div className="px-4 sm:px-6 py-2 border-t border-intel-border/40 bg-intel-surface/40 flex items-center gap-2.5 overflow-x-auto select-none">
          <span className="text-xs text-intel-muted uppercase font-semibold flex items-center gap-1.5 shrink-0 font-mono">
            Follow up:
          </span>
          <div className="flex gap-2 flex-nowrap">
            {currentSuggestions.slice(0, 3).map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleSubmit(suggestion)}
                className="px-2.5 py-1 text-xs font-mono text-intel-text-secondary hover:text-intel-text bg-intel-surface hover:bg-intel-raised rounded border border-intel-border whitespace-nowrap transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Composer */}
      <div className="p-3 sm:p-4 bg-intel-surface border-t border-intel-border">
        <div className="relative flex flex-col rounded-md border border-intel-border bg-intel-bg focus-within:border-intel-accent transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask anything about ${repositoryName}...`}
            rows={2}
            className="w-full resize-none bg-transparent px-3.5 py-2.5 text-sm text-intel-text placeholder:text-intel-muted focus:outline-none"
          />

          <div className="flex items-center justify-between px-3.5 py-2 border-t border-intel-border/40 bg-intel-raised/30">
            <div className="text-xs text-intel-muted font-mono flex items-center gap-1.5">
              <span>Press</span>
              <kbd className="px-1.5 py-0.5 bg-intel-raised rounded border border-intel-border text-xs">
                ⌘/Ctrl + Enter
              </kbd>
              <span>to send</span>
            </div>

            <Button
              size="sm"
              disabled={!input.trim() || isLoading}
              isLoading={isLoading}
              onClick={() => handleSubmit()}
              className="h-8 px-3 text-xs gap-1.5"
            >
              <span>Ask</span>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
