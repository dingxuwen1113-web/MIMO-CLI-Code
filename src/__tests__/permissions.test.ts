// ── 权限系统综合测试 ─────────────────────────────────
// 运行: npx ts-node src/__tests__/permissions.test.ts

import { ToolRegistry } from '../tools/registry';
import { ModeManager } from '../core/mode';

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition: boolean, testName: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${testName}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${testName}`);
  }
}

function assertEqual(actual: string, expected: string, testName: string): void {
  assert(actual === expected, `${testName} (got: ${actual}, expected: ${expected})`);
}

// ═══════════════════════════════════════════════════════
// 测试 1: ModeManager 基本功能
// ═══════════════════════════════════════════════════════
function testModeManager(): void {
  console.log('\n\x1b[1m── ModeManager 基本功能 ──\x1b[0m');

  const mm = new ModeManager('agent');
  assertEqual(mm.getMode(), 'agent', '初始模式');
  assertEqual(mm.getToolPermission('file_read'), 'auto', 'file_read 默认');
  assertEqual(mm.getToolPermission('file_write'), 'ask', 'file_write 默认');
  assertEqual(mm.getToolPermission('shell_exec'), 'ask', 'shell_exec 默认');
  assertEqual(mm.getToolPermission('unknown_tool'), 'ask', '未知工具回退 ask');

  mm.setMode('plan');
  assertEqual(mm.getMode(), 'plan', '切换到 plan');
  assertEqual(mm.getToolPermission('file_write'), 'denied', 'plan: file_write denied');
  assertEqual(mm.getToolPermission('shell_exec'), 'denied', 'plan: shell_exec denied');
  assertEqual(mm.getToolPermission('file_read'), 'auto', 'plan: file_read auto');

  mm.setMode('yolo');
  assertEqual(mm.getMode(), 'yolo', '切换到 yolo');
  assertEqual(mm.getToolPermission('file_write'), 'auto', 'yolo: file_write auto');
  assertEqual(mm.getToolPermission('shell_exec'), 'auto', 'yolo: shell_exec auto');
}

// ═══════════════════════════════════════════════════════
// 测试 2: ModeManager 全 35 工具覆盖
// ═══════════════════════════════════════════════════════
function testModeManagerAllTools(): void {
  console.log('\n\x1b[1m── ModeManager 全工具覆盖 (35 工具) ──\x1b[0m');

  const mm = new ModeManager('agent');
  const ALL_TOOLS = [
    'file_read', 'file_write', 'file_edit', 'shell_exec',
    'grep_search', 'glob_match',
    'browser_navigate', 'browser_read', 'browser_find',
    'browser_click', 'browser_type', 'browser_screenshot',
    'browser_execute_js', 'browser_network', 'browser_console',
    'web_search', 'web_fetch',
    'git_status', 'git_diff', 'git_log', 'git_branch',
    'git_commit', 'git_checkout', 'git_stash', 'git_pr',
    'git_blame', 'git_issue', 'git_release',
    'task_create', 'task_update', 'task_list', 'task_get',
    'notebook_read', 'notebook_edit',
    'image_read', 'file_upload',
  ];

  // 验证所有 35 个工具都有显式映射（不回退到 'ask'）
  const expectedAgent: Record<string, string> = {
    file_read: 'auto', file_write: 'ask', file_edit: 'ask', shell_exec: 'ask',
    grep_search: 'auto', glob_match: 'auto',
    browser_navigate: 'auto', browser_read: 'auto', browser_find: 'auto',
    browser_click: 'ask', browser_type: 'ask', browser_screenshot: 'auto',
    browser_execute_js: 'ask', browser_network: 'auto', browser_console: 'auto',
    web_search: 'auto', web_fetch: 'auto',
    git_status: 'auto', git_diff: 'auto', git_log: 'auto', git_branch: 'auto',
    git_commit: 'ask', git_checkout: 'auto', git_stash: 'auto', git_pr: 'ask',
    git_blame: 'auto', git_issue: 'ask', git_release: 'ask',
    task_create: 'auto', task_update: 'auto', task_list: 'auto', task_get: 'auto',
    notebook_read: 'auto', notebook_edit: 'ask',
    image_read: 'auto', file_upload: 'ask',
  };

  for (const tool of ALL_TOOLS) {
    const actual = mm.getToolPermission(tool);
    const expected = expectedAgent[tool];
    assertEqual(actual, expected, `agent: ${tool}`);
  }
  assert(ALL_TOOLS.length === 36, `工具总数: ${ALL_TOOLS.length}`);
}

// ═══════════════════════════════════════════════════════
// 测试 3: ModeManager 输入感知
// ═══════════════════════════════════════════════════════
function testModeManagerInputAware(): void {
  console.log('\n\x1b[1m── ModeManager 输入感知 ──\x1b[0m');

  const mm = new ModeManager('plan');

  // git_branch: list/current = auto, create/delete/switch = ask (in plan)
  assertEqual(mm.getToolPermission('git_branch', { action: 'list' }), 'auto', 'plan: git_branch list');
  assertEqual(mm.getToolPermission('git_branch', { action: 'current' }), 'auto', 'plan: git_branch current');
  assertEqual(mm.getToolPermission('git_branch', { action: 'create' }), 'ask', 'plan: git_branch create');
  assertEqual(mm.getToolPermission('git_branch', { action: 'delete' }), 'ask', 'plan: git_branch delete');
  assertEqual(mm.getToolPermission('git_branch', { action: 'switch' }), 'ask', 'plan: git_branch switch');

  // git_checkout: file 恢复 = ask, 切换分支 = auto
  assertEqual(mm.getToolPermission('git_checkout', { target: 'main' }), 'auto', 'plan: git_checkout branch');
  assertEqual(mm.getToolPermission('git_checkout', { target: 'file.txt', file: true }), 'ask', 'plan: git_checkout file');

  // git_stash: list/show = auto, push/pop/drop = ask
  assertEqual(mm.getToolPermission('git_stash', { action: 'list' }), 'auto', 'plan: git_stash list');
  assertEqual(mm.getToolPermission('git_stash', { action: 'show' }), 'auto', 'plan: git_stash show');
  assertEqual(mm.getToolPermission('git_stash', { action: 'push' }), 'ask', 'plan: git_stash push');
  assertEqual(mm.getToolPermission('git_stash', { action: 'pop' }), 'ask', 'plan: git_stash pop');
  assertEqual(mm.getToolPermission('git_stash', { action: 'drop' }), 'ask', 'plan: git_stash drop');

  // yolo: 全部 auto
  mm.setMode('yolo');
  assertEqual(mm.getToolPermission('git_branch', { action: 'create' }), 'auto', 'yolo: git_branch create');
  assertEqual(mm.getToolPermission('git_stash', { action: 'push' }), 'auto', 'yolo: git_stash push');
  assertEqual(mm.getToolPermission('git_checkout', { target: 'f', file: true }), 'auto', 'yolo: git_checkout file');
}

// ═══════════════════════════════════════════════════════
// 测试 4: ToolRegistry 只读工具
// ═══════════════════════════════════════════════════════
function testRegistryReadOnly(): void {
  console.log('\n\x1b[1m── ToolRegistry 只读工具（所有模式 auto）──\x1b[0m');

  const readOnlyTools = [
    'file_read', 'grep_search', 'glob_match',
    'browser_navigate', 'browser_read', 'browser_find',
    'browser_screenshot', 'browser_network', 'browser_console',
    'web_search', 'web_fetch',
    'git_status', 'git_diff', 'git_log', 'git_blame',
    'task_list', 'task_get',
    'notebook_read', 'image_read',
  ];

  for (const mode of ['plan', 'agent', 'yolo'] as const) {
    const registry = new ToolRegistry(mode);
    for (const tool of readOnlyTools) {
      assertEqual(registry.checkPermission(tool), 'auto', `${mode}: ${tool} auto`);
    }
  }
}

// ═══════════════════════════════════════════════════════
// 测试 5: ToolRegistry 写操作工具（需审批）
// ═══════════════════════════════════════════════════════
function testRegistryWriteTools(): void {
  console.log('\n\x1b[1m── ToolRegistry 写操作工具 ──\x1b[0m');

  // Plan 模式下应被拒绝
  const planDenied = ['file_write', 'file_edit', 'shell_exec'];
  const planReg = new ToolRegistry('plan');
  for (const tool of planDenied) {
    assertEqual(planReg.checkPermission(tool), 'denied', `plan: ${tool} denied`);
  }

  // Agent 模式下需审批
  const agentAsk = ['file_write', 'file_edit', 'shell_exec', 'git_commit', 'git_pr', 'git_issue', 'git_release'];
  const agentReg = new ToolRegistry('agent');
  for (const tool of agentAsk) {
    assertEqual(agentReg.checkPermission(tool), 'ask', `agent: ${tool} ask`);
  }

  // YOLO 模式下全部自动
  const yoloReg = new ToolRegistry('yolo');
  for (const tool of [...agentAsk, ...planDenied]) {
    assertEqual(yoloReg.checkPermission(tool), 'auto', `yolo: ${tool} auto`);
  }
}

// ═══════════════════════════════════════════════════════
// 测试 6: ToolRegistry 浏览器写操作
// ═══════════════════════════════════════════════════════
function testRegistryBrowserWrite(): void {
  console.log('\n\x1b[1m── ToolRegistry 浏览器写操作 ──\x1b[0m');

  const agentReg = new ToolRegistry('agent');
  assertEqual(agentReg.checkPermission('browser_click'), 'ask', 'agent: browser_click ask');
  assertEqual(agentReg.checkPermission('browser_type'), 'ask', 'agent: browser_type ask');
  assertEqual(agentReg.checkPermission('browser_execute_js'), 'ask', 'agent: browser_execute_js ask');

  const planReg = new ToolRegistry('plan');
  assertEqual(planReg.checkPermission('browser_click'), 'ask', 'plan: browser_click ask');
  assertEqual(planReg.checkPermission('browser_type'), 'ask', 'plan: browser_type ask');
  assertEqual(planReg.checkPermission('browser_execute_js'), 'ask', 'plan: browser_execute_js ask');

  const yoloReg = new ToolRegistry('yolo');
  assertEqual(yoloReg.checkPermission('browser_click'), 'auto', 'yolo: browser_click auto');
  assertEqual(yoloReg.checkPermission('browser_type'), 'auto', 'yolo: browser_type auto');
  assertEqual(yoloReg.checkPermission('browser_execute_js'), 'auto', 'yolo: browser_execute_js auto');
}

// ═══════════════════════════════════════════════════════
// 测试 7: Task 工具权限
// ═══════════════════════════════════════════════════════
function testRegistryTask(): void {
  console.log('\n\x1b[1m── Task 工具权限 ──\x1b[0m');

  const allModes: Array<'plan' | 'agent' | 'yolo'> = ['plan', 'agent', 'yolo'];
  for (const mode of allModes) {
    const reg = new ToolRegistry(mode);
    assertEqual(reg.checkPermission('task_create'), 'auto', `${mode}: task_create auto`);
    assertEqual(reg.checkPermission('task_update'), 'auto', `${mode}: task_update auto`);
    assertEqual(reg.checkPermission('task_list'), 'auto', `${mode}: task_list auto`);
    assertEqual(reg.checkPermission('task_get'), 'auto', `${mode}: task_get auto`);
  }
}

// ═══════════════════════════════════════════════════════
// 测试 8: git_branch 输入感知（核心修复 #1）
// ═══════════════════════════════════════════════════════
function testGitBranchInputAware(): void {
  console.log('\n\x1b[1m── git_branch 输入感知（核心修复）──\x1b[0m');

  const agentReg = new ToolRegistry('agent');
  // 只读操作
  assertEqual(agentReg.checkPermission('git_branch', { action: 'list' }), 'auto', 'agent: git_branch list');
  assertEqual(agentReg.checkPermission('git_branch', { action: 'current' }), 'auto', 'agent: git_branch current');
  // 写操作
  assertEqual(agentReg.checkPermission('git_branch', { action: 'create', name: 'feat' }), 'ask', 'agent: git_branch create');
  assertEqual(agentReg.checkPermission('git_branch', { action: 'delete', name: 'feat' }), 'ask', 'agent: git_branch delete');
  assertEqual(agentReg.checkPermission('git_branch', { action: 'switch', name: 'main' }), 'ask', 'agent: git_branch switch');

  const planReg = new ToolRegistry('plan');
  assertEqual(planReg.checkPermission('git_branch', { action: 'list' }), 'auto', 'plan: git_branch list');
  assertEqual(planReg.checkPermission('git_branch', { action: 'create', name: 'feat' }), 'ask', 'plan: git_branch create');

  const yoloReg = new ToolRegistry('yolo');
  assertEqual(yoloReg.checkPermission('git_branch', { action: 'create' }), 'auto', 'yolo: git_branch create');
  assertEqual(yoloReg.checkPermission('git_branch', { action: 'list' }), 'auto', 'yolo: git_branch list');
}

// ═══════════════════════════════════════════════════════
// 测试 9: git_stash 输入感知（核心修复 #2）
// ═══════════════════════════════════════════════════════
function testGitStashInputAware(): void {
  console.log('\n\x1b[1m── git_stash 输入感知（核心修复）──\x1b[0m');

  const agentReg = new ToolRegistry('agent');
  // 只读操作
  assertEqual(agentReg.checkPermission('git_stash', { action: 'list' }), 'auto', 'agent: git_stash list');
  assertEqual(agentReg.checkPermission('git_stash', { action: 'show', index: 0 }), 'auto', 'agent: git_stash show');
  // 写操作
  assertEqual(agentReg.checkPermission('git_stash', { action: 'push' }), 'ask', 'agent: git_stash push');
  assertEqual(agentReg.checkPermission('git_stash', { action: 'pop' }), 'ask', 'agent: git_stash pop');
  assertEqual(agentReg.checkPermission('git_stash', { action: 'drop', index: 0 }), 'ask', 'agent: git_stash drop');

  const planReg = new ToolRegistry('plan');
  assertEqual(planReg.checkPermission('git_stash', { action: 'list' }), 'auto', 'plan: git_stash list');
  assertEqual(planReg.checkPermission('git_stash', { action: 'push' }), 'ask', 'plan: git_stash push');
  assertEqual(planReg.checkPermission('git_stash', { action: 'pop' }), 'ask', 'plan: git_stash pop');

  const yoloReg = new ToolRegistry('yolo');
  assertEqual(yoloReg.checkPermission('git_stash', { action: 'push' }), 'auto', 'yolo: git_stash push');
  assertEqual(yoloReg.checkPermission('git_stash', { action: 'list' }), 'auto', 'yolo: git_stash list');
}

// ═══════════════════════════════════════════════════════
// 测试 10: git_checkout 输入感知
// ═══════════════════════════════════════════════════════
function testGitCheckoutInputAware(): void {
  console.log('\n\x1b[1m── git_checkout 输入感知 ──\x1b[0m');

  const agentReg = new ToolRegistry('agent');
  assertEqual(agentReg.checkPermission('git_checkout', { target: 'main' }), 'auto', 'agent: git_checkout switch branch');
  assertEqual(agentReg.checkPermission('git_checkout', { target: 'file.txt', file: true }), 'ask', 'agent: git_checkout restore file');
  assertEqual(agentReg.checkPermission('git_checkout', { target: 'feat', create: true }), 'auto', 'agent: git_checkout create branch');

  const planReg = new ToolRegistry('plan');
  assertEqual(planReg.checkPermission('git_checkout', { target: 'main' }), 'auto', 'plan: git_checkout switch');
  assertEqual(planReg.checkPermission('git_checkout', { target: 'file.txt', file: true }), 'ask', 'plan: git_checkout restore file');
}

// ═══════════════════════════════════════════════════════
// 测试 11: MCP 工具权限
// ═══════════════════════════════════════════════════════
function testMcpPermissions(): void {
  console.log('\n\x1b[1m── MCP 外部工具权限 ──\x1b[0m');

  // Plan 模式: 读操作 auto，写操作 denied
  const planReg = new ToolRegistry('plan');
  assertEqual(planReg.checkPermission('mcp__db__read_records'), 'auto', 'plan: MCP read auto');
  assertEqual(planReg.checkPermission('mcp__db__list_tables'), 'auto', 'plan: MCP list auto');
  assertEqual(planReg.checkPermission('mcp__db__get_status'), 'auto', 'plan: MCP get auto');
  assertEqual(planReg.checkPermission('mcp__db__query_data'), 'auto', 'plan: MCP query auto');
  assertEqual(planReg.checkPermission('mcp__db__search_items'), 'auto', 'plan: MCP search auto');
  assertEqual(planReg.checkPermission('mcp__db__view_record'), 'auto', 'plan: MCP view auto');
  assertEqual(planReg.checkPermission('mcp__db__show_details'), 'auto', 'plan: MCP show auto');
  assertEqual(planReg.checkPermission('mcp__db__check_health'), 'auto', 'plan: MCP check auto');
  assertEqual(planReg.checkPermission('mcp__db__inspect_schema'), 'auto', 'plan: MCP inspect auto');
  assertEqual(planReg.checkPermission('mcp__db__describe_table'), 'auto', 'plan: MCP describe auto');
  assertEqual(planReg.checkPermission('mcp__db__fetch_data'), 'auto', 'plan: MCP fetch auto');
  assertEqual(planReg.checkPermission('mcp__db__verify_integrity'), 'auto', 'plan: MCP verify auto');
  assertEqual(planReg.checkPermission('mcp__db__info_version'), 'auto', 'plan: MCP info auto');
  assertEqual(planReg.checkPermission('mcp__db__log_history'), 'auto', 'plan: MCP log auto');
  assertEqual(planReg.checkPermission('mcp__db__status_check'), 'auto', 'plan: MCP status auto');

  assertEqual(planReg.checkPermission('mcp__db__write_record'), 'denied', 'plan: MCP write denied');
  assertEqual(planReg.checkPermission('mcp__db__delete_record'), 'denied', 'plan: MCP delete denied');
  assertEqual(planReg.checkPermission('mcp__db__create_table'), 'denied', 'plan: MCP create denied');
  assertEqual(planReg.checkPermission('mcp__db__update_record'), 'denied', 'plan: MCP update denied');
  assertEqual(planReg.checkPermission('mcp__db__execute_command'), 'denied', 'plan: MCP execute denied');
  assertEqual(planReg.checkPermission('mcp__db__drop_table'), 'denied', 'plan: MCP drop denied');
  assertEqual(planReg.checkPermission('mcp__fs__write_file'), 'denied', 'plan: MCP fs write denied');

  // Agent/YOLO 模式: 全部 auto
  const agentReg = new ToolRegistry('agent');
  assertEqual(agentReg.checkPermission('mcp__db__write_record'), 'auto', 'agent: MCP write auto');
  assertEqual(agentReg.checkPermission('mcp__db__delete_record'), 'auto', 'agent: MCP delete auto');
  assertEqual(agentReg.checkPermission('mcp__db__read_records'), 'auto', 'agent: MCP read auto');

  const yoloReg = new ToolRegistry('yolo');
  assertEqual(yoloReg.checkPermission('mcp__db__write_record'), 'auto', 'yolo: MCP write auto');
}

// ═══════════════════════════════════════════════════════
// 测试 12: Notebook 和 Image 工具
// ═══════════════════════════════════════════════════════
function testNotebookAndImage(): void {
  console.log('\n\x1b[1m── Notebook & Image 工具 ──\x1b[0m');

  const agentReg = new ToolRegistry('agent');
  assertEqual(agentReg.checkPermission('notebook_read'), 'auto', 'agent: notebook_read auto');
  assertEqual(agentReg.checkPermission('notebook_edit'), 'ask', 'agent: notebook_edit ask');
  assertEqual(agentReg.checkPermission('image_read'), 'auto', 'agent: image_read auto');
  assertEqual(agentReg.checkPermission('file_upload'), 'ask', 'agent: file_upload ask');

  const planReg = new ToolRegistry('plan');
  assertEqual(planReg.checkPermission('notebook_read'), 'auto', 'plan: notebook_read auto');
  assertEqual(planReg.checkPermission('notebook_edit'), 'denied', 'plan: notebook_edit denied');
  assertEqual(planReg.checkPermission('image_read'), 'auto', 'plan: image_read auto');
  assertEqual(planReg.checkPermission('file_upload'), 'denied', 'plan: file_upload denied');
}

// ═══════════════════════════════════════════════════════
// 测试 13: 完整 36 工具 × 3 模式 权限矩阵验证
// ═══════════════════════════════════════════════════════
function testFullMatrix(): void {
  console.log('\n\x1b[1m── 完整权限矩阵 (36 工具 × 3 模式) ──\x1b[0m');

  const planExpected: Record<string, string> = {
    file_read: 'auto', file_write: 'denied', file_edit: 'denied', shell_exec: 'denied',
    grep_search: 'auto', glob_match: 'auto',
    browser_navigate: 'auto', browser_read: 'auto', browser_find: 'auto',
    browser_click: 'ask', browser_type: 'ask', browser_screenshot: 'auto',
    browser_execute_js: 'ask', browser_network: 'auto', browser_console: 'auto',
    web_search: 'auto', web_fetch: 'auto',
    git_status: 'auto', git_diff: 'auto', git_log: 'auto', git_branch: 'ask',
    git_commit: 'ask', git_checkout: 'ask', git_stash: 'ask', git_pr: 'ask',
    git_blame: 'auto', git_issue: 'ask', git_release: 'ask',
    task_create: 'auto', task_update: 'auto', task_list: 'auto', task_get: 'auto',
    notebook_read: 'auto', notebook_edit: 'denied',
    image_read: 'auto', file_upload: 'denied',
  };

  const agentExpected: Record<string, string> = {
    file_read: 'auto', file_write: 'ask', file_edit: 'ask', shell_exec: 'ask',
    grep_search: 'auto', glob_match: 'auto',
    browser_navigate: 'auto', browser_read: 'auto', browser_find: 'auto',
    browser_click: 'ask', browser_type: 'ask', browser_screenshot: 'auto',
    browser_execute_js: 'ask', browser_network: 'auto', browser_console: 'auto',
    web_search: 'auto', web_fetch: 'auto',
    git_status: 'auto', git_diff: 'auto', git_log: 'auto', git_branch: 'ask',
    git_commit: 'ask', git_checkout: 'ask', git_stash: 'ask', git_pr: 'ask',
    git_blame: 'auto', git_issue: 'ask', git_release: 'ask',
    task_create: 'auto', task_update: 'auto', task_list: 'auto', task_get: 'auto',
    notebook_read: 'auto', notebook_edit: 'ask',
    image_read: 'auto', file_upload: 'ask',
  };

  const allTools = Object.keys(planExpected);

  const planReg = new ToolRegistry('plan');
  const agentReg = new ToolRegistry('agent');
  const yoloReg = new ToolRegistry('yolo');

  let matrixPassed = 0;
  for (const tool of allTools) {
    const planActual = planReg.checkPermission(tool);
    const agentActual = agentReg.checkPermission(tool);
    const yoloActual = yoloReg.checkPermission(tool);

    if (planActual === planExpected[tool]) matrixPassed++;
    else console.log(`  \x1b[31m  plan:${tool} = ${planActual} (expected ${planExpected[tool]})\x1b[0m`);

    if (agentActual === agentExpected[tool]) matrixPassed++;
    else console.log(`  \x1b[31m  agent:${tool} = ${agentActual} (expected ${agentExpected[tool]})\x1b[0m`);

    if (yoloActual === 'auto') matrixPassed++;
    else console.log(`  \x1b[31m  yolo:${tool} = ${yoloActual} (expected auto)\x1b[0m`);
  }

  assert(matrixPassed === allTools.length * 3, `矩阵验证: ${matrixPassed}/${allTools.length * 3} 全部正确`);
}

// ═══════════════════════════════════════════════════════
// 测试 14: 输入参数传递验证
// ═══════════════════════════════════════════════════════
function testInputPropagation(): void {
  console.log('\n\x1b[1m── 输入参数传递验证 ──\x1b[0m');

  const reg = new ToolRegistry('plan');

  // 无输入时，git_branch 回退到 gitWriteTools 默认 (ask)
  assertEqual(reg.checkPermission('git_branch'), 'ask', 'plan: git_branch (no input) ask');

  // 有输入时，根据 action 区分
  assertEqual(reg.checkPermission('git_branch', { action: 'list' }), 'auto', 'plan: git_branch (list) auto');
  assertEqual(reg.checkPermission('git_branch', { action: 'create' }), 'ask', 'plan: git_branch (create) ask');

  // git_stash 无输入时
  assertEqual(reg.checkPermission('git_stash'), 'ask', 'plan: git_stash (no input) ask');

  // git_checkout 无输入时
  assertEqual(reg.checkPermission('git_checkout'), 'ask', 'plan: git_checkout (no input) ask');
  assertEqual(reg.checkPermission('git_checkout', { target: 'main' }), 'auto', 'plan: git_checkout (switch) auto');
}

// ═══════════════════════════════════════════════════════
// 测试 15: 边界情况
// ═══════════════════════════════════════════════════════
function testEdgeCases(): void {
  console.log('\n\x1b[1m── 边界情况 ──\x1b[0m');

  // 空输入对象
  const reg = new ToolRegistry('agent');
  assertEqual(reg.checkPermission('git_branch', {}), 'ask', 'agent: git_branch (empty input) ask');
  assertEqual(reg.checkPermission('git_stash', {}), 'ask', 'agent: git_stash (empty input) ask');

  // 未知工具回退
  assertEqual(reg.checkPermission('some_unknown_tool'), 'ask', 'agent: unknown tool ask');
  assertEqual(new ToolRegistry('plan').checkPermission('some_unknown_tool'), 'ask', 'plan: unknown tool ask');

  // MCP 工具名包含双下划线
  assertEqual(
    new ToolRegistry('plan').checkPermission('mcp__complex_server__get_data_from_db'),
    'auto',
    'plan: MCP complex name read auto'
  );
  assertEqual(
    new ToolRegistry('plan').checkPermission('mcp__complex_server__write_data_to_db'),
    'denied',
    'plan: MCP complex name write denied'
  );
}

// ═══════════════════════════════════════════════════════
// 运行所有测试
// ═══════════════════════════════════════════════════════
console.log('\n\x1b[1m\x1b[36m═════════════════════════════════════════\x1b[0m');
console.log('\x1b[1m\x1b[36m  MIMO CLI 权限系统综合测试\x1b[0m');
console.log('\x1b[1m\x1b[36m═════════════════════════════════════════\x1b[0m');

testModeManager();
testModeManagerAllTools();
testModeManagerInputAware();
testRegistryReadOnly();
testRegistryWriteTools();
testRegistryBrowserWrite();
testRegistryTask();
testGitBranchInputAware();
testGitStashInputAware();
testGitCheckoutInputAware();
testMcpPermissions();
testNotebookAndImage();
testFullMatrix();
testInputPropagation();
testEdgeCases();

console.log('\n\x1b[1m\x1b[36m═════════════════════════════════════════\x1b[0m');
if (failed === 0) {
  console.log(`\x1b[1m\x1b[32m  ✓ 全部通过: ${passed}/${total} 测试\x1b[0m`);
} else {
  console.log(`\x1b[1m\x1b[31m  ✗ ${failed} 个失败 / ${passed} 个通过 / ${total} 总计\x1b[0m`);
}
console.log('\x1b[1m\x1b[36m═════════════════════════════════════════\x1b[0m\n');

process.exit(failed > 0 ? 1 : 0);
