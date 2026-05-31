import Anthropic from '@anthropic-ai/sdk';
import { AgentMode } from '../config/schema';
import { ModeManager, ToolPermission } from '../core/mode';
import { readFileTool, executeReadFile } from './file-read';
import { writeFileTool, executeWriteFile } from './file-write';
import { editFileTool, executeEditFile } from './file-edit';
import { shellTool, executeShell } from './shell';
import { grepTool, executeGrep } from './grep';
import { globTool, executeGlob } from './glob';
import {
  browserNavigateTool, browserReadTool, browserFindTool,
  browserClickTool, browserTypeTool, browserHoverTool,
  browserScrollTool, browserDragTool, browserScreenshotTool,
  browserExecuteJsTool, browserFormInputTool, browserFileUploadTool,
  browserTabsListTool, browserTabsCreateTool, browserTabsCloseTool, browserTabsSwitchTool,
  browserGifStartTool, browserGifStopTool, browserGifExportTool,
  browserNetworkTool, browserConsoleTool, browserConsoleReadTool, browserNetworkReadTool,
  browserSelectBrowserTool, browserResizeTool,
} from './browser/definitions';
import {
  executeBrowserNavigate, executeBrowserRead, executeBrowserFind,
  executeBrowserClick, executeBrowserType, executeBrowserHover,
  executeBrowserScroll, executeBrowserDrag, executeBrowserScreenshot,
  executeBrowserExecuteJs, executeBrowserFormInput, executeBrowserFileUpload,
  executeBrowserTabsList, executeBrowserTabsCreate, executeBrowserTabsClose, executeBrowserTabsSwitch,
  executeBrowserGifStart, executeBrowserGifStop, executeBrowserGifExport,
  executeBrowserNetwork, executeBrowserConsole, executeBrowserConsoleRead, executeBrowserNetworkRead,
  executeBrowserSelectBrowser, executeBrowserResize,
} from './browser/engine';
import { webSearchTool, webFetchTool, executeWebSearch, executeWebFetch } from './web/search';
import {
  gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool,
  gitCommitTool, gitCheckoutTool, gitStashTool, gitPrTool, gitBlameTool,
  gitIssueTool, gitReleaseTool,
  executeGitStatus, executeGitDiff, executeGitLog, executeGitBranch,
  executeGitCommit, executeGitCheckout, executeGitStash, executeGitPr, executeGitBlame,
  executeGitIssue, executeGitRelease,
} from './git/git-tools';
import {
  taskCreateTool, taskUpdateTool, taskListTool, taskGetTool,
  executeTaskCreate, executeTaskUpdate, executeTaskList, executeTaskGet,
} from '../task/manager';
import { notebookReadTool, notebookEditTool, executeNotebookRead, executeNotebookEdit } from './notebook/notebook';
import {
  computerScreenshotTool, computerClickTool, computerTypeTool, computerKeyTool,
  computerMouseMoveTool, computerDragTool, computerScrollTool, computerWaitTool,
  computerGetCursorTool,
} from './computer/definitions';
import {
  executeComputerScreenshot, executeComputerClick, executeComputerType, executeComputerKey,
  executeComputerMouseMove, executeComputerDrag, executeComputerScroll, executeComputerWait,
  executeComputerGetCursor,
} from './computer/engine';
import { imageReadTool, fileUploadTool, executeImageRead, executeFileUpload } from './image/image';
import { autoReviewTool } from './review/definitions';
import { executeAutoReview } from './review/auto-review';
import { cyberScanTool, executeCyberScan } from '../security/cyber-safety-definitions';

// New: LSP, RLM, Audit tools
import { lspDiagnosticsTool, executeLSPDiagnostics } from './lsp/definitions';
import { rlmOpenTool, rlmEvalTool, rlmCloseTool, rlmListTool, executeRLMOpen, executeRLMEval, executeRLMClose, executeRLMList } from '../rlm/definitions';
import { auditQueryTool, auditReportTool, executeAuditQuery, executeAuditReport } from '../audit/definitions';

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  permission: string;
}

export interface ToolResult {
  output: string;
  isError: boolean;
}

export interface ExternalTool {
  server: string;
  name: string;
  description: string;
  input_schema: any;
}

// MCP 只读工具名模式（读取/列表/搜索/查询类操作）
const MCP_READ_ONLY_PATTERNS = [
  /read/i, /list/i, /get/i, /search/i, /find/i, /query/i,
  /status/i, /log/i, /info/i, /describe/i, /fetch/i,
  /view/i, /show/i, /check/i, /verify/i, /inspect/i,
  /count/i, /stats/i, /health/i, /ping/i, /diff/i,
];

