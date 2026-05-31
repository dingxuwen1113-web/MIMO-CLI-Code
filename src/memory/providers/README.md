# Pluggable Memory Provider System

The memory provider system allows MIMO CLI to use different storage backends for memories.

## Available Providers

### 1. File Provider (`file`)
- Stores memories as Markdown files with YAML frontmatter
- Location: `~/.mimo/memory/`
- Maintains `MEMORY.md` index file
- Best for: Small to medium memory collections, human-readable format

### 2. SQLite Provider (`sqlite`)
- Uses better-sqlite3 for synchronous operations
- FTS5 full-text search with Porter stemming
- WAL mode for concurrent access
- Location: `~/.mimo/memory.db`
- Best for: Large memory collections, fast full-text search

## Usage

### Basic Usage

```typescript
import { getMemoryProvider } from './memory/providers';

// Get default provider (file-based)
const provider = await getMemoryProvider();

// Or specify a provider
const sqliteProvider = await getMemoryProvider({ type: 'sqlite' });
```

### Creating Memories

```typescript
const memory = await provider.save({
  id: 'my-preference-1',
  type: 'user',
  name: 'Coding Style',
  description: 'User prefers functional programming',
  content: 'I prefer using functional programming patterns with immutable data structures.'
});
```

### Searching Memories

```typescript
// Simple keyword search
const results = await provider.search('functional programming');

// Search with options
const results = await provider.search('TypeScript', {
  types: ['project', 'reference'],
  limit: 5
});

// Results include score and highlights
results.forEach(result => {
  console.log(`${result.entry.name}: ${result.score}`);
  console.log(`Highlights: ${result.highlights?.join(', ')}`);
});
```

### Listing and Filtering

```typescript
// List all memories
const allMemories = await provider.list();

// Filter by type
const userMemories = await provider.list(['user']);
const projectMemories = await provider.list(['project', 'reference']);
```

### Reading and Updating

```typescript
// Read a specific memory
const memory = await provider.read('my-preference-1');

// Update a memory
const updated = await provider.update('my-preference-1', {
  content: 'Updated preference content',
  description: 'Updated description'
});
```

### Export and Import

```typescript
// Export all memories
const allMemories = await provider.exportAll();
const json = JSON.stringify(allMemories, null, 2);

// Import memories
const count = await provider.importAll(allMemories);
console.log(`Imported ${count} memories`);
```

## Provider Registry

Use the registry to manage multiple providers:

```typescript
import { getMemoryRegistry } from './memory/providers';

const registry = getMemoryRegistry();

// List available providers
console.log(registry.listProviders()); // ['file', 'sqlite']

// Switch providers
const provider = await registry.switchProvider('sqlite');

// Set fallback chain
registry.setFallbackChain(['sqlite', 'file']);
```

## Integration with Existing Code

Replace `MemoryStore` usage with the new provider system:

```typescript
// Old way
import { MemoryStore } from '../memory/store';
const memory = new MemoryStore(basePath);

// New way
import { getMemoryProvider } from '../memory/providers';
const memory = await getMemoryProvider({ type: 'sqlite' });
```

## Features

Both providers include:
- ✅ Credential sanitization (API keys, tokens, passwords)
- ✅ Full CRUD operations
- ✅ Search with scoring
- ✅ Export/Import functionality
- ✅ Type filtering
- ✅ Automatic initialization

SQLite provider additionally includes:
- ✅ FTS5 full-text search with Porter stemming
- ✅ WAL mode for concurrent access
- ✅ Automatic indexing
- ✅ Transaction support for bulk imports

## Configuration

Providers use default paths:
- File: `~/.mimo/memory/`
- SQLite: `~/.mimo/memory.db`

Custom paths can be passed to provider constructors.

## Testing

Run the test script to verify providers work:

```bash
npx tsx src/memory/providers/test.ts
```
