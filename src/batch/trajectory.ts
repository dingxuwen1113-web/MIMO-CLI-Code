// ── Trajectory Recorder ──────────────────────────────

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  Trajectory, TrajectoryStep, TrajectoryStepType,
} from './types';

export interface TrajectoryStorage {
  save(trajectory: Trajectory): Promise<void>;
  load(trajectoryId: string): Promise<Trajectory | null>;
  list(): Promise<Trajectory[]>;
  delete(trajectoryId: string): Promise<void>;
}

export class FileTrajectoryStorage implements TrajectoryStorage {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async save(trajectory: Trajectory): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, `${trajectory.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(trajectory, null, 2), 'utf-8');
  }

  async load(trajectoryId: string): Promise<Trajectory | null> {
    try {
      const filePath = path.join(this.basePath, `${trajectoryId}.json`);
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async list(): Promise<Trajectory[]> {
    try {
      const files = await fs.readdir(this.basePath);
      const trajectories: Trajectory[] = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = await fs.readFile(path.join(this.basePath, file), 'utf-8');
          trajectories.push(JSON.parse(raw));
        } catch {
          // Skip corrupted files
        }
      }
      return trajectories;
    } catch {
      return [];
    }
  }

  async delete(trajectoryId: string): Promise<void> {
    try {
      const filePath = path.join(this.basePath, `${trajectoryId}.json`);
      await fs.unlink(filePath);
    } catch {
      // File may not exist
    }
  }
}

export class TrajectoryRecorder extends EventEmitter {
  private currentTrajectory: Trajectory | null = null;
  private storage: TrajectoryStorage;
  private stepCounter = 0;
  private currentStepStart: number = 0;
  private stateSnapshots: Map<string, any> = new Map();

  constructor(storage: TrajectoryStorage) {
    super();
    this.storage = storage;
  }

  // ── Recording Lifecycle ───────────────────────────

  startRecording(promptId: string, prompt: string, model: string, metadata?: Record<string, any>): string {
    const trajectoryId = this.generateId();

    this.currentTrajectory = {
      id: trajectoryId,
      promptId,
      prompt,
      steps: [],
      startedAt: new Date().toISOString(),
      endedAt: null,
      totalTokensUsed: 0,
      model,
      metadata: metadata || {},
      summary: null,
    };

    this.stepCounter = 0;
    this.stateSnapshots.clear();

    this.emit('recording_started', { trajectoryId, promptId });
    return trajectoryId;
  }

  async stopRecording(summary?: string): Promise<Trajectory | null> {
    if (!this.currentTrajectory) return null;

    this.currentTrajectory.endedAt = new Date().toISOString();
    this.currentTrajectory.summary = summary || null;

    await this.storage.save(this.currentTrajectory);

    const trajectory = this.currentTrajectory;
    this.currentTrajectory = null;
    this.stateSnapshots.clear();

    this.emit('recording_stopped', {
      trajectoryId: trajectory.id,
      stepCount: trajectory.steps.length,
      totalTokens: trajectory.totalTokensUsed,
    });

    return trajectory;
  }

  // ── Step Recording ────────────────────────────────

  recordStep(type: TrajectoryStepType, content: string, options: {
    toolName?: string;
    toolInput?: Record<string, any>;
    toolOutput?: string;
    isError?: boolean;
    tokensUsed?: number;
    metadata?: Record<string, any>;
  } = {}): TrajectoryStep | null {
    if (!this.currentTrajectory) return null;

    const now = Date.now();
    const durationMs = this.currentStepStart > 0 ? now - this.currentStepStart : 0;
    this.currentStepStart = now;

    const step: TrajectoryStep = {
      id: this.generateId(),
      index: this.stepCounter++,
      type,
      timestamp: new Date().toISOString(),
      content,
      toolName: options.toolName || null,
      toolInput: options.toolInput || null,
      toolOutput: options.toolOutput || null,
      isError: options.isError || false,
      tokensUsed: options.tokensUsed || 0,
      durationMs,
      stateSnapshot: null,
      metadata: options.metadata || {},
    };

    this.currentTrajectory.steps.push(step);
    this.currentTrajectory.totalTokensUsed += step.tokensUsed;

    this.emit('step_recorded', {
      trajectoryId: this.currentTrajectory.id,
      stepIndex: step.index,
      type,
    });

    return step;
  }

  recordToolCall(toolName: string, input: Record<string, any>, output: string, options: {
    isError?: boolean;
    tokensUsed?: number;
    metadata?: Record<string, any>;
  } = {}): TrajectoryStep | null {
    return this.recordStep('tool_call', `Called ${toolName}`, {
      toolName,
      toolInput: input,
      toolOutput: output,
      isError: options.isError,
      tokensUsed: options.tokensUsed,
      metadata: options.metadata,
    });
  }

  recordThought(thought: string, tokensUsed?: number): TrajectoryStep | null {
    return this.recordStep('thought', thought, { tokensUsed });
  }

  recordMessage(role: string, content: string, tokensUsed?: number): TrajectoryStep | null {
    return this.recordStep('message', content, {
      tokensUsed,
      metadata: { role },
    });
  }

  recordError(error: string, context?: Record<string, any>): TrajectoryStep | null {
    return this.recordStep('error', error, {
      isError: true,
      metadata: context,
    });
  }

  // ── State Snapshots ───────────────────────────────

  recordStateSnapshot(label: string, state: Record<string, any>): void {
    if (!this.currentTrajectory) return;

    this.stateSnapshots.set(label, state);

    // Also record as a step
    const now = Date.now();
    const durationMs = this.currentStepStart > 0 ? now - this.currentStepStart : 0;
    this.currentStepStart = now;

    const step: TrajectoryStep = {
      id: this.generateId(),
      index: this.stepCounter++,
      type: 'state_snapshot',
      timestamp: new Date().toISOString(),
      content: `State snapshot: ${label}`,
      toolName: null,
      toolInput: null,
      toolOutput: null,
      isError: false,
      tokensUsed: 0,
      durationMs,
      stateSnapshot: state,
      metadata: { label },
    };

    this.currentTrajectory.steps.push(step);
  }

  getStateSnapshot(label: string): Record<string, any> | undefined {
    return this.stateSnapshots.get(label);
  }

  // ── Replay ────────────────────────────────────────

  async loadTrajectory(trajectoryId: string): Promise<Trajectory | null> {
    return this.storage.load(trajectoryId);
  }

  async listTrajectories(): Promise<Trajectory[]> {
    return this.storage.list();
  }

  async replay(
    trajectoryId: string,
    callback: (step: TrajectoryStep, index: number) => Promise<void>
  ): Promise<void> {
    const trajectory = await this.storage.load(trajectoryId);
    if (!trajectory) throw new Error(`Trajectory not found: ${trajectoryId}`);

    this.emit('replay_started', { trajectoryId, stepCount: trajectory.steps.length });

    for (let i = 0; i < trajectory.steps.length; i++) {
      const step = trajectory.steps[i];
      this.emit('replay_step', { trajectoryId, stepIndex: i, type: step.type });
      await callback(step, i);
    }

    this.emit('replay_completed', { trajectoryId });
  }

  // ── Current State ─────────────────────────────────

  isRecording(): boolean {
    return this.currentTrajectory !== null;
  }

  getCurrentTrajectory(): Trajectory | null {
    return this.currentTrajectory;
  }

  getCurrentStepCount(): number {
    return this.currentTrajectory?.steps.length || 0;
  }

  // ── Utility ───────────────────────────────────────

  private generateId(): string {
    return `traj-${crypto.randomBytes(8).toString('hex')}`;
  }
}