function isMcpReadOnlyTool(toolName: string): boolean {
  // mcp__<server>__<tool_name>
  const parts = toolName.split('__');
  const realName = parts.slice(2).join('__');
  return MCP_READ_ONLY_PATTERNS.some((p) => p.test(realName));
}

export class ToolRegistry {
  private modeManager: ModeManager;
  private tools: ToolDefinition[];
  private externalTools: ExternalTool[] = [];
  private externalToolCaller?: (server: string, toolName: string, args: Record<string, any>) => Promise<any>;
  private featureTools: Array<{ name: string; definition: any; execute: (input: any) => Promise<any> }> = [];

  constructor(mode: AgentMode) {
    this.modeManager = new ModeManager(mode);
    this.tools = [
      // 核心文件工具
      readFileTool, writeFileTool, editFileTool,
      // Shell
      shellTool,
      // 搜索
      grepTool, globTool,
      // 浏览器 (25 tools)
      browserNavigateTool, browserReadTool, browserFindTool,
      browserClickTool, browserTypeTool, browserHoverTool,
      browserScrollTool, browserDragTool, browserScreenshotTool,
      browserExecuteJsTool, browserFormInputTool, browserFileUploadTool,
      browserTabsListTool, browserTabsCreateTool, browserTabsCloseTool, browserTabsSwitchTool,
      browserGifStartTool, browserGifStopTool, browserGifExportTool,
      browserNetworkTool, browserConsoleTool, browserConsoleReadTool, browserNetworkReadTool,
      browserSelectBrowserTool, browserResizeTool,
      // Web
      webSearchTool, webFetchTool,
      // Git
      gitStatusTool, gitDiffTool, gitLogTool, gitBranchTool,
      gitCommitTool, gitCheckoutTool, gitStashTool, gitPrTool, gitBlameTool,
      gitIssueTool, gitReleaseTool,
      // Task
      taskCreateTool, taskUpdateTool, taskListTool, taskGetTool,
      // Notebook
      notebookReadTool, notebookEditTool,
      // Image
      imageReadTool, fileUploadTool,
      // Computer (desktop GUI automation)
      computerScreenshotTool, computerClickTool, computerTypeTool, computerKeyTool,
      computerMouseMoveTool, computerDragTool, computerScrollTool, computerWaitTool,
      computerGetCursorTool,
      // Auto Review
      autoReviewTool,
      // Cyber Safety
      cyberScanTool,
      // LSP Diagnostics
      lspDiagnosticsTool,
      // RLM (Recursive Language Model)
      rlmOpenTool, rlmEvalTool, rlmCloseTool, rlmListTool,
      // Audit
      auditQueryTool, auditReportTool,
    ];
  }

  // 注入 MCP 外部工具
  setExternalTools(tools: ExternalTool[], caller: (server: string, toolName: string, args: Record<string, any>) => Promise<any>): void {
    this.externalTools = tools;
    this.externalToolCaller = caller;
  }

  // 注入 Feature 工具
  setFeatureTools(tools: Array<{ name: string; definition: any; execute: (input: any) => Promise<any> }>): void {
    this.featureTools = tools;
  }

  getExternalTools(): ExternalTool[] {
    return this.externalTools;
  }

  getFeatureTools(): Array<{ name: string; definition: any; execute: (input: any) => Promise<any> }> {
    return this.featureTools;
  }

