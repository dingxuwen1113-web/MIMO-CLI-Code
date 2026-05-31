import createDebug from 'debug';

const debug = createDebug('mimo:canvas');

// ─── Canvas Primitives ─────────────────────────────────────────────

export type CanvasCommand =
  | { type: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; radius?: number }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; stroke?: string; width?: number }
  | { type: 'text'; x: number; y: number; content: string; font?: string; color?: string; size?: number }
  | { type: 'image'; x: number; y: number; w: number; h: number; src: string }
  | { type: 'markdown'; x: number; y: number; w: number; content: string }
  | { type: 'chart'; x: number; y: number; w: number; h: number; chartType: 'bar' | 'line' | 'pie' | 'scatter'; data: ChartData; title?: string }
  | { type: 'table'; x: number; y: number; w: number; headers: string[]; rows: string[][] }
  | { type: 'code'; x: number; y: number; w: number; content: string; language?: string }
  | { type: 'tree'; x: number; y: number; data: TreeNode; direction?: 'horizontal' | 'vertical' }
  | { type: 'flow'; x: number; y: number; nodes: FlowNode[]; edges: FlowEdge[] }
  | { type: 'clear' }
  | { type: 'background'; color: string }
  | { type: 'group'; children: CanvasCommand[]; transform?: { x?: number; y?: number; scale?: number; rotate?: number } };

export interface ChartData {
  labels: string[];
  datasets: Array<{ label: string; data: number[]; color?: string }>;
}

export interface TreeNode {
  label: string;
  value?: string;
  children?: TreeNode[];
}

export interface FlowNode {
  id: string;
  label: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  type?: 'start' | 'end' | 'process' | 'decision' | 'io';
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

// ─── Canvas Renderer ───────────────────────────────────────────────

export class CanvasRenderer {
  private width: number;
  private height: number;
  private commands: CanvasCommand[] = [];
  private backgroundColor = '#ffffff';

  constructor(width = 1200, height = 800) {
    this.width = width;
    this.height = height;
  }

  render(commands: CanvasCommand[]): void {
    this.commands = commands;
    for (const cmd of commands) {
      if (cmd.type === 'background') this.backgroundColor = cmd.color;
    }
    debug('Rendered %d canvas commands', commands.length);
  }

  addCommand(command: CanvasCommand): void {
    this.commands.push(command);
  }

  clear(): void {
    this.commands = [];
    this.backgroundColor = '#ffffff';
  }

  exportSVG(): string {
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">\n`;
    svg += `  <rect width="${this.width}" height="${this.height}" fill="${this.backgroundColor}"/>\n`;

    for (const cmd of this.commands) {
      svg += this.commandToSVG(cmd);
    }

    svg += '</svg>';
    return svg;
  }

