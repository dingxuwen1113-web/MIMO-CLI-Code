// ── Threat Pattern Detection ────────────────────────────────────

export interface ThreatDetection {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pattern: string;
  match: string;
  recommendation: string;
}

const THREAT_PATTERNS: Array<{ type: string; severity: ThreatDetection['severity']; pattern: RegExp; recommendation: string }> = [
  // Command Injection
  { type: 'command_injection', severity: 'critical', pattern: /[;&|`$]\s*(bash|sh|python|perl|ruby|node|php)\b/, recommendation: 'Detected shell metacharacter injection' },
  { type: 'command_injection', severity: 'critical', pattern: /\$\(.*\)/, recommendation: 'Command substitution detected' },
  { type: 'command_injection', severity: 'critical', pattern: /`[^`]+`/, recommendation: 'Backtick command execution detected' },

  // Data Exfiltration
  { type: 'data_exfiltration', severity: 'high', pattern: /(curl|wget|nc|ncat|netcat)\s+.*\s*(POST|PUT|--data|-d)\b/i, recommendation: 'Potential data exfiltration via HTTP upload' },
  { type: 'data_exfiltration', severity: 'high', pattern: /base64\s+.*\|\s*(curl|wget|nc)/, recommendation: 'Encoded data exfiltration detected' },
  { type: 'data_exfiltration', severity: 'medium', pattern: /(scp|rsync|ssh)\s+.*@.*:/, recommendation: 'Remote file transfer detected' },

  // Privilege Escalation
  { type: 'privilege_escalation', severity: 'critical', pattern: /sudo\s+(-[isu]|--user)\s+/, recommendation: 'Privilege escalation attempt' },
  { type: 'privilege_escalation', severity: 'critical', pattern: /chmod\s+[ugo]*\+s/, recommendation: 'SUID bit manipulation detected' },
  { type: 'privilege_escalation', severity: 'high', pattern: /chown\s+root/, recommendation: 'Ownership change to root detected' },

  // Reverse Shell
  { type: 'reverse_shell', severity: 'critical', pattern: /(bash|sh|python|perl|ruby|nc|ncat)\s+.*-i\s*>&?\s*/, recommendation: 'Reverse shell pattern detected' },
  { type: 'reverse_shell', severity: 'critical', pattern: /\/dev\/(tcp|udp)\/\d+\.\d+\.\d+\.\d+/, recommendation: 'Network socket redirection detected' },
  { type: 'reverse_shell', severity: 'critical', pattern: /mkfifo\s+.*\/tmp\//, recommendation: 'Named pipe for shell detected' },

  // Crypto Mining
  { type: 'crypto_mining', severity: 'high', pattern: /(xmrig|cpuminer|minerd|cgminer|bfgminer|ethminer)/, recommendation: 'Cryptocurrency mining software detected' },
  { type: 'crypto_mining', severity: 'high', pattern: /stratum\+tcp:\/\//, recommendation: 'Mining pool connection detected' },

  // Prompt Injection
  { type: 'prompt_injection', severity: 'high', pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i, recommendation: 'Prompt injection attempt detected' },
  { type: 'prompt_injection', severity: 'high', pattern: /you\s+are\s+now\s+(a|an|the)\s+/i, recommendation: 'Role override attempt detected' },
  { type: 'prompt_injection', severity: 'medium', pattern: /\[SYSTEM\]|\[INST\]|<\|im_start\|>/, recommendation: 'System prompt injection markers detected' },

  // Fork Bomb
  { type: 'fork_bomb', severity: 'critical', pattern: /:\(\)\s*\{\s*:\|:&\s*\};:/, recommendation: 'Fork bomb detected' },
  { type: 'fork_bomb', severity: 'critical', pattern: /while\s+true\s*;\s*do\s+(bash|sh|python)/, recommendation: 'Infinite process spawning detected' },
];

export function detectThreats(input: string): ThreatDetection[] {
  const detections: ThreatDetection[] = [];
  for (const tp of THREAT_PATTERNS) {
    const match = input.match(tp.pattern);
    if (match) {
      detections.push({
        type: tp.type,
        severity: tp.severity,
        pattern: tp.pattern.source,
        match: match[0],
        recommendation: tp.recommendation,
      });
    }
  }
  return detections;
}

export function hasThreat(input: string, minSeverity: ThreatDetection['severity'] = 'medium'): boolean {
  const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
  const detections = detectThreats(input);
  return detections.some(d => severityOrder[d.severity] >= severityOrder[minSeverity]);
}

export function getHighestSeverity(detections: ThreatDetection[]): ThreatDetection['severity'] | null {
  if (!detections.length) return null;
  const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
  return detections.reduce((max, d) => severityOrder[d.severity] > severityOrder[max] ? d.severity : max, 'low' as ThreatDetection['severity']);
}
