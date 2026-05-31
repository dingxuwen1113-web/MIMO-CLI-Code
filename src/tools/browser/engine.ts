// ── 浏览器引擎：基于 Playwright 的完整浏览器自动化 ──

import { ToolResult } from '../registry';
import * as fs from 'fs/promises';
import * as path from 'path';

let playwright: any = null;
let browser: any = null;
let browserContext: any = null;

// Tab management
interface TabState {
  id: number;
  page: any;
  url: string;
  title: string;
  networkRequests: any[];
  consoleLogs: any[];
  networkCapturing: boolean;
}

let tabs: TabState[] = [];
let activeTabId: number = 0;
let nextTabId: number = 1;

// GIF Recording state
let gifRecording = false;
let gifFrames: Buffer[] = [];
let gifInterval: NodeJS.Timeout | null = null;
let gifClickIndicators: Array<{ x: number; y: number; time: number }> = [];

// Browser profiles
interface BrowserProfile {
  name: string;
  headless: boolean;
  args: string[];
}
const profiles: Map<string, BrowserProfile> = new Map([
  ['default', { name: 'default', headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }],
  ['headed', { name: 'headed', headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] }],
  ['mobile', { name: 'mobile', headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }],
]);
let currentProfile = 'default';

// ── Lazy init ──────────────────────────────────────────
async function getPlaywright(): Promise<any> {
  if (!playwright) {
    try {
      playwright = await (Function('return import("playwright")')() as Promise<any>);
    } catch {
      throw new Error('Playwright 未安装。请运行: npm install playwright && npx playwright install chromium');
    }
  }
  return playwright;
}

async function ensureBrowser(): Promise<any> {
  if (!browser) {
    const pw = await getPlaywright();
    const profile = profiles.get(currentProfile) || profiles.get('default')!;
    browser = await pw.chromium.launch({
      headless: profile.headless,
      args: profile.args,
    });
  }
  return browser;
}

async function ensureContext(): Promise<any> {
  if (!browserContext) {
    const b = await ensureBrowser();
    const isMobile = currentProfile === 'mobile';
    browserContext = await b.newContext({
      userAgent: isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: isMobile ? { width: 375, height: 812 } : { width: 1280, height: 720 },
    });
  }
  return browserContext;
}

function getActiveTab(): TabState | undefined {
  return tabs.find(t => t.id === activeTabId);
}

async function createTab(url?: string): Promise<TabState> {
  const ctx = await ensureContext();
  const page = await ctx.newPage();
  const tabId = nextTabId++;

  const tab: TabState = {
    id: tabId,
    page,
    url: 'about:blank',
    title: 'New Tab',
    networkRequests: [],
    consoleLogs: [],
    networkCapturing: true,
  };

  page.on('console', (msg: any) => {
    tab.consoleLogs.push({ type: msg.type(), text: msg.text(), timestamp: Date.now() });
  });

  page.on('request', (req: any) => {
    if (!tab.networkCapturing) return;
    tab.networkRequests.push({
      method: req.method(), url: req.url(), resourceType: req.resourceType(),
      timestamp: Date.now(), status: undefined, _requestRef: req,
    });
  });

  page.on('response', (res: any) => {
    if (!tab.networkCapturing) return;
    const pending = tab.networkRequests.find(r => r._requestRef === res.request());
    if (pending) {
      pending.status = res.status();
      delete pending._requestRef;
    }
  });

  tabs.push(tab);

  if (url && url !== 'about:blank') {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    tab.url = page.url();
    tab.title = await page.title().catch(() => 'Untitled');
  }

  activeTabId = tabId;
  return tab;
}

async function getOrCreateTab(): Promise<TabState> {
  // Clean up any tabs whose pages have been closed (e.g. browser crash)
  tabs = tabs.filter(t => {
    try { return !t.page.isClosed(); } catch { return false; }
  });
  if (tabs.length === 0) activeTabId = 0;

  // If browser or context was closed, reset so they get re-created
  try {
    if (browser && !browser.isConnected()) {
      browser = null;
      browserContext = null;
      tabs = [];
      activeTabId = 0;
    }
  } catch { /* browser already gone */ }

  const existing = getActiveTab();
  if (existing) return existing;
  return createTab();
}

