// ── Trajectory Compressor ────────────────────────────

import { EventEmitter } from 'events';
import {
  Trajectory, TrajectoryStep, TrajectoryCompressionConfig,
  DEFAULT_COMPRESSION_CONFIG,
} from './types';

export class TrajectoryCompressor extends EventEmitter {
  private config: TrajectoryCompressionConfig;

  constructor(config?: Partial<TrajectoryCompressionConfig>) {
    super();
    this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...config };
  }

  // ── Main Compression Entry Point ──────────────────

  compress(trajectory: Trajectory): Trajectory {
    this.emit('compression_started', {
      trajectoryId: trajectory.id,
      originalSteps: trajectory.steps.length,
    });

    let steps = [...trajectory.steps];

    // Phase 1: Remove redundant tool outputs
    if (this.config.removeRedundantOutputs) {
      steps = this.removeRedundantOutputs(steps);
    }

    // Phase 2: Preserve errors (mark them as keep)
    const keepIndices = new Set<number>();
    if (this.config.preserveErrors) {
      steps.forEach((step, i) => {
        if (step.isError) keepIndices.add(i);
      });
    }

    // Phase 3: Preserve key decisions
    if (this.config.preserveDecisions) {
      steps.forEach((step, i) => {
        if (this.isKeyDecision(step)) keepIndices.add(i);
      });
    }

    // Phase 4: Summarize long conversations
    if (this.config.summarizeLongConversations && steps.length > this.config.summarizeThreshold) {
      steps = this.summarizeLongConversation(steps, keepIndices);
    }

    // Phase 5: Limit to max steps
    if (steps.length > this.config.maxSteps) {
      steps = this.truncateSteps(steps, keepIndices);
    }

    // Phase 6: Token-based compression
    const estimatedTokens = this.estimateTokens(steps);
    if (estimatedTokens > this.config.targetTokenCount) {
      steps = this.compressByTokenBudget(steps, keepIndices);
    }

    const compressed: Trajectory = {
      ...trajectory,
      steps,
      metadata: {
        ...trajectory.metadata,
        compressed: true,
        originalStepCount: trajectory.steps.length,
        compressedStepCount: steps.length,
        compressionRatio: trajectory.steps.length > 0
          ? steps.length / trajectory.steps.length
          : 1,
      },
    };

    this.emit('compression_completed', {
      trajectoryId: trajectory.id,
      originalSteps: trajectory.steps.length,
      compressedSteps: steps.length,
      ratio: compressed.metadata.compressionRatio,
    });

    return compressed;
  }

  // ── Remove Redundant Outputs ──────────────────────

  private removeRedundantOutputs(steps: TrajectoryStep[]): TrajectoryStep[] {
    return steps.map(step => {
      if (step.type === 'tool_call' && step.toolOutput && step.toolOutput.length > 500) {
        // Truncate very long tool outputs, keeping the first and last portions
        const maxLen = 500;
        const output = step.toolOutput;
        if (output.length > maxLen) {
          return {
            ...step,
            toolOutput: output.substring(0, 200) +
              `\n... [${output.length - 400} chars truncated] ...\n` +
              output.substring(output.length - 200),
          };
        }
      }
      return step;
    });
  }

  // ── Key Decision Detection ────────────────────────

  private isKeyDecision(step: TrajectoryStep): boolean {
    if (step.type === 'thought') {
      const content = step.content.toLowerCase();
      const decisionKeywords = [
        'decide', 'decision', 'choose', 'plan', 'strategy',
        'approach', 'solution', 'conclusion', 'determine',
        'important', 'critical', 'key insight',
      ];
      return decisionKeywords.some(kw => content.includes(kw));
    }

    if (step.type === 'tool_call' && step.toolName) {
      // File writes and edits are key decisions
      const keyTools = ['file_write', 'file_edit', 'git_commit', 'shell_exec'];
      return keyTools.includes(step.toolName);
    }

    return false;
  }

  // ── Long Conversation Summarization ───────────────

  private summarizeLongConversation(
    steps: TrajectoryStep[],
    keepIndices: Set<number>
  ): TrajectoryStep[] {
    const threshold = this.config.summarizeThreshold;
    if (steps.length <= threshold) return steps;

    // Group steps into segments
    const segmentSize = Math.ceil(steps.length / Math.ceil(steps.length / threshold));
    const segments: TrajectoryStep[][] = [];

    for (let i = 0; i < steps.length; i += segmentSize) {
      segments.push(steps.slice(i, i + segmentSize));
    }

    const result: TrajectoryStep[] = [];

    for (let s = 0; s < segments.length; s++) {
      const segment = segments[s];

      // Check if any step in this segment should be kept
      const keptSteps = segment.filter((_, i) => {
        const globalIdx = s * segmentSize + i;
        return keepIndices.has(globalIdx);
      });

      if (keptSteps.length > 0) {
        // Keep the important steps from this segment
        result.push(...keptSteps);
      } else if (segment.length > 3) {
        // Summarize this segment into a single step
        const summary = this.summarizeSegment(segment);
        result.push(summary);
      } else {
        // Short segment, keep as-is
        result.push(...segment);
      }
    }

    return result;
  }

  private summarizeSegment(steps: TrajectoryStep[]): TrajectoryStep {
    const toolCalls = steps.filter(s => s.type === 'tool_call');
    const thoughts = steps.filter(s => s.type === 'thought');
    const errors = steps.filter(s => s.isError);

    const parts: string[] = [];

    if (toolCalls.length > 0) {
      const toolNames = [...new Set(toolCalls.map(s => s.toolName).filter(Boolean))];
      parts.push(`Executed ${toolCalls.length} tool calls: ${toolNames.join(', ')}`);
    }

    if (thoughts.length > 0) {
      parts.push(`${thoughts.length} reasoning steps`);
    }

    if (errors.length > 0) {
      parts.push(`${errors.length} errors encountered`);
    }

    const totalTokens = steps.reduce((sum, s) => sum + s.tokensUsed, 0);
    const totalDuration = steps.reduce((sum, s) => sum + s.durationMs, 0);

    return {
      id: steps[0]?.id || '',
      index: steps[0]?.index || 0,
      type: 'message',
      timestamp: steps[0]?.timestamp || new Date().toISOString(),
      content: `[Summary] ${parts.join('. ')}`,
      toolName: null,
      toolInput: null,
      toolOutput: null,
      isError: false,
      tokensUsed: totalTokens,
      durationMs: totalDuration,
      stateSnapshot: null,
      metadata: {
        summarized: true,
        originalStepCount: steps.length,
      },
    };
  }

  // ── Step Truncation ───────────────────────────────

  private truncateSteps(steps: TrajectoryStep[], keepIndices: Set<number>): TrajectoryStep[] {
    const maxSteps = this.config.maxSteps;
    if (steps.length <= maxSteps) return steps;

    // Always keep first and last steps
    keepIndices.add(0);
    keepIndices.add(steps.length - 1);

    // Score each step by importance
    const scored = steps.map((step, i) => ({
      step,
      index: i,
      importance: this.scoreStepImportance(step, keepIndices.has(i)),
    }));

    // Sort by importance (descending) and take top maxSteps
    scored.sort((a, b) => b.importance - a.importance);
    const selected = scored.slice(0, maxSteps);

    // Re-sort by original order
    selected.sort((a, b) => a.index - b.index);

    return selected.map(s => s.step);
  }

  private scoreStepImportance(step: TrajectoryStep, isKept: boolean): number {
    let score = 0;

    // Kept steps get highest priority
    if (isKept) score += 1000;

    // Errors are important
    if (step.isError) score += 500;

    // Key decision keywords
    if (this.isKeyDecision(step)) score += 300;

    // Tool calls are more important than thoughts/messages
    if (step.type === 'tool_call') score += 100;
    if (step.type === 'thought') score += 50;
    if (step.type === 'state_snapshot') score += 200;

    // Higher token usage suggests more significant steps
    score += Math.min(step.tokensUsed / 10, 100);

    // File writes are more important than reads
    if (step.toolName === 'file_write' || step.toolName === 'file_edit') score += 200;
    if (step.toolName === 'git_commit') score += 150;

    return score;
  }

  // ── Token Budget Compression ──────────────────────

  private compressByTokenBudget(
    steps: TrajectoryStep[],
    keepIndices: Set<number>
  ): TrajectoryStep[] {
    const target = this.config.targetTokenCount;
    let currentTokens = this.estimateTokens(steps);

    if (currentTokens <= target) return steps;

    // Iteratively remove lowest-importance non-kept steps
    const scored = steps.map((step, i) => ({
      step,
      index: i,
      importance: this.scoreStepImportance(step, keepIndices.has(i)),
    }));

    scored.sort((a, b) => a.importance - b.importance);

    const removedIndices = new Set<number>();

    for (const item of scored) {
      if (keepIndices.has(item.index)) continue;
      if (currentTokens <= target) break;

      removedIndices.add(item.index);
      currentTokens -= item.step.tokensUsed;
    }

    const result = steps.filter((_, i) => !removedIndices.has(i));

    // If we removed middle steps, add a summary step
    if (removedIndices.size > 3) {
      const summaryStep: TrajectoryStep = {
        id: 'compressed-summary',
        index: Math.floor(steps.length / 2),
        type: 'message',
        timestamp: new Date().toISOString(),
        content: `[${removedIndices.size} steps compressed to fit token budget]`,
        toolName: null,
        toolInput: null,
        toolOutput: null,
        isError: false,
        tokensUsed: 0,
        durationMs: 0,
        stateSnapshot: null,
        metadata: { compressed: true, removedCount: removedIndices.size },
      };
      result.splice(Math.floor(result.length / 2), 0, summaryStep);
    }

    return result;
  }

  // ── Utility ───────────────────────────────────────

  private estimateTokens(steps: TrajectoryStep[]): number {
    // Rough estimate: 1 token ~ 4 characters
    const totalChars = steps.reduce((sum, step) => {
      let chars = step.content.length;
      if (step.toolOutput) chars += step.toolOutput.length;
      if (step.toolInput) chars += JSON.stringify(step.toolInput).length;
      return sum + chars;
    }, 0);
    return Math.ceil(totalChars / 4);
  }

  updateConfig(config: Partial<TrajectoryCompressionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TrajectoryCompressionConfig {
    return { ...this.config };
  }
}
