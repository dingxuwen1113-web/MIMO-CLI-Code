import createDebug from 'debug';

const debug = createDebug('mimo:availability');

// ─── Availability Expression Types ─────────────────────────────────

export type AvailabilityExpression =
  | { type: 'always' }
  | { type: 'never' }
  | { type: 'auth'; provider: string }
  | { type: 'config'; key: string; value?: any }
  | { type: 'env'; var: string }
  | { type: 'plugin-enabled'; pluginId: string }
  | { type: 'platform'; os: 'win32' | 'darwin' | 'linux' }
  | { type: 'capability'; name: string }
  | { type: 'allOf'; children: AvailabilityExpression[] }
  | { type: 'anyOf'; children: AvailabilityExpression[] }
  | { type: 'not'; child: AvailabilityExpression };

// ─── Availability Context ──────────────────────────────────────────

export interface AvailabilityContext {
  authenticatedProviders: Set<string>;
  config: Record<string, any>;
  env: Record<string, string>;
  enabledPlugins: Set<string>;
  platform: string;
  capabilities: Set<string>;
}

export function createDefaultContext(): AvailabilityContext {
  return {
    authenticatedProviders: new Set(),
    config: {},
    env: process.env as Record<string, string>,
    enabledPlugins: new Set(),
    platform: process.platform,
    capabilities: new Set([
      'file_read', 'file_write', 'shell_exec', 'git', 'grep', 'glob',
    ]),
  };
}

// ─── Evaluation Engine ─────────────────────────────────────────────

export interface EvaluationResult {
  available: boolean;
  reason?: string;
}

export function evaluateAvailability(
  expr: AvailabilityExpression,
  ctx: AvailabilityContext,
): EvaluationResult {
  switch (expr.type) {
    case 'always':
      return { available: true };

    case 'never':
      return { available: false, reason: 'Tool is explicitly disabled' };

    case 'auth': {
      const has = ctx.authenticatedProviders.has(expr.provider);
      return has
        ? { available: true }
        : { available: false, reason: `Requires authentication for ${expr.provider}` };
    }

    case 'config': {
      const val = getNestedValue(ctx.config, expr.key);
      if (expr.value !== undefined) {
        const match = JSON.stringify(val) === JSON.stringify(expr.value);
        return match
          ? { available: true }
          : { available: false, reason: `Config ${expr.key} must be ${JSON.stringify(expr.value)}` };
      }
      return val !== undefined && val !== null && val !== false && val !== ''
        ? { available: true }
        : { available: false, reason: `Config ${expr.key} is not set` };
    }

    case 'env': {
      const val = ctx.env[expr.var];
      return val
        ? { available: true }
        : { available: false, reason: `Environment variable ${expr.var} is not set` };
    }

    case 'plugin-enabled': {
      const has = ctx.enabledPlugins.has(expr.pluginId);
      return has
        ? { available: true }
        : { available: false, reason: `Plugin ${expr.pluginId} is not enabled` };
    }

    case 'platform': {
      const match = ctx.platform === expr.os;
      return match
        ? { available: true }
        : { available: false, reason: `Requires ${expr.os}, running on ${ctx.platform}` };
    }

    case 'capability': {
      const has = ctx.capabilities.has(expr.name);
      return has
        ? { available: true }
        : { available: false, reason: `Capability ${expr.name} is not available` };
    }

    case 'allOf': {
      for (const child of expr.children) {
        const result = evaluateAvailability(child, ctx);
        if (!result.available) return result;
      }
      return { available: true };
    }

    case 'anyOf': {
      const reasons: string[] = [];
      for (const child of expr.children) {
        const result = evaluateAvailability(child, ctx);
        if (result.available) return { available: true };
        if (result.reason) reasons.push(result.reason);
      }
      return { available: false, reason: `None of the conditions met: ${reasons.join('; ')}` };
    }

    case 'not': {
      const result = evaluateAvailability(expr.child, ctx);
      return result.available
        ? { available: false, reason: 'Condition must NOT be met' }
        : { available: true };
    }

    default:
      return { available: false, reason: 'Unknown expression type' };
  }
}

// ─── Tool Availability Plan ────────────────────────────────────────

export interface ToolAvailabilityPlan {
  visible: Array<{ name: string; available: true }>;
  hidden: Array<{ name: string; reason: string }>;
}

export function buildToolPlan(
  tools: Array<{ name: string; availability?: AvailabilityExpression }>,
  ctx: AvailabilityContext,
): ToolAvailabilityPlan {
  const visible: ToolAvailabilityPlan['visible'] = [];
  const hidden: ToolAvailabilityPlan['hidden'] = [];

  for (const tool of tools) {
    if (!tool.availability) {
      visible.push({ name: tool.name, available: true });
      continue;
    }
    const result = evaluateAvailability(tool.availability, ctx);
    if (result.available) {
      visible.push({ name: tool.name, available: true });
    } else {
      hidden.push({ name: tool.name, reason: result.reason || 'Unavailable' });
    }
  }

  debug('Tool plan: %d visible, %d hidden', visible.length, hidden.length);
  return { visible, hidden };
}

// ─── Helpers ───────────────────────────────────────────────────────

function getNestedValue(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

// ─── Convenience Builders ──────────────────────────────────────────

export const expr = {
  always: (): AvailabilityExpression => ({ type: 'always' }),
  never: (): AvailabilityExpression => ({ type: 'never' }),
  auth: (provider: string): AvailabilityExpression => ({ type: 'auth', provider }),
  config: (key: string, value?: any): AvailabilityExpression => ({ type: 'config', key, value }),
  env: (v: string): AvailabilityExpression => ({ type: 'env', var: v }),
  plugin: (id: string): AvailabilityExpression => ({ type: 'plugin-enabled', pluginId: id }),
  platform: (os: 'win32' | 'darwin' | 'linux'): AvailabilityExpression => ({ type: 'platform', os }),
  capability: (name: string): AvailabilityExpression => ({ type: 'capability', name }),
  allOf: (...children: AvailabilityExpression[]): AvailabilityExpression => ({ type: 'allOf', children }),
  anyOf: (...children: AvailabilityExpression[]): AvailabilityExpression => ({ type: 'anyOf', children }),
  not: (child: AvailabilityExpression): AvailabilityExpression => ({ type: 'not', child }),
};
