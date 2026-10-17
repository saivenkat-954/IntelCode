import { describe, it, expect } from 'vitest';
import { repositoryService, DEMO_REPO_ID } from '@/services/repositoryService';
import { isFileIgnored } from '@/services/chunker';
import { ragService } from '@/services/ragService';

describe('Security Safeguards & Service Integrity', () => {
  describe('File Ingestion Safeguards (Secret Exclusion)', () => {
    it('blocks dangerous environment and secret credential files from being indexed', () => {
      const sensitiveFiles = [
        '.env',
        '.env.local',
        '.env.production',
        'config/credentials.json',
        'certs/server.pem',
        'keys/id_rsa',
        'keys/service-account.key',
        'node_modules/express/index.js',
        '.git/config',
        'dist/bundle.js',
        'bin/binary.exe',
        'archive.zip',
      ];

      for (const file of sensitiveFiles) {
        expect(isFileIgnored(file)).toBe(true);
      }
    });

    it('permits legitimate source and documentation files for indexing', () => {
      const validFiles = [
        'src/payment/retry.ts',
        'src/auth/session.py',
        'pkg/gateway/router.go',
        'README.md',
        'docs/ARCHITECTURE.md',
        'src/components/Header.tsx',
      ];

      for (const file of validFiles) {
        expect(isFileIgnored(file)).toBe(false);
      }
    });
  });

  describe('Repository Data Scoping & 404 Integrity', () => {
    it('strictly returns null when a non-existent repository ID is requested', async () => {
      const nonExistentId = '00000000-dead-beef-0000-000000000000';
      const repo = await repositoryService.getRepository(nonExistentId);
      expect(repo).toBeNull();
    });

    it('returns genuine empty file array for an unindexed or unknown repository', async () => {
      const unknownId = '99999999-9999-9999-9999-999999999999';
      const files = await repositoryService.getFiles(unknownId);
      expect(files).toEqual([]);
    });

    it('returns genuine empty commits array for an unknown repository', async () => {
      const unknownId = '99999999-9999-9999-9999-999999999999';
      const commits = await repositoryService.getCommits(unknownId);
      expect(commits).toEqual([]);
    });

    it('correctly retrieves the demo benchmark dataset only when DEMO_REPO_ID is requested', async () => {
      const demoRepo = await repositoryService.getRepository(DEMO_REPO_ID);
      expect(demoRepo).not.toBeNull();
      expect(demoRepo?.name).toBe('intel-gateway');
      expect(demoRepo?.owner).toBe('acme-org');

      const demoFiles = await repositoryService.getFiles(DEMO_REPO_ID);
      expect(demoFiles.length).toBeGreaterThan(0);
      expect(demoFiles.some((f) => f.path === 'src/payment/retry.ts')).toBe(true);
    });

    it('refuses to delete the protected demo benchmark repository', async () => {
      await expect(repositoryService.deleteRepository(DEMO_REPO_ID)).rejects.toThrow(
        'The benchmark demo repository is protected and cannot be deleted.'
      );
    });
  });

  describe('RAG Anti-Hallucination & Evidence Grounding', () => {
    it('refuses to fabricate answers for unindexed repositories', async () => {
      const emptyRepoId = '88888888-8888-8888-8888-888888888888';
      const res = await ragService.askQuestion(emptyRepoId, 'Where is authentication handled?');
      expect(res.answer).toContain('has no indexed files or commits');
      expect(res.sources).toHaveLength(0);
    });

    it('links genuine Git commit and PR evidence in explainWhy', async () => {
      const why = await ragService.explainWhy(
        DEMO_REPO_ID,
        'src/payment/retry.ts',
        'RetryService'
      );
      expect(why.symbolName).toBe('RetryService');
      expect(why.originCommit?.sha).toBe('7a81d2f');
      expect(why.originPR?.github_number).toBe(184);
      expect(why.explanation).toContain('PR #184');
    });

    it('discovers dependent consumers using static imports in analyzeImpact', async () => {
      const impact = await ragService.analyzeImpact(
        DEMO_REPO_ID,
        'src/payment/retry.ts',
        'RetryService'
      );
      expect(impact.affectedComponents.length).toBeGreaterThan(0);
      const indexConsumer = impact.affectedComponents.find((c) => c.filePath === 'src/index.ts');
      expect(indexConsumer).toBeDefined();
      expect(impact.confidence).toBe('high');
    });
  });
});
