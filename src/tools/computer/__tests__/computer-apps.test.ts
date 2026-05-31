import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ToolRegistry } from '../../registry';
import { executeComputerLaunch, executeComputerFocus, executeComputerListWindows } from '../engine';

describe('Computer Application Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry('agent');
  });

  describe('Tool Registration', () => {
    it('should have all computer tools registered', () => {
      const tools = registry.getToolNames();
      expect(tools).toContain('computer_launch');
      expect(tools).toContain('computer_focus');
      expect(tools).toContain('computer_list_windows');
    });

    it('should have correct tool definitions', () => {
      const definitions = registry.getDefinitions();
      const launch = definitions.find(d => d.name === 'computer_launch');
      const focus = definitions.find(d => d.name === 'computer_focus');
      const listWindows = definitions.find(d => d.name === 'computer_list_windows');

      expect(launch).toBeDefined();
      expect(focus).toBeDefined();
      expect(listWindows).toBeDefined();

      expect(launch?.description).toContain('Launch or open a desktop application');
      expect(focus?.description).toContain('Switch to (focus) a specific application window');
      expect(listWindows?.description).toContain('List all currently open windows');
    });

    it('should have correct input schemas', () => {
      const definitions = registry.getDefinitions();
      const launch = definitions.find(d => d.name === 'computer_launch');

      expect(launch?.input_schema.properties).toHaveProperty('application');
      expect(launch?.input_schema.properties).toHaveProperty('args');
      expect(launch?.input_schema.properties).toHaveProperty('wait');
      expect(launch?.input_schema.required).toContain('application');
    });
  });

  describe('Permission System', () => {
    it('computer_launch should require ask permission in agent mode', () => {
      const permission = registry.checkPermission('computer_launch');
      expect(permission).toBe('ask');
    });

    it('computer_launch should auto-approve in yolo mode', () => {
      const yoloRegistry = new ToolRegistry('yolo');
      const permission = yoloRegistry.checkPermission('computer_launch');
      expect(permission).toBe('auto');
    });

    it('computer_focus should be auto-approved (read-only)', () => {
      const permission = registry.checkPermission('computer_focus');
      expect(permission).toBe('auto');
    });

    it('computer_list_windows should be auto-approved (read-only)', () => {
      const permission = registry.checkPermission('computer_list_windows');
      expect(permission).toBe('auto');
    });
  });

  describe('Input Validation', () => {
    it('computer_launch should require application parameter', async () => {
      const result = await executeComputerLaunch({});
      expect(result.isError).toBe(true);
      expect(result.output).toContain('Application parameter is required');
    });

    it('computer_launch should reject empty application', async () => {
      const result = await executeComputerLaunch({ application: '' });
      expect(result.isError).toBe(true);
      expect(result.output).toContain('Application parameter is required');
    });

    it('computer_focus should require application or windowId', async () => {
      const result = await executeComputerFocus({});
      expect(result.isError).toBe(true);
      expect(result.output).toContain('Either application or windowId parameter is required');
    });
  });

  describe('Tool Execution', () => {
    // Note: These tests require actual system availability
    // They may need to be skipped in CI/CD environments

    it('should list windows', async () => {
      const result = await executeComputerListWindows({});

      // In test environment, this might fail due to platform-specific tools
      // but the function should return a valid result structure
      if (!result.isError) {
        const output = JSON.parse(result.output);
        expect(output).toHaveProperty('count');
        expect(output).toHaveProperty('windows');
        expect(Array.isArray(output.windows)).toBe(true);
      }
    });

    it('should handle window list filtering', async () => {
      const result = await executeComputerListWindows({ filter: 'test' });

      if (!result.isError) {
        const output = JSON.parse(result.output);
        expect(output).toHaveProperty('count');
        expect(output).toHaveProperty('windows');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in application names', async () => {
      const result = await executeComputerLaunch({
        application: "Test App's Name",
      });

      // Should not crash, even if launch fails
      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('isError');
    });

    it('should handle special characters in window names', async () => {
      const result = await executeComputerFocus({
        application: "App's Window",
      });

      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('isError');
    });

    it('should handle launch with arguments', async () => {
      const result = await executeComputerLaunch({
        application: 'test',
        args: ['--arg1', 'value1', '--arg2'],
      });

      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('isError');
    });

    it('should handle launch with wait flag', async () => {
      const result = await executeComputerLaunch({
        application: 'test',
        wait: true,
      });

      expect(result).toHaveProperty('output');
      expect(result).toHaveProperty('isError');
    });
  });
});

describe('Integration with Existing Computer Tools', () => {
  it('all computer tools should be accessible through registry', async () => {
    const registry = new ToolRegistry('yolo');
    const tools = registry.getToolNames();

    const computerTools = tools.filter(t => t.startsWith('computer_'));
    expect(computerTools.length).toBe(12); // 9 original + 3 new
  });

  it('new tools should follow same pattern as existing tools', () => {
    const registry = new ToolRegistry('agent');
    const definitions = registry.getDefinitions();

    const computerTools = definitions.filter(d => d.name.startsWith('computer_'));

    // All computer tools should have required fields
    for (const tool of computerTools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('input_schema');
      expect(tool.name).toMatch(/^computer_/);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.input_schema.type).toBe('object');
    }
  });
});
