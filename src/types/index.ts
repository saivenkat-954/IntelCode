export type SymbolType =
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'module'
  | 'constant'
  | 'block';

export interface UserProfile {
  id: string;
  user_id: string;
  email?: string;
  full_name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Repository {
  id: string;
  user_id: string;
  github_repo_id?: number | string;
  owner: string;
  name: string;
  full_name: string;
  default_branch: string;
  description?: string;
  language?: string;
  is_private: boolean;
  files_count: number;
  chunks_count: number;
  status: 'idle' | 'indexing' | 'ready' | 'failed' | 'paused';
  last_indexed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FileItem {
  id: string;
  repository_id: string;
  path: string;
  language: string;
  sha?: string;
  content: string;
  size: number;
  created_at: string;
  updated_at: string;
}

export interface CodeChunk {
  id: string;
  repository_id: string;
  file_id: string;
  file_path?: string;
  content: string;
  language: string;
  symbol_name?: string;
  symbol_type?: SymbolType;
  start_line: number;
  end_line: number;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CommitItem {
  id: string;
  repository_id: string;
  sha: string;
  message: string;
  author: string;
  timestamp: string;
  diff?: string;
  changed_files: string[];
}

export interface PullRequestItem {
  id: string;
  repository_id: string;
  github_number: number;
  title: string;
  description: string;
  author: string;
  state: 'open' | 'closed' | 'merged';
  diff?: string;
  created_at: string;
  merged_at?: string;
}

export interface IssueItem {
  id: string;
  repository_id: string;
  github_number: number;
  title: string;
  body: string;
  author: string;
  state: 'open' | 'closed';
  labels: string[];
  created_at: string;
  closed_at?: string;
}

export interface DocumentItem {
  id: string;
  repository_id: string;
  path: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface SourceCitation {
  id: string;
  type: 'code' | 'commit' | 'pr' | 'issue' | 'doc';
  title: string;
  subtitle?: string;
  path?: string;
  start_line?: number;
  end_line?: number;
  sha?: string;
  number?: number;
  score?: number;
  preview?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources: SourceCitation[];
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  repository_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface IndexingJob {
  id: string;
  repository_id: string;
  status: 'pending' | 'fetching' | 'chunking' | 'embedding' | 'saving' | 'completed' | 'failed' | 'paused';
  progress: number;
  files_processed: number;
  chunks_created: number;
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface WhyAnalysisResult {
  codeSnippet: string;
  filePath: string;
  symbolName: string;
  explanation: string;
  originCommit?: CommitItem;
  originPR?: PullRequestItem;
  originIssue?: IssueItem;
  historicalContext: string;
}

export interface ImpactAnalysisResult {
  symbolName: string;
  filePath: string;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  affectedComponents: {
    name: string;
    filePath: string;
    reason: string;
    criticality: 'high' | 'medium' | 'low';
  }[];
  suggestedTests: string[];
}

export interface CodeHistoryItem {
  sha: string;
  commitMessage: string;
  author: string;
  date: string;
  changeSummary: string;
  diffSnippet: string;
}
