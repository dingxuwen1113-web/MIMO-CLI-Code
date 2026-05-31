// ── URL Safety Checking ─────────────────────────────────────────

export interface URLSafetyResult {
  safe: boolean;
  risk: 'low' | 'medium' | 'high' | 'critical';
  reasons: string[];
  url: string;
  domain: string;
}

const BLOCKED_DOMAINS = new Set([
  'malware.com', 'phishing.com', 'evil.com', 'hack.com',
  'exploit-db.com', 'shell-storm.org',
]);

const SUSPICIOUS_TLDS = new Set([
  '.tk', '.ml', '.ga', '.cf', '.gq', '.buzz', '.xyz', '.top', '.club', '.work',
]);

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^fc00:/,
  /^fe80:/,
  /^::1$/,
  /^localhost$/i,
];

const SAFE_DOMAINS = new Set([
  'github.com', 'gitlab.com', 'bitbucket.org',
  'stackoverflow.com', 'stackexchange.com',
  'npmjs.com', 'pypi.org', 'crates.io',
  'google.com', 'googleapis.com',
  'microsoft.com', 'azure.com',
  'amazon.com', 'aws.amazon.com',
  'cloudflare.com',
  'vercel.com', 'netlify.com',
  'anthropic.com', 'openai.com',
  'docs.python.org', 'developer.mozilla.org',
  'typescriptlang.org', 'reactjs.org',
]);

export function checkURLSafety(url: string, options: { allowPrivateIPs?: boolean; allowBlocked?: boolean } = {}): URLSafetyResult {
  const reasons: string[] = [];
  let risk: URLSafetyResult['risk'] = 'low';

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, risk: 'high', reasons: ['Invalid URL format'], url, domain: '' };
  }

  const domain = parsed.hostname.toLowerCase();

  // Check blocked domains
  if (!options.allowBlocked && BLOCKED_DOMAINS.has(domain)) {
    return { safe: false, risk: 'critical', reasons: ['Domain is in blocklist'], url, domain };
  }

  // Check safe domains (whitelist bypass)
  if (SAFE_DOMAINS.has(domain) || [...SAFE_DOMAINS].some(s => domain.endsWith('.' + s))) {
    return { safe: true, risk: 'low', reasons: ['Trusted domain'], url, domain };
  }

  // Check private/internal IPs
  if (!options.allowPrivateIPs) {
    for (const range of PRIVATE_IP_RANGES) {
      if (range.test(domain)) {
        reasons.push('Private/internal IP address detected');
        risk = 'high';
        break;
      }
    }
  }

  // Check suspicious TLDs
  for (const tld of SUSPICIOUS_TLDS) {
    if (domain.endsWith(tld)) {
      reasons.push(`Suspicious TLD: ${tld}`);
      risk = risk === 'low' ? 'medium' : risk;
      break;
    }
  }

  // Check for IP address directly
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
    reasons.push('Direct IP address instead of domain name');
    risk = risk === 'low' ? 'medium' : risk;
  }

  // Check for encoded characters
  if (url.includes('%') && /(%[0-9a-fA-F]{2}){3,}/.test(url)) {
    reasons.push('Heavily URL-encoded (possible obfuscation)');
    risk = risk === 'low' ? 'medium' : risk;
  }

  // Check for data: URI
  if (parsed.protocol === 'data:') {
    reasons.push('data: URI protocol detected');
    risk = 'high';
  }

  // Check for javascript: URI
  if (parsed.protocol === 'javascript:') {
    reasons.push('javascript: URI protocol detected');
    risk = 'critical';
  }

  // Check for file: URI
  if (parsed.protocol === 'file:') {
    reasons.push('file: URI protocol - local file access');
    risk = 'high';
  }

  // Check port scanning indicators
  const port = parsed.port;
  if (port && !['80', '443', '8080', '8443', '3000', '5000'].includes(port)) {
    reasons.push(`Non-standard port: ${port}`);
    risk = risk === 'low' ? 'medium' : risk;
  }

  return { safe: reasons.length === 0, risk, reasons, url, domain };
}

export function sanitizeURL(url: string): string {
  // Remove tracking parameters
  try {
    const parsed = new URL(url);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', '_ga'];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }
    return parsed.toString();
  } catch { return url; }
}
