import { SymbolType } from '../types';

export const INDEX_VERSION = 'v2-ast-smart';

// Strict file and path exclusion patterns to protect secrets and ignore noise
export const IGNORED_PATTERNS = [
  /node_modules/,
  /\.git(\/|\\|$)/,
  /\.env(\.|$|_|-|[a-z0-9]|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /credentials\.json/i,
  /dist(\/|\\|$)/,
  /build(\/|\\|$)/,
  /coverage(\/|\\|$)/,
  /\.DS_Store/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.(png|jpe?g|gif|svg|ico|pdf|zip|tar|gz|woff2?|eot|ttf|mp4|webm|exe|bin|dll|so|dylib)$/i,
];

export function isFileIgnored(filePath: string): boolean {
  return IGNORED_PATTERNS.some((pattern) => pattern.test(filePath));
}

export interface ExtractedSymbol {
  symbolName: string;
  symbolType: SymbolType;
  startLine: number;
  endLine: number;
  content: string;
}

export interface CodeChunkCandidate {
  filePath: string;
  symbolName: string;
  symbolType: SymbolType;
  startLine: number;
  endLine: number;
  content: string;
  language: string;
  metadata: Record<string, any>;
}

/**
 * Extracts AST symbols (classes, functions, interfaces, types) from code lines.
 * Retains backward compatibility with tests and UI components.
 */
export function extractSymbolsAndChunks(
  filePath: string,
  content: string,
  language: string
): ExtractedSymbol[] {
  if (isFileIgnored(filePath) || !content || !content.trim()) return [];

  const lines = content.split('\n');
  const symbols: ExtractedSymbol[] = [];
  const lang = (language || '').toLowerCase();

  if (['typescript', 'javascript', 'ts', 'js', 'tsx', 'jsx', 'java', 'c++', 'cpp', 'c', 'rust', 'rs'].includes(lang)) {
    // Regex patterns for C-style languages
    const classRegex = /^(?:export\s+)?(?:default\s+)?(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/;
    const interfaceRegex = /^(?:export\s+)?(?:public\s+)?interface\s+([A-Za-z0-9_$]+)/;
    const typeRegex = /^(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/;
    const funcRegex = /^(?:export\s+)?(?:async\s+)?(?:public\s+|private\s+|protected\s+)?(?:static\s+)?function\s+([A-Za-z0-9_$]+)/;
    const arrowFuncRegex = /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/;
    const rustFnRegex = /^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip comment lines
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
        continue;
      }

      let match = line.match(classRegex);
      if (match) {
        const endLine = findBlockEnd(lines, i);
        symbols.push({
          symbolName: match[1],
          symbolType: 'class',
          startLine: i + 1,
          endLine: endLine + 1,
          content: lines.slice(i, endLine + 1).join('\n'),
        });
        continue;
      }

      match = line.match(interfaceRegex);
      if (match) {
        const endLine = findBlockEnd(lines, i);
        symbols.push({
          symbolName: match[1],
          symbolType: 'interface',
          startLine: i + 1,
          endLine: endLine + 1,
          content: lines.slice(i, endLine + 1).join('\n'),
        });
        continue;
      }

      match = line.match(typeRegex);
      if (match) {
        symbols.push({
          symbolName: match[1],
          symbolType: 'type',
          startLine: i + 1,
          endLine: i + 1,
          content: line,
        });
        continue;
      }

      match = line.match(funcRegex) || line.match(arrowFuncRegex) || line.match(rustFnRegex);
      if (match) {
        const endLine = findBlockEnd(lines, i);
        symbols.push({
          symbolName: match[1],
          symbolType: 'function',
          startLine: i + 1,
          endLine: endLine + 1,
          content: lines.slice(i, endLine + 1).join('\n'),
        });
        continue;
      }
    }
  } else if (['python', 'py'].includes(lang)) {
    const pyDef = /^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/;
    const pyClass = /^class\s+([A-Za-z0-9_]+)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('#')) continue;

      const defMatch = trimmed.match(pyDef);
      const classMatch = trimmed.match(pyClass);

      if (defMatch || classMatch) {
        const name = defMatch ? defMatch[1] : classMatch![1];
        const type: SymbolType = defMatch ? 'function' : 'class';
        const indent = line.search(/\S/);
        let endLine = i;

        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim().length === 0) continue;
          const nextIndent = lines[j].search(/\S/);
          if (nextIndent <= indent) {
            endLine = j - 1;
            break;
          }
          endLine = j;
        }

        symbols.push({
          symbolName: name,
          symbolType: type,
          startLine: i + 1,
          endLine: endLine + 1,
          content: lines.slice(i, endLine + 1).join('\n'),
        });
      }
    }
  } else if (['go', 'golang'].includes(lang)) {
    const goFunc = /^func\s+(?:\([A-Za-z0-9_\s*]+\)\s*)?([A-Za-z0-9_]+)\s*\(/;
    const goType = /^type\s+([A-Za-z0-9_]+)\s+(?:struct|interface)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//')) continue;

      const funcMatch = line.match(goFunc);
      const typeMatch = line.match(goType);

      if (funcMatch || typeMatch) {
        const name = funcMatch ? funcMatch[1] : typeMatch![1];
        const type: SymbolType = funcMatch ? 'function' : 'class';
        const endLine = findBlockEnd(lines, i);

        symbols.push({
          symbolName: name,
          symbolType: type,
          startLine: i + 1,
          endLine: endLine + 1,
          content: lines.slice(i, endLine + 1).join('\n'),
        });
      }
    }
  }

  // Fallback module chunk if no symbols extracted
  if (symbols.length === 0 && lines.length > 0) {
    symbols.push({
      symbolName: filePath.split('/').pop() || 'file',
      symbolType: 'module',
      startLine: 1,
      endLine: lines.length,
      content: content.slice(0, 3000),
    });
  }

  return symbols;
}

