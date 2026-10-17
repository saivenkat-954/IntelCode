import React, { useRef, useEffect } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import { useTheme } from '@/hooks/useTheme';

interface CodeViewerProps {
  code: string;
  language: string;
  filePath?: string;
  highlightRange?: {
    startLine: number;
    endLine: number;
  };
  onLineClick?: (lineNumber: number) => void;
}

export function CodeViewer({
  code,
  language,
  filePath,
  highlightRange,
  onLineClick,
}: CodeViewerProps) {
  const { theme } = useTheme();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Apply custom themes matching IntelCode design tokens
    monaco.editor.defineTheme('intelcode-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '68707D', fontStyle: 'italic' },
        { token: 'keyword', foreground: '6E8BFF', fontStyle: 'bold' },
        { token: 'string', foreground: '39B982' },
        { token: 'number', foreground: 'E6A23C' },
        { token: 'type', foreground: '829BFF' },
      ],
      colors: {
        'editor.background': '#0B0D10',
        'editor.foreground': '#F5F7FA',
        'editor.lineHighlightBackground': '#171A20',
        'editorLineNumber.foreground': '#68707D',
        'editorLineNumber.activeForeground': '#F5F7FA',
        'editor.selectionBackground': '#6E8BFF33',
        'editorCursor.foreground': '#6E8BFF',
      },
    });

    monaco.editor.defineTheme('intelcode-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
        { token: 'keyword', foreground: '2563EB', fontStyle: 'bold' },
        { token: 'string', foreground: '059669' },
        { token: 'number', foreground: 'D97706' },
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#0F172A',
        'editor.lineHighlightBackground': '#F1F5F9',
        'editorLineNumber.foreground': '#94A3B8',
        'editorLineNumber.activeForeground': '#0F172A',
        'editor.selectionBackground': '#3B82F622',
        'editorCursor.foreground': '#3B82F6',
      },
    });

    monaco.editor.setTheme(theme === 'dark' ? 'intelcode-dark' : 'intelcode-light');

    if (onLineClick) {
      editor.onMouseDown((e) => {
        if (e.target.position) {
          onLineClick(e.target.position.lineNumber);
        }
      });
    }

    applyHighlight();
  };

  const applyHighlight = () => {
    if (!editorRef.current || !monacoRef.current) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    if (highlightRange && highlightRange.startLine > 0) {
      const range = new monaco.Range(
        highlightRange.startLine,
        1,
        highlightRange.endLine || highlightRange.startLine,
        1
      );

      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
        {
          range,
          options: {
            isWholeLine: true,
            className: 'bg-intel-accent/15 border-l-2 border-intel-accent',
            linesDecorationsClassName: 'bg-intel-accent/30',
          },
        },
      ]);

      editor.revealLineInCenter(highlightRange.startLine);
    } else {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
    }
  };

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(theme === 'dark' ? 'intelcode-dark' : 'intelcode-light');
    }
  }, [theme]);

  useEffect(() => {
    applyHighlight();
  }, [highlightRange, code]);

  const mapLanguage = (lang: string) => {
    const l = lang.toLowerCase();
    if (l === 'typescript' || l === 'ts' || l === 'tsx') return 'typescript';
    if (l === 'javascript' || l === 'js' || l === 'jsx') return 'javascript';
    if (l === 'python' || l === 'py') return 'python';
    if (l === 'go' || l === 'golang') return 'go';
    if (l === 'markdown' || l === 'md') return 'markdown';
    if (l === 'json') return 'json';
    return 'plaintext';
  };

  return (
    <div className="w-full h-full flex flex-col bg-intel-bg border border-intel-border rounded-lg overflow-hidden">
      {filePath && (
        <div className="flex items-center justify-between px-3.5 py-1.5 bg-intel-surface border-b border-intel-border text-xs text-intel-text-secondary select-none">
          <div className="flex items-center gap-2 font-mono">
            <span>{filePath}</span>
            {highlightRange && highlightRange.startLine > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] bg-intel-accent/10 text-intel-accent rounded border border-intel-accent/20">
                Lines {highlightRange.startLine}–{highlightRange.endLine}
              </span>
            )}
          </div>
          <div className="text-[11px] text-intel-muted uppercase font-mono tracking-wider">
            {language}
          </div>
        </div>
      )}
      <div className="flex-1 w-full relative min-h-[350px]">
        <Editor
          height="100%"
          language={mapLanguage(language)}
          value={code}
          theme={theme === 'dark' ? 'intelcode-dark' : 'intelcode-light'}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 12.5,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            lineHeight: 20,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'all',
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 12, bottom: 12 },
          }}
          onMount={handleEditorDidMount}
        />
      </div>
    </div>
  );
}
