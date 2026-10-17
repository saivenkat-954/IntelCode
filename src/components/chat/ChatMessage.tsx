import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, SourceCitation } from '@/types';
import { CitationCard } from './CitationCard';
import { Copy, Check, Terminal, User, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatMessageProps {
  message: Message;
  onSelectCitation?: (citation: SourceCitation) => void;
  onWhyClick?: (filePath: string, symbolName: string) => void;
  onImpactClick?: (filePath: string, symbolName: string) => void;
}

export function ChatMessage({
  message,
  onSelectCitation,
  onWhyClick,
  onImpactClick,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const copyContent = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end my-4 animate-fade-in">
        <div className="flex gap-3 max-w-[85%] md:max-w-[75%]">
          <div className="rounded-lg bg-intel-raised px-4 py-3 text-sm text-intel-text border border-intel-border/80 shadow-subtle leading-relaxed font-sans">
            {message.content}
          </div>
          <div className="w-8 h-8 rounded-md bg-intel-surface border border-intel-border flex items-center justify-center text-intel-text-secondary flex-shrink-0 mt-0.5">
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>
    );
  }

  // Extract first code citation to suggest Why / Impact if present
  const codeCitation = message.sources?.find((s) => s.type === 'code' && s.path);

  return (
    <div className="flex gap-3.5 my-5 animate-fade-in text-sm">
      <div className="w-8 h-8 rounded-md bg-intel-surface border border-intel-border flex items-center justify-center text-intel-accent flex-shrink-0 mt-0.5 shadow-subtle">
        <Terminal className="w-4 h-4" />
      </div>

      <div className="flex-1 space-y-3.5 min-w-0">
        <div className="flex items-center justify-between pb-1 border-b border-intel-border/40">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-intel-text text-sm tracking-tight">
              IntelCode Engine
            </span>
            <span className="px-2 py-0.5 text-xs bg-intel-accent/10 text-intel-accent rounded border border-intel-accent/20 font-mono">
              Grounded
            </span>
          </div>
          <button
            onClick={copyContent}
            className="p-1.5 text-intel-muted hover:text-intel-text rounded hover:bg-intel-raised transition-colors"
            title="Copy response"
          >
            {copied ? (
              <Check className="w-4 h-4 text-intel-success" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Formatted Markdown Content */}
        <div className="prose prose-invert max-w-none text-sm text-intel-text leading-relaxed space-y-3 font-sans">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }) => (
                <h1 className="text-base font-semibold text-intel-text mt-4 mb-2">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-sm font-semibold text-intel-text mt-3 mb-1.5">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-sm font-semibold text-intel-accent mt-2.5 mb-1">{children}</h3>
              ),
              p: ({ children }) => (
                <p className="text-intel-text leading-relaxed mb-2.5">{children}</p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc pl-5 space-y-1.5 text-intel-text-secondary my-2.5">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-5 space-y-1.5 text-intel-text-secondary my-2.5">
                  {children}
                </ol>
              ),
              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
              code: ({ children, className }) => {
                const isInline = !className;
                return isInline ? (
                  <code className="px-1.5 py-0.5 rounded bg-intel-surface border border-intel-border font-mono text-xs text-intel-text">
                    {children}
                  </code>
                ) : (
                  <pre className="p-3.5 my-2.5 rounded-md bg-intel-bg border border-intel-border overflow-x-auto font-mono text-xs leading-5 text-intel-text">
                    <code>{children}</code>
                  </pre>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* Feature Triggers: Why & Impact analysis */}
        {codeCitation && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-intel-border/40">
            <span className="text-xs text-intel-muted">Intelligence Actions:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onWhyClick?.(codeCitation.path!, codeCitation.title)}
              className="h-7 text-xs px-2.5"
            >
              Why does this exist?
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onImpactClick?.(codeCitation.path!, codeCitation.title)}
              className="h-7 text-xs px-2.5"
            >
              Impact Analysis
            </Button>
          </div>
        )}

        {/* Citations section */}
        {message.sources && message.sources.length > 0 && (
          <div className="pt-2">
            <div className="text-xs font-semibold text-intel-muted uppercase tracking-wider mb-2 font-mono">
              Source Citations ({message.sources.length})
            </div>
            <div className="flex flex-wrap gap-2.5">
              {message.sources.map((citation) => (
                <CitationCard
                  key={citation.id}
                  citation={citation}
                  onClick={onSelectCitation}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