// ── Helper: resolve element ──────────────────────────
async function resolveElement(page: any, input: Record<string, any>): Promise<any | null> {
  if (input.selector) {
    try {
      return await page.$(input.selector);
    } catch {
      return null; // Invalid selector syntax
    }
  }
  if (input.ref) {
    // Try data-mimo-ref attribute
    try {
      const el = await page.$(`[data-mimo-ref="${input.ref}"]`);
      if (el) return el;
    } catch { /* ignore */ }
    // Try text match
    try {
      const el = await page.$(`text=${input.ref}`);
      if (el) return el;
    } catch { /* ignore */ }
  }
  return null;
}

// ══════════════════════════════════════════════════════════
//  Navigation & Reading
// ══════════════════════════════════════════════════════════

export async function executeBrowserNavigate(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const response = await tab.page.goto(input.url, {
      waitUntil: input.waitUntil || 'networkidle',
      timeout: 30000,
    });
    tab.url = tab.page.url();
    tab.title = await tab.page.title().catch(() => 'Untitled');
    const status = response?.status() || 0;
    const bodyText = await tab.page.evaluate(() =>
      (globalThis as any).document?.body?.innerText?.slice(0, 500) || ''
    );
    return { output: `导航成功 [tab:${tab.id}]\n标题: ${tab.title}\n状态: ${status}\nURL: ${tab.url}\n\n${bodyText}`, isError: false };
  } catch (err: any) {
    return { output: `导航失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserRead(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const maxChars = input.maxChars || 50000;

    let text: string;
    if (input.selector) {
      const element = await tab.page.$(input.selector);
      if (!element) return { output: `未找到元素: ${input.selector}`, isError: true };
      text = await element.innerText();
    } else {
      text = await tab.page.evaluate((max: number) => {
        const doc = (globalThis as any).document;
        const selectors = ['article', 'main', '[role="main"]', '.content', '.post-content', '.article-body'];
        for (const sel of selectors) {
          const el = doc.querySelector(sel);
          if (el && el.innerText && el.innerText.length > 200) return el.innerText.slice(0, max);
        }
        return doc.body?.innerText?.slice(0, max) || '';
      }, maxChars);
    }

    if (!text || text.trim().length === 0) {
      return { output: `# ${tab.title}\n\n(页面无文本内容。可能是一个单页应用、需要 JavaScript 渲染的页面，或仅包含图片/媒体。)`, isError: false };
    }

    return { output: `# ${tab.title}\n\n${text}`, isError: false };
  } catch (err: any) {
    return { output: `读取失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserFind(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const query = input.query;

    if (!query || query.trim().length === 0) {
      return { output: '查询内容不能为空', isError: true };
    }

    let elements = await tab.page.$$(query);
    if (elements.length === 0) elements = await tab.page.$$(`text=${query}`);
    if (elements.length === 0) elements = await tab.page.$$(`[aria-label*="${query}" i]`);
    if (elements.length === 0) {
      // Try partial text match via XPath
      const escapedQuery = query.replace(/"/g, '&quot;');
      elements = await tab.page.$$(`xpath=//*[contains(text(), "${escapedQuery}")]`);
    }
    if (elements.length === 0) return { output: `未找到匹配 "${query}" 的元素`, isError: false };

    const results: string[] = [];
    for (let i = 0; i < Math.min(elements.length, 15); i++) {
      const el = elements[i];
      const text = await el.innerText().catch(() => '');
      const tag = await el.evaluate((e: any) => e.tagName.toLowerCase());
      const attrs = await el.evaluate((e: any) => {
        const a: Record<string, string> = {};
        for (const attr of e.attributes) a[attr.name] = attr.value.slice(0, 100);
        return a;
      });
      // Assign ref for future use
      await el.evaluate((e: any, idx: number) => e.setAttribute('data-mimo-ref', `ref_${idx}`), i);
      results.push(`[ref_${i}] <${tag}> ${JSON.stringify(attrs).slice(0, 80)} → "${text.slice(0, 100)}"`);
    }

    return { output: `找到 ${elements.length} 个元素:\n${results.join('\n')}`, isError: false };
  } catch (err: any) {
    return { output: `查找失败: ${err.message}`, isError: true };
  }
}