  exportHTML(): string {
    const svg = this.exportSVG();
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>MIMO Canvas</title>
  <style>
    body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #1a1a1a; }
    svg { max-width: 100%; max-height: 100vh; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
  </style>
</head>
<body>${svg}</body>
</html>`;
  }

  getCommands(): CanvasCommand[] {
    return [...this.commands];
  }

  private commandToSVG(cmd: CanvasCommand): string {
    switch (cmd.type) {
      case 'rect':
        return `  <rect x="${cmd.x}" y="${cmd.y}" width="${cmd.w}" height="${cmd.h}" fill="${cmd.fill || '#333'}" stroke="${cmd.stroke || 'none'}" rx="${cmd.radius || 0}"/>\n`;
      case 'circle':
        return `  <circle cx="${cmd.cx}" cy="${cmd.cy}" r="${cmd.r}" fill="${cmd.fill || '#333'}" stroke="${cmd.stroke || 'none'}"/>\n`;
      case 'line':
        return `  <line x1="${cmd.x1}" y1="${cmd.y1}" x2="${cmd.x2}" y2="${cmd.y2}" stroke="${cmd.stroke || '#333'}" stroke-width="${cmd.width || 1}"/>\n`;
      case 'text':
        return `  <text x="${cmd.x}" y="${cmd.y}" font-family="${cmd.font || 'monospace'}" font-size="${cmd.size || 14}" fill="${cmd.color || '#333'}">${escapeXml(cmd.content)}</text>\n`;
      case 'code':
        return `  <foreignObject x="${cmd.x}" y="${cmd.y}" width="${cmd.w}" height="${cmd.content.split('\n').length * 18 + 20}"><pre style="background:#1e1e1e;color:#d4d4d4;padding:10px;border-radius:4px;font-size:13px;overflow:auto">${escapeXml(cmd.content)}</pre></foreignObject>\n`;
      case 'table': {
        const rowH = 28;
        const colW = Math.floor(cmd.w / cmd.headers.length);
        let s = `  <g transform="translate(${cmd.x},${cmd.y})">\n`;
        s += `    <rect width="${cmd.w}" height="${(cmd.rows.length + 1) * rowH}" fill="#f5f5f5" stroke="#ddd" rx="4"/>\n`;
        cmd.headers.forEach((h, i) => {
          s += `    <rect x="${i * colW}" y="0" width="${colW}" height="${rowH}" fill="#e0e0e0"/>\n`;
          s += `    <text x="${i * colW + 8}" y="18" font-size="12" font-weight="bold">${escapeXml(h)}</text>\n`;
        });
        cmd.rows.forEach((row, ri) => {
          row.forEach((cell, ci) => {
            s += `    <text x="${ci * colW + 8}" y="${(ri + 1) * rowH + 18}" font-size="11">${escapeXml(cell)}</text>\n`;
          });
        });
        s += '  </g>\n';
        return s;
      }
      case 'chart':
        return this.chartToSVG(cmd);
      case 'tree':
        return this.treeToSVG(cmd.x, cmd.y, cmd.data, cmd.direction || 'vertical');
      case 'flow':
        return this.flowToSVG(cmd.x, cmd.y, cmd.nodes, cmd.edges);
      case 'group': {
        const tx = cmd.transform?.x || 0;
        const ty = cmd.transform?.y || 0;
        const sc = cmd.transform?.scale || 1;
        const rot = cmd.transform?.rotate || 0;
        let s = `  <g transform="translate(${tx},${ty}) scale(${sc}) rotate(${rot})">\n`;
        for (const child of cmd.children) {
          s += this.commandToSVG(child);
        }
        s += '  </g>\n';
        return s;
      }
      case 'markdown':
      case 'image':
      case 'clear':
      case 'background':
        return '';
    }
  }

  private chartToSVG(cmd: CanvasCommand & { type: 'chart' }): string {
    const { x, y, w, h, chartType, data, title } = cmd;
    let s = `  <g transform="translate(${x},${y})">\n`;

    if (title) {
      s += `    <text x="${w/2}" y="0" text-anchor="middle" font-size="14" font-weight="bold">${escapeXml(title)}</text>\n`;
    }

    if (chartType === 'bar') {
      const maxVal = Math.max(...data.datasets.flatMap(d => d.data), 1);
      const barW = Math.floor(w / data.labels.length) - 4;
      data.labels.forEach((label, i) => {
        const val = data.datasets[0]?.data[i] || 0;
        const barH = (val / maxVal) * (h - 40);
        const color = data.datasets[0]?.color || `hsl(${i * 60}, 70%, 50%)`;
        s += `    <rect x="${i * (barW + 4) + 2}" y="${h - barH - 20}" width="${barW}" height="${barH}" fill="${color}" rx="2"/>\n`;
        s += `    <text x="${i * (barW + 4) + barW / 2 + 2}" y="${h - 4}" text-anchor="middle" font-size="10">${escapeXml(label)}</text>\n`;
      });
    } else if (chartType === 'line') {
      const maxVal = Math.max(...data.datasets.flatMap(d => d.data), 1);
      for (const ds of data.datasets) {
        const points = ds.data.map((v, i) => `${i * (w / (ds.data.length - 1))},${h - 20 - (v / maxVal) * (h - 40)}`).join(' ');
        s += `    <polyline points="${points}" fill="none" stroke="${ds.color || '#4a9eff'}" stroke-width="2"/>\n`;
      }
    } else if (chartType === 'pie') {
      const total = data.datasets[0]?.data.reduce((a, b) => a + b, 0) || 1;
      let angle = 0;
      const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 20;
      data.datasets[0]?.data.forEach((val, i) => {
        const sliceAngle = (val / total) * 360;
        const color = data.datasets[0]?.color || `hsl(${i * 60}, 70%, 50%)`;
        s += `    <path d="M${cx},${cy} L${cx + r * Math.cos(angle * Math.PI / 180)},${cy + r * Math.sin(angle * Math.PI / 180)} A${r},${r} 0 ${sliceAngle > 180 ? 1 : 0},1 ${cx + r * Math.cos((angle + sliceAngle) * Math.PI / 180)},${cy + r * Math.sin((angle + sliceAngle) * Math.PI / 180)} Z" fill="${color}"/>\n`;
        angle += sliceAngle;
      });
    }

    s += '  </g>\n';
    return s;
  }

  private treeToSVG(x: number, y: number, node: TreeNode, direction: string): string {
    let s = '';
    const nodeW = 120, nodeH = 32, gap = 20;

    s += `  <rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" fill="#e8f4fd" stroke="#4a9eff" rx="6"/>\n`;
    s += `  <text x="${x + nodeW/2}" y="${y + 20}" text-anchor="middle" font-size="11">${escapeXml(node.label)}</text>\n`;

    if (node.children) {
      const totalW = node.children.length * (nodeW + gap) - gap;
      let cx = x + (nodeW - totalW) / 2;
      for (const child of node.children) {
        const childX = cx;
        const childY = y + nodeH + gap;
        s += `  <line x1="${x + nodeW/2}" y1="${y + nodeH}" x2="${childX + nodeW/2}" y2="${childY}" stroke="#999"/>\n`;
        s += this.treeToSVG(childX, childY, child, direction);
        cx += nodeW + gap;
      }
    }
    return s;
  }

  private flowToSVG(x: number, y: number, nodes: FlowNode[], edges: FlowEdge[]): string {
    let s = '';
    const nodeW = 120, nodeH = 40;

    for (const node of nodes) {
      const nx = x + node.x, ny = y + node.y;
      const w = node.w || nodeW, h = node.h || nodeH;
      const fill = node.type === 'decision' ? '#fff3cd' : node.type === 'start' || node.type === 'end' ? '#d4edda' : '#e8f4fd';
      const stroke = node.type === 'decision' ? '#ffc107' : node.type === 'start' || node.type === 'end' ? '#28a745' : '#4a9eff';
      s += `  <rect x="${nx}" y="${ny}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" rx="6"/>\n`;
      s += `  <text x="${nx + w/2}" y="${ny + h/2 + 4}" text-anchor="middle" font-size="11">${escapeXml(node.label)}</text>\n`;
    }

    for (const edge of edges) {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);
      if (fromNode && toNode) {
        const fx = x + fromNode.x + (fromNode.w || nodeW) / 2;
        const fy = y + fromNode.y + (fromNode.h || nodeH);
        const tx = x + toNode.x + (toNode.w || nodeW) / 2;
        const ty = y + toNode.y;
        s += `  <line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="#666" marker-end="url(#arrow)"/>\n`;
        if (edge.label) {
          s += `  <text x="${(fx+tx)/2}" y="${(fy+ty)/2 - 6}" text-anchor="middle" font-size="9" fill="#999">${escapeXml(edge.label)}</text>\n`;
        }
      }
    }

    return s;
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
