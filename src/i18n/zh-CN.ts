import type { Locale } from './locale';

const zhCN: Record<string, Record<Locale, string>> = {
  // ─── Commands ───────────────────────────────────────
  'commands.help.title': { 'zh-CN': '命令', 'en-US': 'Commands' },
  'commands.help.plan': { 'zh-CN': '计划管理', 'en-US': 'Plan management' },
  'commands.help.mode': { 'zh-CN': '查看/切换模式', 'en-US': 'View/switch mode' },
  'commands.help.model': { 'zh-CN': '显示当前模型', 'en-US': 'Show current model' },
  'commands.help.memory': { 'zh-CN': '显示记忆统计', 'en-US': 'Show memory stats' },
  'commands.help.skills': { 'zh-CN': '列出所有技能', 'en-US': 'List all skills' },
  'commands.help.stats': { 'zh-CN': '显示 Token 用量', 'en-US': 'Show token usage' },
  'commands.help.clear': { 'zh-CN': '清空对话历史', 'en-US': 'Clear conversation history' },
  'commands.help.compact': { 'zh-CN': '压缩上下文历史', 'en-US': 'Compress context history' },
  'commands.help.undo': { 'zh-CN': '回滚上一次文件编辑', 'en-US': 'Revert last file edit' },
  'commands.help.backtrack': { 'zh-CN': '回退到上一个用户 prompt', 'en-US': 'Backtrack to last user prompt' },
  'commands.help.fork': { 'zh-CN': '在当前点分叉会话', 'en-US': 'Fork session at current point' },
  'commands.help.timeline': { 'zh-CN': '显示会话时间线', 'en-US': 'Show session timeline' },
  'commands.help.resume': { 'zh-CN': '恢复上一个会话', 'en-US': 'Resume last session' },
  'commands.help.quit': { 'zh-CN': '退出', 'en-US': 'Quit' },

  // ─── Shortcuts ──────────────────────────────────────
  'shortcuts.tab': { 'zh-CN': '切换模式', 'en-US': 'Cycle mode' },
  'shortcuts.shiftTab': { 'zh-CN': '切换推理强度', 'en-US': 'Toggle reasoning' },
  'shortcuts.ctrlK': { 'zh-CN': '命令面板', 'en-US': 'Command palette' },
  'shortcuts.ctrlL': { 'zh-CN': '清屏', 'en-US': 'Clear screen' },

  // ─── Modes ──────────────────────────────────────────
  'mode.plan': { 'zh-CN': 'Plan 模式', 'en-US': 'Plan mode' },
  'mode.agent': { 'zh-CN': 'Agent 模式', 'en-US': 'Agent mode' },
  'mode.custom': { 'zh-CN': 'Custom 模式', 'en-US': 'Custom mode' },
  'mode.yolo': { 'zh-CN': 'YOLO 模式', 'en-US': 'YOLO mode' },
  'mode.switched': { 'zh-CN': '已切换到 {0} 模式', 'en-US': 'Switched to {0} mode' },

  // ─── API Errors ─────────────────────────────────────
  'errors.api.401': { 'zh-CN': 'API Key 无效。请运行 mimo init 重新配置。', 'en-US': 'Invalid API Key. Run mimo init to reconfigure.' },
  'errors.api.429': { 'zh-CN': 'API 请求被拒绝(429)。请检查 API Key 和代理配置。', 'en-US': 'Request rejected (429). Check API key and proxy config.' },
  'errors.api.529': { 'zh-CN': 'API 过载。请稍等片刻后重试。', 'en-US': 'API overloaded. Please wait and retry.' },
  'errors.api.connection': { 'zh-CN': '无法连接 API。请检查网络和端点配置。', 'en-US': 'Cannot connect to API. Check network and endpoint config.' },
  'errors.api.timeout': { 'zh-CN': 'API 请求超时。', 'en-US': 'API request timed out.' },
  'errors.api.403': { 'zh-CN': 'API 访问被拒绝。请检查 API Key 权限。', 'en-US': 'API access forbidden. Check API key permissions.' },
  'errors.api.500': { 'zh-CN': 'API 服务暂时不可用。请稍后重试。', 'en-US': 'API service temporarily unavailable. Please retry later.' },
  'errors.api.generic': { 'zh-CN': 'API 错误: {0}', 'en-US': 'API error: {0}' },

  // ─── Security ───────────────────────────────────────
  'security.blocked': { 'zh-CN': '安全拦截: {0}', 'en-US': 'Security block: {0}' },
  'security.warning': { 'zh-CN': '安全警告: {0}', 'en-US': 'Security warning: {0}' },
  'security.injection': { 'zh-CN': '检测到可能的注入攻击', 'en-US': 'Possible injection attack detected' },
  'security.path_traversal': { 'zh-CN': '检测到路径遍历尝试', 'en-US': 'Path traversal attempt detected' },
  'security.env_write': { 'zh-CN': '不允许写入 .env 文件', 'en-US': 'Writing to .env files is not allowed' },

  // ─── Tool Operations ────────────────────────────────
  'tool.approval.request': { 'zh-CN': '请求执行: {0}', 'en-US': 'Request to execute: {0}' },
  'tool.approval.allow': { 'zh-CN': '允许', 'en-US': 'Allow' },
  'tool.approval.deny': { 'zh-CN': '拒绝', 'en-US': 'Deny' },
  'tool.approval.yolo': { 'zh-CN': '全部允许 (YOLO)', 'en-US': 'Allow all (YOLO)' },
  'tool.denied': { 'zh-CN': '跳过: {0} (当前模式不允许)', 'en-US': 'Skipped: {0} (not allowed in current mode)' },
  'tool.rejected': { 'zh-CN': '已拒绝: {0}', 'en-US': 'Rejected: {0}' },
  'tool.hook_rejected': { 'zh-CN': '被 Hook 拒绝: {0}', 'en-US': 'Rejected by hook: {0}' },

  // ─── Session ────────────────────────────────────────
  'session.found': { 'zh-CN': '发现最近会话 ({0} 轮, {1} 分钟前)', 'en-US': 'Found recent session ({0} turns, {1} min ago)' },
  'session.resume_hint': { 'zh-CN': '输入 /resume 恢复，或继续新对话', 'en-US': 'Type /resume to restore, or continue new conversation' },
  'session.restored': { 'zh-CN': '已恢复会话 {0} ({1} 轮, {2} 个文件被修改)', 'en-US': 'Restored session {0} ({1} turns, {2} files modified)' },
  'session.no_resume': { 'zh-CN': '没有可恢复的会话', 'en-US': 'No session to resume' },
  'session.saved': { 'zh-CN': '会话已保存', 'en-US': 'Session saved' },
  'session.end': { 'zh-CN': '会话结束 · 修改了 {0} 个文件 · {1} 轮对话', 'en-US': 'Session ended · {0} files modified · {1} turns' },

  // ─── Memory ─────────────────────────────────────────
  'memory.extracted': { 'zh-CN': '已保存记忆: {0}', 'en-US': 'Memory saved: {0}' },
  'memory.extract_failed': { 'zh-CN': '记忆提取失败: {0}', 'en-US': 'Memory extraction failed: {0}' },
  'memory.total': { 'zh-CN': '共 {0} 条记忆', 'en-US': 'Total {0} memories' },

  // ─── Plan ───────────────────────────────────────────
  'plan.created': { 'zh-CN': '已创建计划: {0}', 'en-US': 'Plan created: {0}' },
  'plan.approved': { 'zh-CN': '计划已批准，切换回 agent 模式', 'en-US': 'Plan approved, switching to agent mode' },
  'plan.no_plan': { 'zh-CN': '当前无计划', 'en-US': 'No active plan' },
  'plan.steps_done': { 'zh-CN': '{0}/{1} 完成', 'en-US': '{0}/{1} done' },

  // ─── Compression ────────────────────────────────────
  'compress.start': { 'zh-CN': '正在压缩上下文...', 'en-US': 'Compressing context...' },
  'compress.done': { 'zh-CN': '已压缩 {0} 条消息', 'en-US': 'Compressed {0} messages' },

  // ─── Init ───────────────────────────────────────────
  'init.analyzing': { 'zh-CN': '正在分析项目...', 'en-US': 'Analyzing project...' },
  'init.generated': { 'zh-CN': '已生成 CLAUDE.md ({0})', 'en-US': 'Generated CLAUDE.md ({0})' },
  'init.exists': { 'zh-CN': 'CLAUDE.md 已存在。使用 --force 覆盖。', 'en-US': 'CLAUDE.md already exists. Use --force to overwrite.' },

  // ─── Welcome ────────────────────────────────────────
  'welcome.title': { 'zh-CN': 'MIMO CLI Code', 'en-US': 'MIMO CLI Code' },
  'welcome.version': { 'zh-CN': 'v2.0.0', 'en-US': 'v2.0.0' },
  'welcome.hint': { 'zh-CN': 'Tab:mode T:reasoning Ctrl+K:commands /help', 'en-US': 'Tab:mode T:reasoning Ctrl+K:commands /help' },

  // ─── Agents ─────────────────────────────────────────
  'agents.spawning': { 'zh-CN': '正在生成子代理...', 'en-US': 'Spawning sub-agent...' },
  'agents.done': { 'zh-CN': '子代理完成 ({0} 轮, {1} 工具调用)', 'en-US': 'Sub-agent done ({0} turns, {1} tool calls)' },
  'agents.failed': { 'zh-CN': '子代理失败: {0}', 'en-US': 'Sub-agent failed: {0}' },
  'agents.active': { 'zh-CN': '活跃子代理:', 'en-US': 'Active sub-agents:' },

  // ─── Features ───────────────────────────────────────
  'features.count': { 'zh-CN': '共 {0} 个创新功能', 'en-US': 'Total {0} innovation features' },

  // ─── Dispatch Engine ────────────────────────────────
  'dispatch.analyzing': { 'zh-CN': '正在分析意图...', 'en-US': 'Analyzing intent...' },
  'dispatch.planning': { 'zh-CN': '正在制定执行计划...', 'en-US': 'Creating execution plan...' },
  'dispatch.executing': { 'zh-CN': '正在执行计划 ({0} 步)...', 'en-US': 'Executing plan ({0} steps)...' },
  'dispatch.completed': { 'zh-CN': '计划执行完成 ({0}/{1} 步成功)', 'en-US': 'Plan completed ({0}/{1} steps succeeded)' },
  'dispatch.failed': { 'zh-CN': '计划执行失败: {0}', 'en-US': 'Plan execution failed: {0}' },
  'dispatch.adapting': { 'zh-CN': '正在调整执行策略...', 'en-US': 'Adapting execution strategy...' },
};

export default zhCN;
