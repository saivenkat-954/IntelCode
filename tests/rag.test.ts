import { describe, it, expect } from 'vitest';
import { ragService } from '@/services/ragService';
import { DEMO_REPO_ID } from '@/services/repositoryService';

describe('RAG Retrieval & Intelligence Services', () => {
  const repoId = DEMO_REPO_ID;

  it('safely rejects queries for unknown repositories without fabricating data', async () => {
    const unknownId = '99999999-9999-9999-9999-999999999999';
    const res = await ragService.askQuestion(unknownId, 'How does payment retry work?');
    expect(res.answer).toContain('has no indexed files or commits');
    expect(res.sources.length).toBe(0);
  });

  it('retrieves grounded answers and valid clickable source citations for payment retry query', async () => {
    const res = await ragService.askQuestion(repoId, 'How does payment retry work?');

    expect(res.answer).toContain('RetryService');
    expect(res.sources.length).toBeGreaterThan(0);

    const codeSrc = res.sources.find((s) => s.type === 'code');
    expect(codeSrc).toBeDefined();
    expect(codeSrc?.path).toBe('src/payment/retry.ts');
    expect(codeSrc?.start_line).toBeDefined();

    const prSrc = res.sources.find((s) => s.type === 'pr');
    expect(prSrc).toBeDefined();
    expect(prSrc?.number).toBe(184);
  });

  it('answers "Why does this code exist?" by synthesizing code, PR, commit and issue', async () => {
    const why = await ragService.explainWhy(repoId, 'src/payment/retry.ts', 'RetryService');

    expect(why.symbolName).toBe('RetryService');
    expect(why.explanation).toContain('503');
    expect(why.originCommit?.sha).toContain('7a81d2f');
    expect(why.originPR?.github_number).toBe(184);
    expect(why.originIssue?.github_number).toBe(179);
  });

  it('performs impact analysis assessing blast radius of code changes', async () => {
    const impact = await ragService.analyzeImpact(repoId, 'src/payment/retry.ts', 'RetryService');

    expect(impact.confidence).toBe('high');
    expect(impact.affectedComponents.length).toBeGreaterThan(0);
    expect(impact.suggestedTests.length).toBeGreaterThan(0);
  });

  it('retrieves code evolution timeline with commit hashes', async () => {
    const history = await ragService.getCodeHistory(repoId, 'src/payment/retry.ts', 'RetryService');

    expect(history.length).toBeGreaterThan(0);
    expect(history[0].sha).toBe('7a81d2f');
    expect(history[0].diffSnippet).toBeDefined();
  });
});