/**
 * Finds the matching end line for a code block, respecting string literals
 * and line comments so braces inside strings or comments don't corrupt counts.
 */
function findBlockEnd(lines: string[], startIndex: number): number {
  let openBraces = 0;
  let hasFoundFirstBrace = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inTemplate = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const prev = j > 0 ? line[j - 1] : '';

      // Skip escaped characters
      if (prev === '\\') continue;

      // Check comments
      if (!inSingleQuote && !inDoubleQuote && !inTemplate) {
        if (char === '/' && line[j + 1] === '/') {
          // Line comment rest of line
          break;
        }
      }

      // Check quotes
      if (char === "'" && !inDoubleQuote && !inTemplate) {
        inSingleQuote = !inSingleQuote;
        continue;
      }
      if (char === '"' && !inSingleQuote && !inTemplate) {
        inDoubleQuote = !inDoubleQuote;
        continue;
      }
      if (char === '`' && !inSingleQuote && !inDoubleQuote) {
        inTemplate = !inTemplate;
        continue;
      }

      // If inside string, ignore braces
      if (inSingleQuote || inDoubleQuote || inTemplate) {
        continue;
      }

      if (char === '{') {
        openBraces++;
        hasFoundFirstBrace = true;
      } else if (char === '}') {
        openBraces--;
        if (hasFoundFirstBrace && openBraces <= 0) {
          return i;
        }
      }
    }
  }

  return Math.min(startIndex + 60, lines.length - 1);
}

/**
 * Comprehensive code-aware chunking function used by the real ingestion handler.
 * Preserves source paths, language, symbols, and exact line ranges.
 * Ensures 100% code coverage without losing top-level or interstitial lines.
 */
