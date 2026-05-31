// ── Skills Registry: Advanced matching engine with 100+ skill support ─────

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadBuiltinSkills } from './builtin-skills';

// ── Skill Interface ───────────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  triggers: string[];
  systemPrompt: string;
  skipWhen?: string;          // condition string to skip the skill
  requires?: string[];        // dependent skill IDs
  priority: number;           // 1-10, higher = preferred when scores tie
}

// ── Match result with confidence ──────────────────────────────────────────

export interface SkillMatch {
  skill: Skill;
  confidence: number;         // 0.0 - 1.0
  matchedTriggers: string[];
}

// ── Registry ──────────────────────────────────────────────────────────────

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private loaded = false;

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.loaded) return;

    // 1. Load builtin skills
    for (const skill of loadBuiltinSkills()) {
      this.skills.set(skill.id, skill);
    }

    // 2. Load user custom skills from .mimo/skills/ and .claude/skills/
    await this.loadFromDirectory('.mimo');
    await this.loadFromDirectory('.claude');

    this.loaded = true;
  }

  /**
   * Load skill JSON files from <home>/.<namespace>/skills/ directory.
   * Each file should conform to the Skill interface.
   */
  private async loadFromDirectory(namespace: string): Promise<void> {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const skillsDir = path.join(homeDir, namespace, 'skills');
      const entries = await fs.readdir(skillsDir).catch(() => []);

      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        try {
          const content = await fs.readFile(path.join(skillsDir, entry), 'utf-8');
          const skill = JSON.parse(content) as Skill;
          if (skill.id && skill.triggers && skill.systemPrompt) {
            // User skills override builtins with same id
            this.skills.set(skill.id, skill);
          }
        } catch {
          // Skip invalid or unreadable files
        }
      }
    } catch {
      // Directory does not exist -- that is fine
    }
  }

  // ── Smart matching engine ─────────────────────────────────────────────

  /**
   * Match a single best skill for the given input.
   * Uses weighted trigger scoring with partial match, word-boundary bonus,
   * and priority as tiebreaker.
   */
  matchSkill(input: string): Skill | null {
    const matches = this.matchSkills(input, 0.1);
    return matches.length > 0 ? matches[0].skill : null;
  }

  /**
   * Return all skills that match above a confidence threshold (default 0.15),
   * sorted by confidence descending, then priority descending.
   */
  matchSkills(input: string, threshold = 0.15): SkillMatch[] {
    const lower = input.toLowerCase();
    const words = this.tokenize(lower);
    const results: SkillMatch[] = [];

    for (const skill of this.skills.values()) {
      // Evaluate skip condition
      if (this.shouldSkip(skill, lower)) continue;

      const { score, matchedTriggers } = this.scoreSkill(skill, lower, words);
      const confidence = this.normalizeConfidence(score, skill.triggers.length);

      if (confidence >= threshold) {
        results.push({ skill, confidence, matchedTriggers });
      }
    }

    // Sort: confidence desc, then priority desc
    results.sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) > 0.01) {
        return b.confidence - a.confidence;
      }
      return b.skill.priority - a.skill.priority;
    });

    return results;
  }

  // ── Scoring internals ────────────────────────────────────────────────

  /**
   * Core scoring: for each trigger, compute a weighted match score.
   *
   * Scoring tiers (per trigger):
   *   - Exact word-boundary match in tokenized input: 3x trigger length
   *   - Substring containment:                           1x trigger length
   *   - Fuzzy partial overlap (>= 60% chars present):    0.4x trigger length
   *
   * The total raw score is the sum across all matched triggers.
   */
  private scoreSkill(
    skill: Skill,
    lower: string,
    words: string[],
  ): { score: number; matchedTriggers: string[] } {
    let score = 0;
    const matchedTriggers: string[] = [];

    for (const trigger of skill.triggers) {
      const t = trigger.toLowerCase();
      const tLen = t.length;
      if (tLen === 0) continue;

      // Tier 1: exact word match (highest signal)
      if (words.includes(t)) {
        score += tLen * 3;
        matchedTriggers.push(trigger);
        continue;
      }

      // Tier 2: substring containment
      if (lower.includes(t)) {
        score += tLen;
        matchedTriggers.push(trigger);
        continue;
      }

      // Tier 3: fuzzy -- at least 60% of unique chars present
      const overlap = this.charOverlap(lower, t);
      if (overlap >= 0.6) {
        score += tLen * 0.4 * overlap;
        matchedTriggers.push(trigger);
      }
    }

    return { score, matchedTriggers };
  }

  /**
   * Normalize raw score into a 0-1 confidence value.
   * The denominator is the sum of all trigger lengths * 3 (max possible score
   * if every trigger matched at word boundary). This means a skill whose
   * every trigger matches exactly scores 1.0.
   */
  private normalizeConfidence(rawScore: number, triggerCount: number): number {
    // Use a reference max of the average trigger weight * 3
    // This prevents skills with many short triggers from being unfairly penalized
    const maxPossible = Math.max(triggerCount * 8, 1); // ~8 chars avg * 3x
    return Math.min(rawScore / maxPossible, 1.0);
  }

  /**
   * Fuzzy character overlap: fraction of unique characters in `pattern`
   * that also appear in `text`.
   */
  private charOverlap(text: string, pattern: string): number {
    const unique = new Set(pattern.replace(/\s/g, ''));
    if (unique.size === 0) return 0;
    let hits = 0;
    for (const ch of unique) {
      if (text.includes(ch)) hits++;
    }
    return hits / unique.size;
  }

  /**
   * Tokenize input into words (split on non-alphanumeric, filter short tokens).
   */
  private tokenize(input: string): string[] {
    return input
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 2);
  }

  // ── Skip condition evaluator ─────────────────────────────────────────

  /**
   * Evaluate a skill's skipWhen condition against the user input.
   * Supported syntax (simple boolean expressions on substrings):
   *   "contains:xyz"    -> true if input contains "xyz"
   *   "!contains:xyz"   -> true if input does NOT contain "xyz"
   *   "lang:python"     -> true if input mentions "python" (shorthand)
   *   "platform:mobile" -> true if input mentions mobile platforms
   *   Combined with || for OR: "contains:a || contains:b"
   */
  private shouldSkip(skill: Skill, lowerInput: string): boolean {
    if (!skill.skipWhen) return false;

    const clauses = skill.skipWhen.split('||').map((c) => c.trim());
    for (const clause of clauses) {
      if (this.evalClause(clause, lowerInput)) return true;
    }
    return false;
  }

  private evalClause(clause: string, input: string): boolean {
    if (clause.startsWith('!contains:')) {
      const term = clause.slice('!contains:'.length).toLowerCase();
      return !input.includes(term);
    }
    if (clause.startsWith('contains:')) {
      const term = clause.slice('contains:'.length).toLowerCase();
      return input.includes(term);
    }
    if (clause.startsWith('lang:')) {
      const lang = clause.slice('lang:'.length).toLowerCase();
      return input.includes(lang);
    }
    if (clause.startsWith('platform:')) {
      const plat = clause.slice('platform:'.length).toLowerCase();
      return input.includes(plat);
    }
    // Default: treat as substring presence
    return input.includes(clause.toLowerCase());
  }

  // ── Skill resolution (nesting / requires) ────────────────────────────

  /**
   * Resolve a skill and all its transitive dependencies.
   * Returns skills in dependency order (dependencies first).
   */
  resolveSkillWithDependencies(skillId: string): Skill[] {
    const resolved: Skill[] = [];
    const visited = new Set<string>();
    this.resolveRecursive(skillId, resolved, visited);
    return resolved;
  }

  private resolveRecursive(
    id: string,
    resolved: Skill[],
    visited: Set<string>,
  ): void {
    if (visited.has(id)) return;
    visited.add(id);

    const skill = this.skills.get(id);
    if (!skill) return;

    // Resolve dependencies first
    if (skill.requires) {
      for (const depId of skill.requires) {
        this.resolveRecursive(depId, resolved, visited);
      }
    }

    resolved.push(skill);
  }

  // ── Public accessors ─────────────────────────────────────────────────

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  listSkills(category?: string): Skill[] {
    const all = Array.from(this.skills.values());
    if (category) {
      return all.filter((s) => s.category === category);
    }
    return all;
  }

  getCategories(): string[] {
    const cats = new Set<string>();
    for (const skill of this.skills.values()) {
      cats.add(skill.category);
    }
    return Array.from(cats).sort();
  }

  /** Total number of registered skills */
  get size(): number {
    return this.skills.size;
  }

  /** Search skills by free text across name, description, and triggers */
  search(query: string): Skill[] {
    const lower = query.toLowerCase();
    const words = this.tokenize(lower);
    return this.listSkills().filter((skill) => {
      const haystack = (
        skill.name + ' ' + skill.description + ' ' + skill.triggers.join(' ')
      ).toLowerCase();
      return words.some((w) => haystack.includes(w));
    });
  }
}

// ── Singleton export ──────────────────────────────────────────────────────

export const skillRegistry = new SkillRegistry();
