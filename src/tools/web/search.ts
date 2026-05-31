// ── Web 搜索工具：DuckDuckGo / Bing / 百度 ──────

import { ToolDefinition, ToolResult } from '../registry';

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: `搜索互联网获取信息。用于查找文档、API 参考、错误解决方案。

使用场景：
- 查找某个库的使用方法
- 搜索错误信息的解决方案
- 查找最新的 API 文档

返回：搜索结果列表，包含标题、URL 和摘要。`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: '搜索关键词' },
      engine: {
        type: 'string',
        enum: ['duckduckgo', 'bing', 'baidu', 'auto'],
        description: '搜索引擎（默认 auto，国内自动用百度）',
      },
      maxResults: { type: 'number', description: '最大结果数（默认 10）' },
      region: { type: 'string', description: '区域 (cn / us / global)' },
    },
    required: ['query'],
  },
  permission: 'auto',
};

export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: `获取指定 URL 的网页内容并转换为文本。

使用场景：
- 读取在线文档
- 获取 GitHub issue/PR 的内容
- 读取 API 响应

注意：无法访问需要认证的页面（如 Google Docs、私有仓库）`,
  input_schema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: '要抓取的 URL' },
      prompt: { type: 'string', description: '从页面中提取什么信息（可选）' },
      format: { type: 'string', enum: ['text', 'html', 'json', 'markdown'], description: '输出格式' },
      maxChars: { type: 'number', description: '最大字符数（默认 30000）' },
    },
    required: ['url'],
  },
  permission: 'auto',
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// ── 搜索引擎实现 ─────────────────────────────────

async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  // DuckDuckGo Lite (无 JS)
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  const html = await response.text();

  // 解析结果
  const results: SearchResult[] = [];
  const resultRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
  let match;
  while ((match = resultRegex.exec(html)) && results.length < maxResults) {
    results.push({
      title: decodeHtml(match[2].trim()),
      url: match[1].trim(),
      snippet: decodeHtml(match[3].replace(/<[^>]*>/g, '').trim()),
    });
  }

  // 回退：简单解析
  if (results.length === 0) {
    const linkRegex = /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([^<]+)<\/a>/gi;
    while ((match = linkRegex.exec(html)) && results.length < maxResults) {
      const href = match[1];
      if (!href.includes('duckduckgo.com') && !href.includes('/y.js')) {
        results.push({
          title: match[2].trim(),
          url: href,
          snippet: '',
        });
      }
    }
  }

  return results;
}

async function searchBing(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  const html = await response.text();

  const results: SearchResult[] = [];

  // Bing 结果解析
  const liRegex = /<li class="b_algo">([\s\S]*?)<\/li>/gi;
  let match;
  while ((match = liRegex.exec(html)) && results.length < maxResults) {
    const block = match[1];
    const titleMatch = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);

    if (titleMatch) {
      results.push({
        title: decodeHtml(titleMatch[2].replace(/<[^>]*>/g, '').trim()),
        url: titleMatch[1],
        snippet: snippetMatch ? decodeHtml(snippetMatch[1].replace(/<[^>]*>/g, '').trim()) : '',
      });
    }
  }

  return results;
}

async function searchBaidu(query: string, maxResults: number): Promise<SearchResult[]> {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${maxResults}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  const html = await response.text();

  const results: SearchResult[] = [];

  // 百度结果解析
  const divRegex = /<div[^>]*class="result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match;
  while ((match = divRegex.exec(html)) && results.length < maxResults) {
    const block = match[1];
    const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/<span[^>]*class="content-right_[^"]*"[^>]*>([\s\S]*?)<\/span>/);

    if (titleMatch) {
      results.push({
        title: decodeHtml(titleMatch[2].replace(/<[^>]*>/g, '').trim()),
        url: titleMatch[1],
        snippet: snippetMatch ? decodeHtml(snippetMatch[1].replace(/<[^>]*>/g, '').trim()) : '',
      });
    }
  }

  return results;
}

// ── 工具执行 ──────────────────────────────────────

export async function executeWebSearch(input: Record<string, any>): Promise<ToolResult> {
  try {
    const query = input.query;
    if (!query || !query.trim()) {
      return { output: '搜索关键词不能为空', isError: true };
    }

    const maxResults = input.maxResults || 10;
    const region = input.region || detectRegion();
    let engine = input.engine || 'auto';

    if (engine === 'auto') {
      engine = region === 'cn' ? 'baidu' : 'duckduckgo';
    }

    let results: SearchResult[];

    switch (engine) {
      case 'duckduckgo':
        results = await searchDuckDuckGo(query, maxResults);
        break;
      case 'bing':
        results = await searchBing(query, maxResults);
        break;
      case 'baidu':
        results = await searchBaidu(query, maxResults);
        break;
      default:
        results = await searchDuckDuckGo(query, maxResults);
    }

    if (results.length === 0) {
      return {
        output: `未找到 "${query}" 的搜索结果。请尝试不同的关键词或搜索引擎。`,
        isError: false,
      };
    }

    const output = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join('\n\n');

    return {
      output: `搜索 "${query}" (${engine}) — ${results.length} 条结果:\n\n${output}`,
      isError: false,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { output: '搜索超时 (20秒)，请检查网络连接或稍后重试', isError: true };
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return { output: `网络连接失败: ${err.message}。请检查网络连接。`, isError: true };
    }
    return { output: `搜索失败: ${err.message}`, isError: true };
  }
}

export async function executeWebFetch(input: Record<string, any>): Promise<ToolResult> {
  try {
    const url = input.url;
    const maxChars = input.maxChars || 30000;
    const format = input.format || 'text';

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { output: `无效的 URL: ${url}。URL 必须包含协议 (http:// 或 https://)`, isError: true };
    }

    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { output: `不支持的协议: ${parsedUrl.protocol}。仅支持 http:// 和 https://`, isError: true };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      return { output: `HTTP ${response.status}: ${response.statusText}`, isError: true };
    }

    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();

    let output: string;

    if (contentType.includes('json') || format === 'json') {
      try {
        const parsed = JSON.parse(body);
        output = JSON.stringify(parsed, null, 2).slice(0, maxChars);
      } catch {
        output = body.slice(0, maxChars);
      }
    } else if (format === 'html') {
      output = body.slice(0, maxChars);
    } else if (format === 'markdown') {
      output = htmlToMarkdown(body).slice(0, maxChars);
    } else {
      // 默认：提取纯文本
      output = extractText(body).slice(0, maxChars);
    }

    return {
      output: `URL: ${url}\n类型: ${contentType}\n大小: ${body.length} 字符\n\n${output}`,
      isError: false,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { output: '请求超时 (15秒)', isError: true };
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return { output: `网络连接失败: ${err.message}。请检查 URL 和网络连接。`, isError: true };
    }
    return { output: `抓取失败: ${err.message}`, isError: true };
  }
}

// ── 工具函数 ──────────────────────────────────────

function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function detectRegion(): string {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (locale.includes('zh') || tz.includes('Asia/Shanghai') || tz.includes('Asia/Chongqing')) {
    return 'cn';
  }
  return 'global';
}

function extractText(html: string): string {
  // 移除 script/style
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '');

  // 保留段落结构
  text = text
    .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return text;
}

function htmlToMarkdown(html: string): string {
  let md = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  md = md
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?(p|div|br|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return md;
}