  getDefinitions(): Anthropic.Tool[] {
    const builtinTools = this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));
    const mcpTools = this.externalTools.map((t) => ({
      name: `mcp__${t.server}__${t.name}`,
      description: `[MCP:${t.server}] ${t.description}`,
      input_schema: t.input_schema,
    }));
    const featureToolDefs = this.featureTools.map((t) => ({
      name: t.name,
      description: t.definition?.description || '',
      input_schema: t.definition?.input_schema || { type: 'object' as const, properties: {} },
    }));
    return [...builtinTools, ...mcpTools, ...featureToolDefs];
  }

  getToolNames(): string[] {
    return [...this.tools.map((t) => t.name), ...this.featureTools.map((t) => t.name)];
  }

  checkPermission(toolName: string, input?: Record<string, any>): ToolPermission {
    // 只读工具 — 自动批准
    const readOnlyTools = [
      'file_read', 'grep_search', 'glob_match',
      'browser_navigate', 'browser_read', 'browser_find',
      'browser_screenshot', 'browser_network', 'browser_console',
      'browser_hover', 'browser_scroll', 'browser_tabs_list',
      'browser_console_read', 'browser_network_read',
      'web_search', 'web_fetch',
      'git_status', 'git_diff', 'git_log', 'git_blame',
      'task_list', 'task_get',
      'notebook_read', 'image_read',
      'computer_screenshot', 'computer_mouse_move', 'computer_scroll', 'computer_get_cursor', 'computer_wait',
      'auto_review', 'cyber_scan',
    ];
    if (readOnlyTools.includes(toolName)) return 'auto';

    // Git 操作 — 根据模式（输入感知：部分子操作为只读）
    const gitWriteTools = ['git_branch', 'git_commit', 'git_checkout', 'git_stash', 'git_pr', 'git_issue', 'git_release'];
    if (gitWriteTools.includes(toolName)) {
      // 输入感知：部分 git 工具有只读子操作
      if (input) {
        // git_branch: list/current 是只读
        if (toolName === 'git_branch') {
          if (input.action === 'list' || input.action === 'current') return 'auto';
        }
        // git_stash: list/show 是只读
        if (toolName === 'git_stash') {
          if (input.action === 'list' || input.action === 'show') return 'auto';
        }
        // git_checkout: file 恢复是写操作，切换分支是只读
        if (toolName === 'git_checkout') {
          if (!input.file) return 'auto';
        }
      }
      return this.modeManager.getMode() === 'yolo' ? 'auto' : 'ask';
    }

    // Task 操作 — 自动
    if (['task_create', 'task_update'].includes(toolName)) return 'auto';

    // 浏览器交互 + Computer（桌面 GUI 交互）
    if (['browser_click', 'browser_type', 'browser_execute_js', 'browser_form_input',
         'browser_file_upload', 'browser_drag', 'browser_tabs_close',
         'browser_gif_start', 'browser_gif_stop', 'browser_gif_export',
         'browser_select_browser', 'browser_resize',
         'computer_click', 'computer_type', 'computer_key', 'computer_drag'].includes(toolName)) {
      return this.modeManager.getMode() === 'yolo' ? 'auto' : 'ask';
    }

    // MCP 外部工具 — 区分读/写操作
    if (toolName.startsWith('mcp__')) {
      if (this.modeManager.getMode() === 'plan') {
        return isMcpReadOnlyTool(toolName) ? 'auto' : 'denied';
      }
      return 'auto';
    }

    return this.modeManager.getToolPermission(toolName);
  }

  async execute(toolName: string, input: Record<string, any>): Promise<ToolResult> {
    const permission = this.checkPermission(toolName, input);
    if (permission === 'denied') {
      return { output: `错误：当前模式不允许执行 ${toolName}`, isError: true };
    }

    try {
      // MCP 外部工具路由
      if (toolName.startsWith('mcp__') && this.externalToolCaller) {
        const parts = toolName.split('__');
        if (parts.length >= 3) {
          const server = parts[1];
          const realToolName = parts.slice(2).join('__');
          try {
            const result = await this.externalToolCaller(server, realToolName, input);
            return {
              output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
              isError: false,
            };
          } catch (err: any) {
            return {
              output: `MCP 工具 ${server}/${realToolName} 执行失败: ${err.message || String(err)}`,
              isError: true,
            };
          }
        }
      }

      // Feature 工具路由
      const featureTool = this.featureTools.find((t) => t.name === toolName);
      if (featureTool) {
        try {
          const result = await featureTool.execute(input);
          return { output: result.output || JSON.stringify(result), isError: result.isError || false };
        } catch (err: any) {
          return {
            output: `Feature 工具 ${toolName} 执行失败: ${err.message || String(err)}`,
            isError: true,
          };
        }
      }

      switch (toolName) {
        // 文件
        case 'file_read':           return await executeReadFile(input);
        case 'file_write':          return await executeWriteFile(input);
        case 'file_edit':           return await executeEditFile(input);
        // Shell
        case 'shell_exec':          return await executeShell(input);
        // 搜索
        case 'grep_search':         return await executeGrep(input);
        case 'glob_match':          return await executeGlob(input);
        // 浏览器
        case 'browser_navigate':    return await executeBrowserNavigate(input);
        case 'browser_read':        return await executeBrowserRead(input);
        case 'browser_find':        return await executeBrowserFind(input);
        case 'browser_click':       return await executeBrowserClick(input);
        case 'browser_type':        return await executeBrowserType(input);
        case 'browser_hover':       return await executeBrowserHover(input);
        case 'browser_scroll':      return await executeBrowserScroll(input);
        case 'browser_drag':        return await executeBrowserDrag(input);
        case 'browser_screenshot':  return await executeBrowserScreenshot(input);
        case 'browser_execute_js':  return await executeBrowserExecuteJs(input);
        case 'browser_form_input':  return await executeBrowserFormInput(input);
        case 'browser_file_upload': return await executeBrowserFileUpload(input);
        case 'browser_tabs_list':   return await executeBrowserTabsList(input);
        case 'browser_tabs_create': return await executeBrowserTabsCreate(input);
        case 'browser_tabs_close':  return await executeBrowserTabsClose(input);
        case 'browser_tabs_switch': return await executeBrowserTabsSwitch(input);
        case 'browser_gif_start':   return await executeBrowserGifStart(input);
        case 'browser_gif_stop':    return await executeBrowserGifStop(input);
        case 'browser_gif_export':  return await executeBrowserGifExport(input);
        case 'browser_network':     return await executeBrowserNetwork(input);
        case 'browser_console':     return await executeBrowserConsole(input);
        case 'browser_console_read':return await executeBrowserConsoleRead(input);
        case 'browser_network_read':return await executeBrowserNetworkRead(input);
        case 'browser_select_browser': return await executeBrowserSelectBrowser(input);
        case 'browser_resize':      return await executeBrowserResize(input);
        // Web
        case 'web_search':          return await executeWebSearch(input);
        case 'web_fetch':           return await executeWebFetch(input);
        // Git
        case 'git_status':          return await executeGitStatus(input);
        case 'git_diff':            return await executeGitDiff(input);
        case 'git_log':             return await executeGitLog(input);
        case 'git_branch':          return await executeGitBranch(input);
        case 'git_commit':          return await executeGitCommit(input);
        case 'git_checkout':        return await executeGitCheckout(input);
        case 'git_stash':           return await executeGitStash(input);
        case 'git_pr':              return await executeGitPr(input);
        case 'git_blame':           return await executeGitBlame(input);
        case 'git_issue':           return await executeGitIssue(input);
        case 'git_release':         return await executeGitRelease(input);
        // Task
        case 'task_create':         return await executeTaskCreate(input);
        case 'task_update':         return await executeTaskUpdate(input);
        case 'task_list':           return await executeTaskList(input);
        case 'task_get':            return await executeTaskGet(input);
        // Notebook
        case 'notebook_read':       return await executeNotebookRead(input);
        case 'notebook_edit':       return await executeNotebookEdit(input);
        // Image
        case 'image_read':          return await executeImageRead(input);
        case 'file_upload':         return await executeFileUpload(input);
        // Computer (desktop GUI automation)
        case 'computer_screenshot': return await executeComputerScreenshot(input);
        case 'computer_click':      return await executeComputerClick(input);
        case 'computer_type':       return await executeComputerType(input);
        case 'computer_key':        return await executeComputerKey(input);
        case 'computer_mouse_move': return await executeComputerMouseMove(input);
        case 'computer_drag':       return await executeComputerDrag(input);
        case 'computer_scroll':     return await executeComputerScroll(input);
        case 'computer_wait':       return await executeComputerWait(input);
        case 'computer_get_cursor': return await executeComputerGetCursor(input);
        // Auto Review
        case 'auto_review':         return await executeAutoReview(input);
        // Cyber Safety
        case 'cyber_scan':          return await executeCyberScan(input);
        // LSP Diagnostics
        case 'lsp_diagnostics':     return await executeLSPDiagnostics(input);
        // RLM
        case 'rlm_open':            return await executeRLMOpen(input);
        case 'rlm_eval':            return await executeRLMEval(input);
        case 'rlm_close':           return await executeRLMClose(input);
        case 'rlm_list':            return await executeRLMList(input);
        // Audit
        case 'audit_query':         return await executeAuditQuery(input);
        case 'audit_report':        return await executeAuditReport(input);
        // 未知
        default: {
          // Check if it looks like an MCP tool that lost its prefix
          const hint = toolName.includes('__') ? '' : ` (提示: MCP 工具名格式为 mcp__<server>__<tool>)`;
          return { output: `未知工具: ${toolName}${hint}`, isError: true };
        }
      }
    } catch (err: any) {
      return { output: `工具 ${toolName} 执行错误: ${err.message || String(err)}`, isError: true };
    }
  }
}