// ══════════════════════════════════════════════════════════
//  Interaction
// ══════════════════════════════════════════════════════════

export async function executeBrowserClick(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const el = await resolveElement(tab.page, input);

    if (el) {
      const box = await el.boundingBox();
      if (box) gifClickIndicators.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, time: Date.now() });
      // Wait for possible navigation triggered by click
      await Promise.all([
        tab.page.waitForNavigation({ timeout: 5000, waitUntil: 'domcontentloaded' }).catch(() => {}),
        el.click({ timeout: 5000 }),
      ]);
    } else if (input.selector) {
      await Promise.all([
        tab.page.waitForNavigation({ timeout: 5000, waitUntil: 'domcontentloaded' }).catch(() => {}),
        tab.page.click(input.selector, { timeout: 5000 }),
      ]);
    } else {
      return { output: '需要 selector 或 ref 参数', isError: true };
    }

    await tab.page.waitForTimeout(300);
    tab.url = tab.page.url();
    tab.title = await tab.page.title().catch(() => tab.title);
    return { output: `已点击 [tab:${tab.id}]。当前页面: ${tab.title}`, isError: false };
  } catch (err: any) {
    return { output: `点击失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserType(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const text = input.text;

    if (input.selector) {
      await tab.page.fill(input.selector, text, { timeout: 5000 });
    } else if (input.ref) {
      const el = await resolveElement(tab.page, input);
      if (!el) return { output: `未找到元素: ${input.ref}`, isError: true };
      await el.fill(text, { timeout: 5000 });
    } else {
      await tab.page.keyboard.type(text);
    }

    return { output: `已输入: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`, isError: false };
  } catch (err: any) {
    return { output: `输入失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserHover(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();

    if (input.coordinate) {
      await tab.page.mouse.move(input.coordinate[0], input.coordinate[1]);
    } else {
      const el = await resolveElement(tab.page, input);
      if (el) {
        await el.hover({ timeout: 5000 });
      } else if (input.selector) {
        await tab.page.hover(input.selector, { timeout: 5000 });
      } else {
        return { output: '需要 selector, ref 或 coordinate 参数', isError: true };
      }
    }

    await tab.page.waitForTimeout(300);
    return { output: '悬停完成', isError: false };
  } catch (err: any) {
    return { output: `悬停失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserScroll(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const amount = (input.amount || 3) * 100;
    const dir = input.direction;

    if (input.selector) {
      const el = await tab.page.$(input.selector);
      if (el) {
        const scrollMap: Record<string, string> = {
          up: `el.scrollTop -= ${amount}`,
          down: `el.scrollTop += ${amount}`,
          left: `el.scrollLeft -= ${amount}`,
          right: `el.scrollLeft += ${amount}`,
        };
        await el.evaluate((e: any, code: string) => { eval(code); }, scrollMap[dir] || scrollMap.down);
      }
    } else {
      const scrollMap: Record<string, [number, number]> = {
        up: [0, -amount], down: [0, amount], left: [-amount, 0], right: [amount, 0],
      };
      const [dx, dy] = scrollMap[dir] || [0, amount];
      if (input.coordinate) {
        await tab.page.mouse.move(input.coordinate[0], input.coordinate[1]);
      }
      await tab.page.mouse.wheel(dx, dy);
    }

    return { output: `已滚动 ${dir} ${amount}px`, isError: false };
  } catch (err: any) {
    return { output: `滚动失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserDrag(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();

    if (input.startSelector && input.endSelector) {
      const source = await tab.page.$(input.startSelector);
      const target = await tab.page.$(input.endSelector);
      if (!source || !target) return { output: '未找到拖拽源或目标元素', isError: true };
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      if (!sourceBox || !targetBox) return { output: '无法获取元素位置', isError: true };
      await tab.page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
      await tab.page.mouse.down();
      await tab.page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
      await tab.page.mouse.up();
    } else if (input.startCoordinate && input.endCoordinate) {
      await tab.page.mouse.move(input.startCoordinate[0], input.startCoordinate[1]);
      await tab.page.mouse.down();
      await tab.page.mouse.move(input.endCoordinate[0], input.endCoordinate[1], { steps: 10 });
      await tab.page.mouse.up();
    } else {
      return { output: '需要 start/end selector 或 start/end coordinate', isError: true };
    }

    return { output: '拖拽完成', isError: false };
  } catch (err: any) {
    return { output: `拖拽失败: ${err.message}`, isError: true };
  }
}

// ══════════════════════════════════════════════════════════
//  Screenshot & JS
// ══════════════════════════════════════════════════════════

export async function executeBrowserScreenshot(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const fullPage = input.fullPage || false;
    let opts: any = { fullPage };

    if (input.selector) {
      const el = await tab.page.$(input.selector);
      if (!el) return { output: `未找到元素: ${input.selector}`, isError: true };
      opts = { clip: await el.boundingBox() };
    }

    const buffer = await tab.page.screenshot(opts);

    if (input.outputPath) {
      await fs.writeFile(input.outputPath, buffer);
      return { output: `截图已保存: ${input.outputPath} (${Math.round(buffer.length / 1024)}KB)`, isError: false };
    }

    return { output: `截图完成 (${Math.round(buffer.length / 1024)}KB)`, isError: false };
  } catch (err: any) {
    return { output: `截图失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserExecuteJs(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const result = await tab.page.evaluate(input.code);
    const output = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
    return { output: output.slice(0, 10000), isError: false };
  } catch (err: any) {
    return { output: `JS 执行失败: ${err.message}`, isError: true };
  }
}

// ══════════════════════════════════════════════════════════
//  Forms & File Upload
// ══════════════════════════════════════════════════════════

export async function executeBrowserFormInput(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const value = input.value;
    const el = await resolveElement(tab.page, input);

    if (!el && !input.selector) {
      return { output: '需要 selector 或 ref 参数', isError: true };
    }

    const target = el || await tab.page.$(input.selector);
    if (!target) return { output: `未找到表单元素: ${input.selector || input.ref}`, isError: true };

    // Check if element is disabled or readonly
    const isDisabled = await target.evaluate((e: any) => e.disabled === true);
    if (isDisabled) return { output: `表单元素已禁用: ${input.selector || input.ref}`, isError: true };
    const isReadonly = await target.evaluate((e: any) => e.readOnly === true || e.getAttribute('readonly') !== null);
    if (isReadonly && input.force !== true) {
      return { output: `表单元素为只读: ${input.selector || input.ref}（如需强制写入，请设置 force: true）`, isError: true };
    }

    const tagName = await target.evaluate((e: any) => e.tagName.toLowerCase());
    const inputType = await target.evaluate((e: any) => e.type || '');

    if (tagName === 'select') {
      // Select dropdown: try value first, then label text
      const matched = await target.evaluate((e: any, val: string) => {
        const opts = Array.from(e.options) as any[];
        for (const opt of opts) {
          if (opt.value === val || opt.text.trim() === val) {
            e.value = opt.value;
            return true;
          }
        }
        return false;
      }, value);
      if (!matched) return { output: `未找到匹配选项: ${value}`, isError: true };
      await target.evaluate((e: any) => e.dispatchEvent(new Event('change', { bubbles: true })));
    } else if (tagName === 'textarea' || (tagName === 'input' && ['text', 'email', 'password', 'search', 'url', 'tel', 'number'].includes(inputType))) {
      await target.fill(value);
    } else if (tagName === 'input' && inputType === 'checkbox') {
      const shouldCheck = value === 'true' || value === '1';
      if (await target.isChecked() !== shouldCheck) await target.click();
    } else if (tagName === 'input' && inputType === 'radio') {
      await target.click();
    } else {
      // Generic: try fill, fall back to type
      try { await target.fill(value); } catch { await target.type(value); }
    }

    return { output: `已设置表单值: "${value.slice(0, 50)}"`, isError: false };
  } catch (err: any) {
    return { output: `表单填写失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserFileUpload(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const paths: string[] = input.paths;
    const el = await resolveElement(tab.page, input);

    // Validate all files exist before attempting upload
    const missing: string[] = [];
    for (const p of paths) {
      try { await fs.access(p); } catch { missing.push(p); }
    }
    if (missing.length > 0) {
      return { output: `文件不存在:\n${missing.join('\n')}`, isError: true };
    }

    const target = el || await tab.page.$(input.selector || 'input[type="file"]');
    if (!target) return { output: '未找到文件上传元素', isError: true };

    await target.setInputFiles(paths);

    return { output: `已上传 ${paths.length} 个文件:\n${paths.join('\n')}`, isError: false };
  } catch (err: any) {
    return { output: `文件上传失败: ${err.message}`, isError: true };
  }
}

// ══════════════════════════════════════════════════════════
//  Tab Management
// ══════════════════════════════════════════════════════════

export async function executeBrowserTabsList(_input: Record<string, any>): Promise<ToolResult> {
  try {
    // Refresh titles
    for (const tab of tabs) {
      tab.url = tab.page.url();
      tab.title = await tab.page.title().catch(() => 'Untitled');
    }

    const list = tabs.map(t => {
      const active = t.id === activeTabId ? ' (active)' : '';
      return `  [${t.id}]${active} ${t.title} — ${t.url}`;
    });

    return { output: `${tabs.length} 个标签页:\n${list.join('\n') || '(无)'}`, isError: false };
  } catch (err: any) {
    return { output: `列表失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserTabsCreate(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await createTab(input.url);
    return { output: `已创建标签页 [${tab.id}]: ${tab.title} — ${tab.url}`, isError: false };
  } catch (err: any) {
    return { output: `创建标签页失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserTabsClose(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tabId = input.tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return { output: `标签页 ${tabId} 不存在`, isError: true };

    await tab.page.close();
    tabs = tabs.filter(t => t.id !== tabId);

    if (tabs.length === 0) {
      activeTabId = 0;
      return { output: `已关闭最后一个标签页 ${tabId}。当前无打开的标签页`, isError: false };
    }

    if (activeTabId === tabId) {
      activeTabId = tabs[tabs.length - 1].id;
    }

    return { output: `已关闭标签页 ${tabId}。剩余 ${tabs.length} 个`, isError: false };
  } catch (err: any) {
    return { output: `关闭失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserTabsSwitch(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tabId = input.tabId;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return { output: `标签页 ${tabId} 不存在`, isError: true };

    activeTabId = tabId;
    await tab.page.bringToFront();
    tab.title = await tab.page.title().catch(() => 'Untitled');

    return { output: `已切换到 [${tabId}]: ${tab.title} — ${tab.url}`, isError: false };
  } catch (err: any) {
    return { output: `切换失败: ${err.message}`, isError: true };
  }
}

// ══════════════════════════════════════════════════════════
//  GIF Recording
// ══════════════════════════════════════════════════════════

export async function executeBrowserGifStart(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const intervalMs = input.intervalMs || 500;

    if (gifRecording) return { output: `已在录制中（已采集 ${gifFrames.length} 帧）。请先调用 browser_gif_stop 停止当前录制`, isError: true };

    gifRecording = true;
    gifFrames = [];
    gifClickIndicators = [];

    gifInterval = setInterval(async () => {
      if (!gifRecording) return;
      try {
        const buffer = await tab.page.screenshot({ type: 'jpeg', quality: 60 });
        gifFrames.push(buffer);
      } catch { /* tab may have closed */ }
    }, intervalMs);

    return { output: `GIF 录制已开始 (间隔 ${intervalMs}ms)`, isError: false };
  } catch (err: any) {
    return { output: `录制启动失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserGifStop(_input: Record<string, any>): Promise<ToolResult> {
  if (!gifRecording) return { output: '未在录制', isError: true };

  gifRecording = false;
  if (gifInterval) { clearInterval(gifInterval); gifInterval = null; }

  return {
    output: `录制已停止。${gifFrames.length} 帧已采集，${gifClickIndicators.length} 个点击记录`,
    isError: false,
  };
}

export async function executeBrowserGifExport(input: Record<string, any>): Promise<ToolResult> {
  try {
    if (gifFrames.length === 0) return { output: '无帧可导出。请先录制', isError: true };

    const outputPath = input.outputPath;

    // Save frames as JPEG images in a temp directory (GIF encoding requires external lib)
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    // Simple approach: save as a sequence and create info file
    const framesDir = outputPath.replace(/\.gif$/i, '_frames');
    await fs.mkdir(framesDir, { recursive: true });

    for (let i = 0; i < gifFrames.length; i++) {
      await fs.writeFile(path.join(framesDir, `frame_${String(i).padStart(5, '0')}.jpg`), gifFrames[i]);
    }

    const manifest = {
      frameCount: gifFrames.length,
      clickIndicators: gifClickIndicators,
      intervalMs: 500,
      framesDir,
      exportedAt: new Date().toISOString(),
    };
    await fs.writeFile(outputPath.replace(/\.gif$/i, '.json'), JSON.stringify(manifest, null, 2));

    return {
      output: `已导出 ${gifFrames.length} 帧到 ${framesDir}\n元数据: ${outputPath.replace(/\.gif$/i, '.json')}\n提示: 使用 ffmpeg 合成 GIF: ffmpeg -framerate 2 -i ${framesDir}/frame_%05d.jpg ${outputPath}`,
      isError: false,
    };
  } catch (err: any) {
    return { output: `导出失败: ${err.message}`, isError: true };
  }
}

// ══════════════════════════════════════════════════════════
//  Network & Console
// ══════════════════════════════════════════════════════════

export async function executeBrowserNetwork(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const action = input.action;

    switch (action) {
      case 'start':
        tab.networkCapturing = true;
        tab.networkRequests = [];
        return { output: '网络监控已启动', isError: false };
      case 'stop':
        tab.networkCapturing = false;
        return { output: `网络监控已停止 (${tab.networkRequests.length} 条记录)`, isError: false };
      case 'read': {
        let reqs = tab.networkRequests;
        if (input.urlPattern) reqs = reqs.filter(r => r.url.includes(input.urlPattern));
        const summary = reqs.slice(-50).map(r => {
          const status = r.status ? (r.status >= 400 ? `[${r.status}]` : `${r.status}`) : 'pending';
          return `${r.method.padEnd(6)} ${status.padEnd(8)} ${r.resourceType.padEnd(12)} ${r.url.slice(0, 120)}`;
        }).join('\n');
        return { output: `${reqs.length} 条请求:\n${summary || '(无)'}`, isError: false };
      }
      case 'clear':
        tab.networkRequests = [];
        return { output: '已清空网络记录', isError: false };
      default:
        return { output: `未知操作: ${action}`, isError: true };
    }
  } catch (err: any) {
    return { output: `网络监控错误: ${err.message}`, isError: true };
  }
}

export async function executeBrowserConsole(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const level = input.level || 'all';
    const limit = input.limit || 50;

    let logs = tab.consoleLogs;
    if (level !== 'all') logs = logs.filter(l => l.type === level);
    if (input.pattern) {
      const re = new RegExp(input.pattern, 'i');
      logs = logs.filter(l => re.test(l.text));
    }

    const recent = logs.slice(-limit);
    const output = recent.map(l => `[${l.type}] ${l.text}`).join('\n');

    if (input.clear) tab.consoleLogs = [];

    return { output: `${recent.length} 条日志:\n${output || '(无)'}`, isError: false };
  } catch (err: any) {
    return { output: `控制台读取失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserConsoleRead(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const limit = input.limit || 100;

    let logs = tab.consoleLogs;
    if (input.onlyErrors) logs = logs.filter(l => l.type === 'error' || l.type === 'exception');
    if (input.pattern) {
      const re = new RegExp(input.pattern, 'i');
      logs = logs.filter(l => re.test(l.text));
    }

    const recent = logs.slice(-limit);
    const output = recent.map(l => `[${l.type}] ${l.text}`).join('\n');

    if (input.clear) tab.consoleLogs = [];

    return { output: `${recent.length} 条控制台消息:\n${output || '(无)'}`, isError: false };
  } catch (err: any) {
    return { output: `读取失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserNetworkRead(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();
    const limit = input.limit || 100;
    const filter = input.filter || 'all';

    let reqs = tab.networkRequests;
    if (input.urlPattern) reqs = reqs.filter(r => r.url.includes(input.urlPattern));
    if (filter === 'failed') reqs = reqs.filter(r => r.status && r.status >= 400);

    const recent = reqs.slice(-limit);
    const output = recent.map(r =>
      `${r.method} ${r.status || 'pending'} ${r.resourceType} ${r.url.slice(0, 150)}`
    ).join('\n');

    if (input.clear) tab.networkRequests = [];

    return { output: `${recent.length} 条网络请求:\n${output || '(无)'}`, isError: false };
  } catch (err: any) {
    return { output: `读取失败: ${err.message}`, isError: true };
  }
}

// ══════════════════════════════════════════════════════════
//  Browser Selection & Viewport
// ══════════════════════════════════════════════════════════

export async function executeBrowserSelectBrowser(input: Record<string, any>): Promise<ToolResult> {
  try {
    const action = input.action;

    switch (action) {
      case 'list': {
        const list = Array.from(profiles.entries()).map(([name, p]) => {
          const active = name === currentProfile ? ' (active)' : '';
          return `  ${name}${active} — headless: ${p.headless}`;
        });
        return { output: `浏览器配置:\n${list.join('\n')}`, isError: false };
      }
      case 'restart': {
        await closeBrowser();
        if (input.headless !== undefined) {
          const p = profiles.get(currentProfile)!;
          p.headless = input.headless;
        }
        await ensureBrowser();
        return { output: `浏览器已重启 (headless: ${input.headless ?? true})`, isError: false };
      }
      case 'use': {
        const name = input.profile;
        if (!profiles.has(name)) return { output: `未知配置: ${name}。可用: ${Array.from(profiles.keys()).join(', ')}`, isError: true };
        await closeBrowser();
        currentProfile = name;
        await ensureBrowser();
        return { output: `已切换到配置: ${name}`, isError: false };
      }
      default:
        return { output: `未知操作: ${action}`, isError: true };
    }
  } catch (err: any) {
    return { output: `浏览器选择失败: ${err.message}`, isError: true };
  }
}

export async function executeBrowserResize(input: Record<string, any>): Promise<ToolResult> {
  try {
    const tab = await getOrCreateTab();

    const presets: Record<string, [number, number]> = {
      mobile: [375, 812],
      tablet: [768, 1024],
      desktop: [1280, 800],
    };

    let width: number, height: number;
    if (input.preset && presets[input.preset]) {
      [width, height] = presets[input.preset];
    } else {
      width = input.width || 1280;
      height = input.height || 720;
    }

    // Validate dimensions
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return { output: `无效的视口尺寸: ${width}x${height}。宽高必须为正数`, isError: true };
    }
    if (width < 100 || height < 100) {
      return { output: `视口尺寸过小: ${width}x${height}。最小为 100x100`, isError: true };
    }
    if (width > 7680 || height > 4320) {
      return { output: `视口尺寸过大: ${width}x${height}。最大为 7680x4320`, isError: true };
    }

    await tab.page.setViewportSize({ width, height });
    return { output: `视口已调整为 ${width}x${height}`, isError: false };
  } catch (err: any) {
    return { output: `调整失败: ${err.message}`, isError: true };
  }
}

// ══════════════════════════════════════════════════════════
//  Cleanup
// ══════════════════════════════════════════════════════════

export async function closeBrowser(): Promise<void> {
  gifRecording = false;
  if (gifInterval) { clearInterval(gifInterval); gifInterval = null; }
  gifFrames = [];
  gifClickIndicators = [];

  for (const tab of tabs) {
    await tab.page.close().catch(() => {});
  }
  tabs = [];
  activeTabId = 0;
  nextTabId = 1;

  if (browserContext) { await browserContext.close().catch(() => {}); browserContext = null; }
  if (browser) { await browser.close().catch(() => {}); browser = null; }
}
