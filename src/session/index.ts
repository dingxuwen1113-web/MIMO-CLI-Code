// ── Session Module Exports ───────────────────────────────────────────────────
// Central export point for the SQLite-based session storage system.

// SQLite Store
export {
  SQLiteSessionStore,
  StoredSession,
  StoredMessage,
  StoredToolCall,
  SessionWithMessages,
  SessionStats,
  AddMessageOptions,
  AddToolCallOptions,
} from './sqlite-store';

// Compression
export {
  SessionCompressor,
  CompressionConfig,
  CompressionResult,
  CompressionTrigger,
  autoCompressIfNeeded,
} from './compression';

// Session Manager
export {
  SessionManager,
  SessionManagerConfig,
  TurnData,
  TurnToolCall,
  TimelineEntry,
  SessionTimeline,
  ExportedSession,
  MarkdownExport,
  BranchResult,
} from './manager';

// Rollback (existing)
export {
  SessionRollbackManager,
  TurnSnapshot,
  SessionFork,
  SessionTimelineEntry,
} from './rollback';
