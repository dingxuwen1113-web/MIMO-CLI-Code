import createDebug from 'debug';

const debug = createDebug('mimo:plan');

export interface PlanStep {
  description: string;
  status: 'pending' | 'done' | 'skipped';
}

export interface PlanFile {
  title: string;
  steps: PlanStep[];
  createdAt: string;
  approved: boolean;
}

/**
 * Manages execution plans for the agent.
 * Plans are created in plan mode and executed after approval.
 */
export class PlanManager {
  private currentPlan: PlanFile | null = null;

  create(title: string): PlanFile {
    this.currentPlan = {
      title,
      steps: [],
      createdAt: new Date().toISOString(),
      approved: false,
    };
    debug('Created plan: %s', title);
    return this.currentPlan;
  }

  getCurrent(): PlanFile | null {
    return this.currentPlan;
  }

  addStep(description: string): void {
    if (!this.currentPlan) {
      this.currentPlan = this.create('操作计划');
    }
    this.currentPlan.steps.push({ description, status: 'pending' });
    debug('Added step: %s', description);
  }

  completeStep(index: number): boolean {
    if (!this.currentPlan || index < 0 || index >= this.currentPlan.steps.length) {
      return false;
    }
    this.currentPlan.steps[index].status = 'done';
    return true;
  }

  skipStep(index: number): boolean {
    if (!this.currentPlan || index < 0 || index >= this.currentPlan.steps.length) {
      return false;
    }
    this.currentPlan.steps[index].status = 'skipped';
    return true;
  }

  approve(): void {
    if (this.currentPlan) {
      this.currentPlan.approved = true;
      debug('Plan approved: %s', this.currentPlan.title);
    }
  }

  clear(): void {
    this.currentPlan = null;
    debug('Plan cleared');
  }

  getProgress(): { done: number; total: number; percent: number } {
    if (!this.currentPlan) return { done: 0, total: 0, percent: 0 };
    const total = this.currentPlan.steps.length;
    const done = this.currentPlan.steps.filter(s => s.status === 'done').length;
    return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
  }
}