export function extractCodeAwareChunks(
  filePath: string,
  content: string,
  language = 'text'
): CodeChunkCandidate[] {
  if (isFileIgnored(filePath) || !content || !content.trim()) return [];

  const lines = content.split('\n');
  const baseName = filePath.split('/').pop() || 'symbol';
  const lang = (language || '').toLowerCase();

  // 1. Markdown documents: chunk by headings (#, ##, ###)
  if (lang === 'markdown' || filePath.endsWith('.md')) {
    const mdChunks: CodeChunkCandidate[] = [];
    let sectionStart = 0;
    let currentTitle = baseName;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headerMatch && i > sectionStart) {
        const chunkText = lines.slice(sectionStart, i).join('\n').trim();
        if (chunkText) {
          mdChunks.push({
            filePath,
            symbolName: currentTitle,
            symbolType: 'module',
            startLine: sectionStart + 1,
            endLine: i,
            content: chunkText,
            language: 'markdown',
            metadata: { index_version: INDEX_VERSION, section: currentTitle },
          });
        }
        sectionStart = i;
        currentTitle = headerMatch[2].trim();
      }
    }

    const remainingText = lines.slice(sectionStart).join('\n').trim();
    if (remainingText) {
      mdChunks.push({
        filePath,
        symbolName: currentTitle,
        symbolType: 'module',
        startLine: sectionStart + 1,
        endLine: lines.length,
        content: remainingText,
        language: 'markdown',
        metadata: { index_version: INDEX_VERSION, section: currentTitle },
      });
    }

    return finalizeChunkMetadata(mdChunks);
  }

  // 2. Extract AST symbols (classes, methods, functions, interfaces, types)
  const rawSymbols = extractSymbolsAndChunks(filePath, content, lang);
  const candidates: CodeChunkCandidate[] = [];

  // Sort symbols by start line
  const validSymbols = rawSymbols
    .filter((s) => s.symbolType !== 'module')
    .sort((a, b) => a.startLine - b.startLine);

  if (validSymbols.length > 0) {
    let currentLine = 1;

    for (const sym of validSymbols) {
      // If there are top-level or interstitial lines before this symbol, capture them as a block
      if (sym.startLine > currentLine) {
        const gapLines = lines.slice(currentLine - 1, sym.startLine - 1);
        const gapText = gapLines.join('\n').trim();
        if (gapText.length > 0) {
          candidates.push({
            filePath,
            symbolName: baseName,
            symbolType: 'block',
            startLine: currentLine,
            endLine: sym.startLine - 1,
            content: gapLines.join('\n'),
            language: lang,
            metadata: { index_version: INDEX_VERSION },
          });
        }
      }

      // If symbol itself is huge (> 100 lines), break it into sequential parts to preserve embedding quality
      if (sym.endLine - sym.startLine > 100) {
        const symLines = lines.slice(sym.startLine - 1, sym.endLine);
        const chunkSize = 60;
        let part = 1;
        for (let s = 0; s < symLines.length; s += chunkSize) {
          const e = Math.min(s + chunkSize, symLines.length);
          const partText = symLines.slice(s, e).join('\n');
          if (partText.trim()) {
            candidates.push({
              filePath,
              symbolName: `${sym.symbolName} (part ${part})`,
              symbolType: sym.symbolType,
              startLine: sym.startLine + s,
              endLine: sym.startLine + e - 1,
              content: partText,
              language: lang,
              metadata: { index_version: INDEX_VERSION, symbol: sym.symbolName, part },
            });
            part++;
          }
        }
      } else {
        candidates.push({
          filePath,
          symbolName: sym.symbolName,
          symbolType: sym.symbolType,
          startLine: sym.startLine,
          endLine: sym.endLine,
          content: lines.slice(sym.startLine - 1, sym.endLine).join('\n'),
          language: lang,
          metadata: { index_version: INDEX_VERSION, symbol: sym.symbolName },
        });
      }

      currentLine = Math.max(currentLine, sym.endLine + 1);
    }

    // Capture any trailing lines after the last symbol
    if (currentLine <= lines.length) {
      const trailingLines = lines.slice(currentLine - 1);
      const trailingText = trailingLines.join('\n').trim();
      if (trailingText.length > 0) {
        candidates.push({
          filePath,
          symbolName: baseName,
          symbolType: 'block',
          startLine: currentLine,
          endLine: lines.length,
          content: trailingLines.join('\n'),
          language: lang,
          metadata: { index_version: INDEX_VERSION },
        });
      }
    }

    return finalizeChunkMetadata(candidates);
  }

  // 3. Fallback for non-symbol files or scripts: logical line-block chunking (60 lines)
  const chunkSize = 60;
  for (let startLine = 0; startLine < lines.length; startLine += chunkSize) {
    const endLine = Math.min(startLine + chunkSize, lines.length);
    const chunkText = lines.slice(startLine, endLine).join('\n');
    if (!chunkText.trim()) continue;

    candidates.push({
      filePath,
      symbolName: baseName,
      symbolType: lines.length <= chunkSize ? 'module' : 'block',
      startLine: startLine + 1,
      endLine,
      content: chunkText,
      language: lang,
      metadata: { index_version: INDEX_VERSION },
    });
  }

  return finalizeChunkMetadata(candidates);
}

function finalizeChunkMetadata(chunks: CodeChunkCandidate[]): CodeChunkCandidate[] {
  const total = chunks.length;
  chunks.forEach((c, idx) => {
    c.metadata = {
      ...c.metadata,
      index_version: INDEX_VERSION,
      total_chunks: total,
      chunk_index: idx + 1,
    };
  });
  return chunks;
}
