import { describe, it, expect } from 'vitest';
import { isFileIgnored, extractSymbolsAndChunks } from '@/services/chunker';

describe('Security Filtering & Secret Scanning', () => {
  it('strictly ignores sensitive files containing secrets and keys', () => {
    expect(isFileIgnored('.env')).toBe(true);
    expect(isFileIgnored('.env.production')).toBe(true);
    expect(isFileIgnored('src/config/.env.local')).toBe(true);
    expect(isFileIgnored('server.key')).toBe(true);
    expect(isFileIgnored('id_rsa')).toBe(true);
    expect(isFileIgnored('credentials.json')).toBe(true);
    expect(isFileIgnored('node_modules/express/index.js')).toBe(true);
    expect(isFileIgnored('.git/config')).toBe(true);
    expect(isFileIgnored('dist/bundle.js')).toBe(true);
  });

  it('allows safe source code files', () => {
    expect(isFileIgnored('src/payment/retry.ts')).toBe(false);
    expect(isFileIgnored('src/auth/session.ts')).toBe(false);
    expect(isFileIgnored('README.md')).toBe(false);
    expect(isFileIgnored('docs/ARCHITECTURE.md')).toBe(false);
  });
});

describe('AST Smart Code Chunking', () => {
  it('extracts TypeScript classes, methods, and functions with start and end lines', () => {
    const tsCode = `export interface RetryOptions {
  maxRetries: number;
}

export class RetryService {
  async execute() {
    return true;
  }
}

export function helperFunction() {
  return 42;
}`;

    const symbols = extractSymbolsAndChunks('src/payment/retry.ts', tsCode, 'typescript');

    expect(symbols.length).toBeGreaterThanOrEqual(2);

    const retryClass = symbols.find((s) => s.symbolName === 'RetryService');
    expect(retryClass).toBeDefined();
    expect(retryClass?.symbolType).toBe('class');
    expect(retryClass?.startLine).toBe(5);

    const iface = symbols.find((s) => s.symbolName === 'RetryOptions');
    expect(iface).toBeDefined();
    expect(iface?.symbolType).toBe('interface');
  });

  it('handles small or unsupported files gracefully by creating module chunk', () => {
    const raw = `console.log("hello world");`;
    const symbols = extractSymbolsAndChunks('src/index.ts', raw, 'typescript');
    expect(symbols.length).toBe(1);
    expect(symbols[0].symbolType).toBe('module');
  });
});
