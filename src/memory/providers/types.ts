export interface MemoryEntry {
  id: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  name: string;
  description: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;
  highlights?: string[];
}

export interface MemoryProvider {
  readonly name: string;
  init(): Promise<void>;
  list(types?: string[]): Promise<MemoryEntry[]>;
  read(id: string): Promise<MemoryEntry | null>;
  save(entry: Omit<MemoryEntry, 'createdAt' | 'updatedAt'>): Promise<MemoryEntry>;
  update(id: string, updates: Partial<MemoryEntry>): Promise<MemoryEntry>;
  remove(id: string): Promise<boolean>;
  search(query: string, options?: { types?: string[]; limit?: number }): Promise<MemorySearchResult[]>;
  exportAll(): Promise<MemoryEntry[]>;
  importAll(entries: MemoryEntry[]): Promise<number>;
  cleanup(): Promise<void>;
}
