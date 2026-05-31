// ── Feature 7: Contextual Relevance Decay ────────────
import { FeatureModule } from '../registry';

interface ScoredMessage {
  role: string;
  content: string;
  timestamp: number;
  relevanceScore: number;
  topicVector: string[];
}

class RelevanceDecayEngine {
  private currentTopic: string[] = [];
  private readonly DECAY_RATE = 0.95;
  private readonly HALF_LIFE_MS = 10 * 60 * 1000; // 10 minutes

  updateTopic(query: string) {
    this.currentTopic = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  }

  scoreMessages(messages: Array<{ role: string; content: string }>): ScoredMessage[] {
    const now = Date.now();
    return messages.map((msg, idx) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const words = content.toLowerCase().split(/\s+/);

      // Topic relevance (Jaccard-like)
      const topicOverlap = this.currentTopic.filter(t => words.some(w => w.includes(t))).length;
      const topicScore = this.currentTopic.length > 0 ? topicOverlap / this.currentTopic.length : 0.5;

      // Recency score (exponential decay)
      const age = (messages.length - idx) * 60000; // estimate 1 min per message
      const recencyScore = Math.pow(this.DECAY_RATE, age / 60000);

      // Role importance
      const roleScore = msg.role === 'user' ? 1.2 : 1.0;

      // Tool result importance (keep tool results longer)
      const isToolResult = content.includes('tool_result') || content.includes('"type":"tool_result"');
      const toolBonus = isToolResult ? 1.5 : 1.0;

      // Error messages are more important
      const hasError = content.toLowerCase().includes('error') || content.toLowerCase().includes('错误');
      const errorBonus = hasError ? 1.3 : 1.0;

      const relevanceScore = (topicScore * 0.4 + recencyScore * 0.3) * roleScore * toolBonus * errorBonus;

      return {
        role: msg.role,
        content,
        timestamp: now - age,
        relevanceScore,
        topicVector: words.slice(0, 20),
      };
    });
  }

  selectRelevantContext(messages: ScoredMessage[], maxTokens: number): ScoredMessage[] {
    // Sort by relevance score
    const sorted = [...messages].sort((a, b) => b.relevanceScore - a.relevanceScore);

    const selected: ScoredMessage[] = [];
    let tokenEstimate = 0;

    for (const msg of sorted) {
      const msgTokens = Math.ceil(msg.content.length / 4);
      if (tokenEstimate + msgTokens > maxTokens) continue;
      selected.push(msg);
      tokenEstimate += msgTokens;
    }

    // Re-sort by original order
    return selected.sort((a, b) => a.timestamp - b.timestamp);
  }

  compressLowRelevance(messages: ScoredMessage[], threshold: number): { kept: ScoredMessage[]; summarized: string } {
    const kept = messages.filter(m => m.relevanceScore >= threshold);
    const dropped = messages.filter(m => m.relevanceScore < threshold);
    const summarized = dropped.map(m => `[${m.role}]: ${m.content.slice(0, 100)}`).join('\n');
    return { kept, summarized };
  }
}

const engine = new RelevanceDecayEngine();

export const ContextualRelevanceDecayFeature: FeatureModule = {
  meta: {
    id: 'context-relevance-decay',
    name: 'Contextual Relevance Decay',
    description: 'Importance-weighted context window with topic-based relevance scoring',
    category: 'perception',
    enabled: true,
    priority: 'P0',
  },
  async onEvent(event: string, data: any) {
    if (event === 'user_input') engine.updateTopic(data.input || '');
  },
  getTools() {
    return [{
      name: 'score_context_relevance',
      definition: {
        name: 'score_context_relevance',
        description: 'Score conversation messages by relevance to current topic',
        input_schema: {
          type: 'object' as const,
          properties: {
            messages: { type: 'array', description: 'Array of {role, content} messages' },
            query: { type: 'string', description: 'Current topic/query' },
          },
          required: ['messages'],
        },
      },
      execute: async (input: any) => {
        if (input.query) engine.updateTopic(input.query);
        const scored = engine.scoreMessages(input.messages || []);
        return {
          output: scored.map(m => `[${m.relevanceScore.toFixed(2)}] ${m.role}: ${m.content.slice(0, 80)}`).join('\n'),
          isError: false,
        };
      },
    }];
  },
};
