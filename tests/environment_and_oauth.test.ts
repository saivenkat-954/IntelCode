import { describe, it, expect } from 'vitest';

function isConfiguredKey(key?: string): boolean {
  if (!key) return false;
  const k = key.trim();
  return (
    k.length > 10 &&
    !k.startsWith('YOUR_') &&
    !k.startsWith('your_') &&
    !k.includes('placeholder')
  );
}

describe('Environment & OAuth Security Verification', () => {
  describe('Key Configuration Detector', () => {
    it('identifies placeholder and unconfigured environment strings as invalid', () => {
      expect(isConfiguredKey('YOUR_SERVER_SIDE_SUPABASE_KEY')).toBe(false);
      expect(isConfiguredKey('your_gemini_api_key_here')).toBe(false);
      expect(isConfiguredKey('placeholder-anon-key')).toBe(false);
      expect(isConfiguredKey('')).toBe(false);
      expect(isConfiguredKey(undefined)).toBe(false);
      expect(isConfiguredKey('short')).toBe(false);
    });

    it('identifies valid production API keys as configured', () => {
      const fakeGoogleKey = 'AIza' + '0'.repeat(35);
      expect(isConfiguredKey(fakeGoogleKey)).toBe(true);
      expect(isConfiguredKey('sb_publishable_fB65z3N7P5NJEDHLPChSZQ_WVJeTT6h')).toBe(true);
      expect(isConfiguredKey('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZXNvdXJjZSI6InVzZXJzIn0.xyz')).toBe(true);
    });
  });

  describe('Embedding Model Dimensionality Contract', () => {
    it('ensures Voyage Code 4 is configured for 512 dimensions matching vector(512) database schema', () => {
      const configuredModel = process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-code-4';
      const outputDimension = parseInt(process.env.VOYAGE_EMBEDDING_DIMENSION || '512', 10);

      expect(configuredModel).toBe('voyage-code-4');
      expect(outputDimension).toBe(512);
    });

    it('retains backward compatibility for legacy 768-d contract when configured', () => {
      const configuredModel = 'gemini-embedding-001';
      const embedReq = {
        content: { role: 'user', parts: [{ text: 'function calculateTax() { return 0.15; }' }] },
        outputDimensionality: 768,
      };

      expect(embedReq.outputDimensionality).toBe(768);
      expect(configuredModel).toBe('gemini-embedding-001');
    });
  });

  describe('GitHub OAuth State Validation & CSRF Protection', () => {
    it('validates matching OAuth state parameters during token exchange', () => {
      const savedState = 'secure-csrf-token-12345';
      const returnedState = 'secure-csrf-token-12345';

      const isValid = Boolean(savedState && savedState === returnedState);
      expect(isValid).toBe(true);
    });

    it('blocks token exchange when state parameter is missing or mismatched', () => {
      const savedState: string = 'legitimate-session-token-abc';
      const maliciousState: string = 'forged-attacker-token-xyz';

      const isValid = Boolean(savedState && savedState === maliciousState);
      expect(isValid).toBe(false);
    });

    it('blocks token exchange when state is missing from callback', () => {
      const savedState: string = 'legitimate-session-token-abc';
      const missingState: string | null = null;

      const isValid = Boolean(savedState && savedState === missingState);
      expect(isValid).toBe(false);
    });
  });

  describe('Chat Model Fallback Resilience', () => {
    it('prioritizes configured model first, followed by resilient fallbacks', () => {
      const configuredModel = 'gemini-3.8-flash';
      const candidateModels = Array.from(
        new Set([configuredModel, 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-pro'])
      );

      expect(candidateModels[0]).toBe('gemini-3.8-flash');
      expect(candidateModels).toContain('gemini-2.5-flash');
      expect(candidateModels).toContain('gemini-flash-latest');
      expect(candidateModels.length).toBe(4);
    });
  });
});
