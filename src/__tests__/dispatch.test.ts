// ── 调度引擎测试 ──────────────────────────────

import { DispatchEngine } from '../core/dispatch';
import { SkillRegistry } from '../skills/registry';
import { DynamicAgentLoader } from '../dynamic-agents/loader';
import { MCPClient } from '../mcp/client';
import { ToolRegistry } from '../tools/registry';
import { ModelRouter } from '../core/router';

async function testDispatch() {
  console.log('=== MIMO 智能调度引擎测试 ===\n');

  // 初始化依赖
  const skills = new SkillRegistry();
  await skills.init();

  const agents = new DynamicAgentLoader();
  await agents.loadAll();

  const mcpClient = new MCPClient();
  const tools = new ToolRegistry('agent');
  const router = new ModelRouter('auto');

  const engine = new DispatchEngine(skills, agents, mcpClient, tools, router);

  // 测试用例
  const testCases = [
    { input: '帮我写一个 React Hook', expectTarget: 'skill', expectId: 'react-expert' },
    { input: '优化 PostgreSQL 查询性能', expectTarget: 'skill', expectId: 'postgresql-expert' },
    { input: 'Docker 容器化部署', expectTarget: 'skill', expectId: 'docker-expert' },
    { input: '设计一个 UI 界面', expectTarget: 'skill', expectId: ['ui-ux-design', 'system-design'] },
    { input: '创建一个 3A 游戏引擎', expectTarget: ['skill', 'agent'], expectId: ['aaa-game-expert', 'game-ui-design', 'game-engine-expert'] },
    { input: '做一个图标设计系统', expectTarget: 'skill', expectId: 'icon-design' },
    { input: 'iOS SwiftUI 开发', expectTarget: ['skill', 'agent'], expectId: ['ios-expert', 'react-native-expert', 'macos-app-expert'] },
    { input: '鸿蒙 ArkTS 开发', expectTarget: ['skill', 'agent'], expectId: ['harmonyos-expert', '3d-design'] },
    { input: 'Android Jetpack Compose', expectTarget: ['skill', 'agent'], expectId: ['android-expert', 'docker-expert'] },
    { input: 'Go 微服务架构', expectTarget: 'skill', expectId: 'go-expert' },
    { input: 'Rust 系统编程', expectTarget: 'skill', expectId: 'rust-systems' },
    { input: 'CSS 动画效果', expectTarget: 'skill', expectId: 'css-architecture' },
    { input: '色彩配色方案', expectTarget: 'skill', expectId: 'color-design' },
    { input: '数据可视化图表', expectTarget: 'skill', expectId: 'data-visualization' },
    { input: '表单验证设计', expectTarget: 'skill', expectId: 'form-design' },
    { input: 'Dashboard 仪表板', expectTarget: 'skill', expectId: ['dashboard-design', 'data-visualization'] },
    { input: '着陆页设计', expectTarget: 'skill', expectId: 'landing-page-design' },
    { input: '游戏 UI 设计', expectTarget: 'skill', expectId: 'game-ui-design' },
    { input: '3D WebGL 渲染', expectTarget: 'skill', expectId: '3d-design' },
    { input: '电商购物车', expectTarget: 'skill', expectId: 'ecommerce-design' },
    { input: 'Logo 品牌设计', expectTarget: 'skill', expectId: 'logo-design' },
    { input: '动效设计 Framer Motion', expectTarget: 'skill', expectId: 'motion-design' },
    { input: '设计系统组件库', expectTarget: 'skill', expectId: 'design-system' },
    { input: '响应式布局', expectTarget: 'skill', expectId: 'responsive-design' },
    { input: '读取 src/index.ts 文件', expectTarget: 'builtin', expectId: 'file_read' },
    { input: '搜索所有 TypeScript 文件', expectTarget: 'builtin', expectId: 'grep_search' },
    { input: 'git commit 提交代码', expectTarget: 'builtin', expectId: 'git' },
    { input: 'npm install 安装依赖', expectTarget: 'builtin', expectId: 'shell_exec' },
    { input: '你好今天天气怎么样', expectTarget: 'model', expectId: 'default' },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const result = engine.dispatch(tc.input);
    const actual = result.primary;

    const expectTargets = Array.isArray(tc.expectTarget) ? tc.expectTarget : [tc.expectTarget];
    const targetOk = expectTargets.includes(actual.target);
    const expectIds = Array.isArray(tc.expectId) ? tc.expectId : [tc.expectId];
    const idOk = expectIds.includes(actual.id);
    const ok = targetOk && idOk;

    if (ok) {
      passed++;
      console.log(`  + PASS  [${actual.target}] ${actual.id} (${(actual.confidence * 100).toFixed(0)}%) <- "${tc.input.slice(0, 30)}..."`);
    } else {
      failed++;
      console.log(`  x FAIL  expected [${tc.expectTarget}] ${tc.expectId} but got [${actual.target}] ${actual.id} (${(actual.confidence * 100).toFixed(0)}%) <- "${tc.input.slice(0, 30)}..."`);
    }
  }

  console.log(`\n=== 结果: ${passed}/${testCases.length} passed, ${failed} failed ===\n`);

  // 统计
  const stats = engine.getStats();
  console.log('调度统计:');
  console.log(`  总调度: ${stats.total}`);
  console.log(`  平均置信度: ${(stats.avgConfidence * 100).toFixed(1)}%`);
  console.log(`  按目标分布:`);
  for (const [target, count] of Object.entries(stats.byTarget)) {
    if (count > 0) console.log(`    ${target}: ${count}`);
  }

  return failed === 0;
}

// 运行测试
testDispatch().then(ok => {
  process.exit(ok ? 0 : 1);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
