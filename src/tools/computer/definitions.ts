import { ToolDefinition } from '../registry';

// ── Screenshot ────────────────────────────────────────────────────────

export const computerScreenshotTool: ToolDefinition = {
  name: 'computer_screenshot',
  description:
    'Take a screenshot of the desktop or a specific region. Returns a base64-encoded PNG image. ' +
    'WARNING: Screenshots may capture sensitive content (passwords, personal data). ' +
    'Use the region parameter to limit capture area when possible.',
  input_schema: {
    type: 'object' as const,
    properties: {
      region: {
        type: 'object',
        properties: {
          x0: { type: 'number', description: 'Left edge (pixels)' },
          y0: { type: 'number', description: 'Top edge (pixels)' },
          x1: { type: 'number', description: 'Right edge (pixels)' },
          y1: { type: 'number', description: 'Bottom edge (pixels)' },
        },
        description: 'Region to capture (optional). If omitted, captures full screen.',
      },
      display: {
        type: 'number',
        description: 'Monitor index to capture (default: 0, the primary monitor)',
        minimum: 0,
      },
    },
    required: [],
  },
  permission: 'auto',
};

// ── Click ─────────────────────────────────────────────────────────────

export const computerClickTool: ToolDefinition = {
  name: 'computer_click',
  description:
    'Click at specific screen coordinates. Supports left, right, and middle mouse buttons, ' +
    'and single, double, or triple clicks.',
  input_schema: {
    type: 'object' as const,
    properties: {
      x: { type: 'number', description: 'Horizontal coordinate (pixels from left edge)' },
      y: { type: 'number', description: 'Vertical coordinate (pixels from top edge)' },
      button: {
        type: 'string',
        enum: ['left', 'right', 'middle'],
        description: 'Mouse button (default: left)',
      },
      clickType: {
        type: 'string',
        enum: ['single', 'double', 'triple'],
        description: 'Click type (default: single)',
      },
    },
    required: ['x', 'y'],
  },
  permission: 'ask',
};

// ── Type ──────────────────────────────────────────────────────────────

export const computerTypeTool: ToolDefinition = {
  name: 'computer_type',
  description:
    'Type text at the current cursor position using keyboard simulation. ' +
    'The text is sanitized before typing. For key combinations (ctrl+c, alt+tab), use computer_key instead.',
  input_schema: {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Text to type' },
      delay: {
        type: 'number',
        description: 'Delay in milliseconds between each keystroke (default: 20, min: 0, max: 500)',
        minimum: 0,
        maximum: 500,
      },
    },
    required: ['text'],
  },
  permission: 'ask',
};

// ── Key ───────────────────────────────────────────────────────────────

export const computerKeyTool: ToolDefinition = {
  name: 'computer_key',
  description:
    'Press keyboard keys or key combinations. Use "+" for combos: "ctrl+c", "alt+tab", "ctrl+shift+s". ' +
    'Special keys: enter, tab, escape, backspace, delete, space, up, down, left, right, ' +
    'home, end, pageup, pagedown, f1-f12, printscreen.',
  input_schema: {
    type: 'object' as const,
    properties: {
      keys: {
        type: 'string',
        description:
          'Key or combo to press. Examples: "enter", "ctrl+c", "alt+tab", "ctrl+shift+s"',
      },
      repeat: {
        type: 'number',
        description: 'Number of times to repeat (default: 1, max: 50)',
        minimum: 1,
        maximum: 50,
      },
    },
    required: ['keys'],
  },
  permission: 'ask',
};

// ── Mouse Move ────────────────────────────────────────────────────────

export const computerMouseMoveTool: ToolDefinition = {
  name: 'computer_mouse_move',
  description: 'Move the mouse cursor to specific screen coordinates without clicking.',
  input_schema: {
    type: 'object' as const,
    properties: {
      x: { type: 'number', description: 'Horizontal coordinate (pixels)' },
      y: { type: 'number', description: 'Vertical coordinate (pixels)' },
    },
    required: ['x', 'y'],
  },
  permission: 'auto',
};

// ── Drag ──────────────────────────────────────────────────────────────

export const computerDragTool: ToolDefinition = {
  name: 'computer_drag',
  description: 'Click and drag from one screen position to another.',
  input_schema: {
    type: 'object' as const,
    properties: {
      startX: { type: 'number', description: 'Starting X coordinate' },
      startY: { type: 'number', description: 'Starting Y coordinate' },
      endX: { type: 'number', description: 'Ending X coordinate' },
      endY: { type: 'number', description: 'Ending Y coordinate' },
    },
    required: ['startX', 'startY', 'endX', 'endY'],
  },
  permission: 'ask',
};

// ── Scroll ────────────────────────────────────────────────────────────

export const computerScrollTool: ToolDefinition = {
  name: 'computer_scroll',
  description: 'Scroll at a specific screen position (or current cursor if no coordinates given).',
  input_schema: {
    type: 'object' as const,
    properties: {
      x: { type: 'number', description: 'Horizontal coordinate (pixels). Optional.' },
      y: { type: 'number', description: 'Vertical coordinate (pixels). Optional.' },
      direction: {
        type: 'string',
        enum: ['up', 'down'],
        description: 'Scroll direction',
      },
      amount: {
        type: 'number',
        description: 'Number of scroll ticks (default: 3, min: 1, max: 50)',
        minimum: 1,
        maximum: 50,
      },
    },
    required: ['direction'],
  },
  permission: 'auto',
};

// ── Wait ──────────────────────────────────────────────────────────────

export const computerWaitTool: ToolDefinition = {
  name: 'computer_wait',
  description: 'Wait for a specified number of seconds. Useful for waiting for animations or UI transitions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      seconds: {
        type: 'number',
        description: 'Seconds to wait (max 10)',
        minimum: 0.1,
        maximum: 10,
      },
    },
    required: ['seconds'],
  },
  permission: 'auto',
};

// ── Get Cursor ────────────────────────────────────────────────────────

export const computerGetCursorTool: ToolDefinition = {
  name: 'computer_get_cursor',
  description: 'Get the current mouse cursor position. Returns x and y coordinates.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  permission: 'auto',
};

// ── Launch Application ────────────────────────────────────────────────

export const computerLaunchTool: ToolDefinition = {
  name: 'computer_launch',
  description:
    'Launch or open a desktop application. Supports Windows (.exe), macOS (.app), and Linux executables. ' +
    'Can pass command-line arguments to the application. ' +
    'Examples: "notepad", "Calculator", "/Applications/Safari.app", "firefox".',
  input_schema: {
    type: 'object' as const,
    properties: {
      application: {
        type: 'string',
        description: 'Application name or path to executable. Examples: "notepad", "Calculator", "/Applications/Safari.app", "firefox"',
      },
      args: {
        type: 'array',
        items: { type: 'string' },
        description: 'Command-line arguments to pass to the application (optional)',
      },
      wait: {
        type: 'boolean',
        description: 'Wait for application to exit (default: false)',
      },
    },
    required: ['application'],
  },
  permission: 'ask',
};

// ── Focus Window ──────────────────────────────────────────────────────

export const computerFocusTool: ToolDefinition = {
  name: 'computer_focus',
  description:
    'Switch to (focus) a specific application window by name or window ID. ' +
    'Brings the window to the foreground so subsequent keyboard/mouse operations target it. ' +
    'Examples: "Notepad", "Safari", "Calculator".',
  input_schema: {
    type: 'object' as const,
    properties: {
      application: {
        type: 'string',
        description: 'Application name to focus (partial match supported)',
      },
      windowId: {
        type: 'number',
        description: 'Window ID to focus (alternative to application name)',
      },
    },
    required: [],
  },
  permission: 'auto',
};

// ── List Windows ──────────────────────────────────────────────────────

export const computerListWindowsTool: ToolDefinition = {
  name: 'computer_list_windows',
  description:
    'List all currently open windows with their titles and IDs. ' +
    'Useful for identifying target applications before using computer_focus or computer_click.',
  input_schema: {
    type: 'object' as const,
    properties: {
      filter: {
        type: 'string',
        description: 'Filter windows by title (case-insensitive substring match, optional)',
      },
    },
    required: [],
  },
  permission: 'auto',
};

// ── Auto Automation ───────────────────────────────────────────────────

export const computerAutoTool: ToolDefinition = {
  name: 'computer_auto',
  description:
    'Execute complex automation workflows using natural language instructions. ' +
    'Describe what you want to do in plain language, and the system will automatically ' +
    'break it down into steps and execute them. ' +
    'Examples: ' +
    '"打开记事本并输入Hello World" - Opens Notepad and types Hello World ' +
    '"打开浏览器搜索天气" - Opens browser and searches for weather ' +
    '"截图并保存" - Takes a screenshot ' +
    '"切换到Chrome，点击地址栏，输入网址" - Switch to Chrome, click address bar, enter URL ' +
    'Supports Chinese and English instructions. ' +
    'Can chain multiple operations: "打开应用A，输入文字，保存，关闭"',
  input_schema: {
    type: 'object' as const,
    properties: {
      instruction: {
        type: 'string',
        description: 'Natural language automation instruction in Chinese or English',
      },
      dryRun: {
        type: 'boolean',
        description: 'If true, only parse and show steps without executing (default: false)',
      },
      verbose: {
        type: 'boolean',
        description: 'If true, show detailed execution logs (default: false)',
      },
    },
    required: ['instruction'],
  },
  permission: 'ask',
};

// ── Super Automation (无限并行Agents) ─────────────────────────────────

export const superAutoTool: ToolDefinition = {
  name: 'super_auto',
  description:
    '🚀 ULTIMATE AUTOMATION: Execute ANY task with unlimited parallel agents! ' +
    'This is the most powerful automation tool that can handle ANY complexity: ' +
    '- Full software testing and automatic bug fixing ' +
    '- Game development with 3D rendering and scene creation ' +
    '- Office automation (data analysis, reports, presentations) ' +
    '- AI model training and deployment ' +
    '- Security auditing and vulnerability fixing ' +
    '- UI/UX design and prototyping ' +
    '- And ANY other task you can imagine! ' +
    'Just describe what you want in natural language, and the system will: ' +
    '1. Automatically understand your intent ' +
    '2. Decompose into optimal subtasks ' +
    '3. Spawn unlimited parallel agents ' +
    '4. Execute everything simultaneously ' +
    '5. Aggregate results intelligently ' +
    'Examples: ' +
    '"测试这个软件的所有功能并修复所有bug" ' +
    '"创建一个3D游戏场景，包含地形、建筑和角色" ' +
    '"分析这份销售数据并生成可视化报告" ' +
    '"训练一个图像识别模型并部署到生产环境" ' +
    '"对这个系统进行全面安全审计" ' +
    'Supports: Chinese, English, and mixed languages. ' +
    'One person can now do the work of 1000 people! 💪',
  input_schema: {
    type: 'object' as const,
    properties: {
      instruction: {
        type: 'string',
        description: 'Describe ANY task you want to accomplish in natural language',
      },
      maxAgents: {
        type: 'number',
        description: 'Maximum number of parallel agents (0 = unlimited, default: 0)',
        minimum: 0,
      },
      timeout: {
        type: 'number',
        description: 'Task timeout in milliseconds (default: 600000 = 10 minutes)',
        minimum: 1000,
      },
      priority: {
        type: 'string',
        enum: ['critical', 'high', 'medium', 'low', 'background'],
        description: 'Task priority (default: high)',
      },
      parallelism: {
        type: 'number',
        description: 'Maximum parallel tasks (0 = unlimited, default: 0)',
        minimum: 0,
      },
      verbose: {
        type: 'boolean',
        description: 'Show detailed execution logs (default: false)',
      },
    },
    required: ['instruction'],
  },
  permission: 'ask',
};

// ── 专用超级工具 ─────────────────────────────────────────────────────

export const softwareTestTool: ToolDefinition = {
  name: 'super_software_test',
  description:
    '🔬 Run comprehensive software tests with parallel testing agents. ' +
    'Automatically identifies and runs all types of tests: unit, integration, e2e, performance, security. ' +
    'Generates detailed test reports and identifies issues.',
  input_schema: {
    type: 'object' as const,
    properties: {
      target: {
        type: 'string',
        description: 'Software to test (e.g., "this application", "API endpoints", "frontend")',
      },
      testTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Types of tests to run (optional, runs all by default)',
      },
    },
    required: ['target'],
  },
  permission: 'ask',
};

export const bugFixTool: ToolDefinition = {
  name: 'super_bug_fix',
  description:
    '🔧 Automatically identify and fix bugs using parallel debugging agents. ' +
    'Analyzes code, identifies root causes, generates fixes, and verifies solutions. ' +
    'Can fix multiple bugs simultaneously.',
  input_schema: {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string',
        description: 'Bug description or error message',
      },
      autoFix: {
        type: 'boolean',
        description: 'Automatically apply fixes (default: true)',
      },
    },
    required: ['description'],
  },
  permission: 'ask',
};

export const gameCreationTool: ToolDefinition = {
  name: 'super_game_create',
  description:
    '🎮 Create games and interactive experiences with parallel game development agents. ' +
    'Supports: 2D/3D graphics, game logic, level design, character creation, ' +
    'physics simulation, AI behavior, sound design, and optimization. ' +
    'Can integrate with Unity, Unreal, Godot, or custom engines.',
  input_schema: {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string',
        description: 'Game concept and requirements',
      },
      engine: {
        type: 'string',
        enum: ['unity', 'unreal', 'godot', 'custom', 'auto'],
        description: 'Game engine to use (default: auto)',
      },
      style: {
        type: 'string',
        description: 'Art style (e.g., "pixel art", "realistic", "cartoon")',
      },
    },
    required: ['description'],
  },
  permission: 'ask',
};

export const officeAutomationTool: ToolDefinition = {
  name: 'super_office_auto',
  description:
    '💼 Automate office workflows with parallel processing agents. ' +
    'Handles: data analysis, report generation, presentations, email automation, ' +
    'scheduling, document processing, and more. ' +
    'Process massive datasets and generate professional outputs.',
  input_schema: {
    type: 'object' as const,
    properties: {
      task: {
        type: 'string',
        description: 'Office task to automate',
      },
      outputFormat: {
        type: 'string',
        enum: ['pdf', 'excel', 'powerpoint', 'html', 'json'],
        description: 'Output format (default: auto)',
      },
    },
    required: ['task'],
  },
  permission: 'ask',
};

export const dataAnalysisTool: ToolDefinition = {
  name: 'super_data_analyze',
  description:
    '📊 Perform advanced data analysis with parallel analytical agents. ' +
    'Supports: statistical analysis, pattern recognition, predictive modeling, ' +
    'data visualization, anomaly detection, and trend analysis. ' +
    'Process terabytes of data efficiently.',
  input_schema: {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string',
        description: 'Data analysis requirements',
      },
      dataSource: {
        type: 'string',
        description: 'Data source (file, database, API, etc.)',
      },
      analysisType: {
        type: 'string',
        enum: ['descriptive', 'diagnostic', 'predictive', 'prescriptive'],
        description: 'Type of analysis (default: auto)',
      },
    },
    required: ['description'],
  },
  permission: 'ask',
};

export const aiTrainingTool: ToolDefinition = {
  name: 'super_ai_train',
  description:
    '🤖 Train AI/ML models with parallel training agents. ' +
    'Supports: deep learning, computer vision, NLP, reinforcement learning, ' +
    'model optimization, hyperparameter tuning, and deployment. ' +
    'Distributed training across multiple GPUs/nodes.',
  input_schema: {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string',
        description: 'AI model training requirements',
      },
      modelType: {
        type: 'string',
        enum: ['classification', 'regression', 'detection', 'generation', 'reinforcement'],
        description: 'Model type (default: auto)',
      },
      computeResources: {
        type: 'string',
        description: 'Compute resources (e.g., "4x GPU", "cluster")',
      },
    },
    required: ['description'],
  },
  permission: 'ask',
};

export const securityAuditTool: ToolDefinition = {
  name: 'super_security_audit',
  description:
    '🛡️ Perform comprehensive security audits with parallel security agents. ' +
    'Includes: vulnerability scanning, penetration testing, code review, ' +
    'compliance checking, threat modeling, and security hardening. ' +
    'Industry-standard security assessment.',
  input_schema: {
    type: 'object' as const,
    properties: {
      target: {
        type: 'string',
        description: 'System to audit (application, network, infrastructure)',
      },
      auditType: {
        type: 'string',
        enum: ['vulnerability', 'penetration', 'compliance', 'code-review', 'full'],
        description: 'Type of audit (default: full)',
      },
    },
    required: ['target'],
  },
  permission: 'ask',
};

export const superStatusTool: ToolDefinition = {
  name: 'super_status',
  description:
    '📈 Get real-time status of the super automation system. ' +
    'Shows: active agents, running tasks, performance metrics, ' +
    'resource utilization, and recent command history.',
  input_schema: {
    type: 'object' as const,
    properties: {
      detailed: {
        type: 'boolean',
        description: 'Show detailed status (default: false)',
      },
    },
    required: [],
  },
  permission: 'auto',
};

// ── 聚合所有超级工具 ─────────────────────────────────────────────────

export const allSuperTools: ToolDefinition[] = [
  superAutoTool,
  softwareTestTool,
  bugFixTool,
  gameCreationTool,
  officeAutomationTool,
  dataAnalysisTool,
  aiTrainingTool,
  securityAuditTool,
  superStatusTool,
];

// ── Aggregate array of all computer tools ─────────────────────────────

export const allComputerTools: ToolDefinition[] = [
  computerScreenshotTool,
  computerClickTool,
  computerTypeTool,
  computerKeyTool,
  computerMouseMoveTool,
  computerDragTool,
  computerScrollTool,
  computerWaitTool,
  computerGetCursorTool,
  computerLaunchTool,
  computerFocusTool,
  computerListWindowsTool,
  computerAutoTool,
];

// ── 终极CLI系统 (一个人抵得上千人公司) ─────────────────────────────────

export const ultimateSolveTool: ToolDefinition = {
  name: 'ultimate_solve',
  description:
    '🌟 ULTIMATE PROBLEM SOLVER: One person = 1000-person company! ' +
    'This is the MOST POWERFUL tool that can solve ANY problem: ' +
    '- Simple math (1+1=2) to complex calculations ' +
    '- Software development (full-stack) ' +
    '- Data science and AI ' +
    '- Game development ' +
    '- Finance and business ' +
    '- Healthcare and science ' +
    '- Design and creativity ' +
    '- And ANYTHING you can imagine! ' +
    'Just describe what you want in natural language: ' +
    '"帮我算一下1+1等于多少" ' +
    '"分析这个代码并优化性能" ' +
    '"创建一个电商网站" ' +
    '"训练一个AI模型" ' +
    '"分析销售数据并生成报告" ' +
    '"设计一个Logo" ' +
    'The system will: ' +
    '1. Deep thinking and understanding ' +
    '2. Multi-dimensional analysis ' +
    '3. Creative problem solving ' +
    '4. Execute with unlimited agents ' +
    '5. Generate insights and recommendations ' +
    'Supports 30+ industries and 100+ skills! ' +
    'One sentence solves ANYTHING! 💪',
  input_schema: {
    type: 'object' as const,
    properties: {
      instruction: {
        type: 'string',
        description: 'Describe ANY problem you want to solve in natural language (Chinese/English)',
      },
    },
    required: ['instruction'],
  },
  permission: 'ask',
};

export const ultimateCalculateTool: ToolDefinition = {
  name: 'ultimate_calculate',
  description:
    '🔢 SUPER CALCULATOR: From simple arithmetic to advanced mathematics! ' +
    'Supports: arithmetic, algebra, calculus, statistics, linear algebra, geometry, optimization. ' +
    'Examples: ' +
    '"1+1" → 2 ' +
    '"sqrt(144)" → 12 ' +
    '"求解方程 2x + 5 = 15" → x = 5 ' +
    '"计算圆的面积，半径=5" → 78.54 ' +
    '"统计分析数据 [1,2,3,4,5]" → mean=3, median=3, std=1.58 ' +
    'Precision up to 15 decimal places!',
  input_schema: {
    type: 'object' as const,
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression or problem to solve',
      },
      variables: {
        type: 'object',
        description: 'Variables to substitute (optional)',
      },
    },
    required: ['expression'],
  },
  permission: 'auto',
};

export const ultimateThinkTool: ToolDefinition = {
  name: 'ultimate_think',
  description:
    '🧠 DEEP THINKING ENGINE: Multi-dimensional analysis and creative problem solving! ' +
    'Uses 8 thinking modes: analytical, creative, critical, systems, strategic, lateral, convergent, divergent. ' +
    'The system will: ' +
    '1. Observe and extract key information ' +
    '2. Analyze from multiple perspectives ' +
    '3. Synthesize knowledge from different domains ' +
    '4. Evaluate solutions critically ' +
    '5. Create innovative solutions ' +
    '6. Generate insights and recommendations ' +
    'Examples: ' +
    '"如何提高团队效率?" ' +
    '"分析这个商业模式的可行性" ' +
    '"设计一个创新的产品" ' +
    'Provides deep thinking, not just answers!',
  input_schema: {
    type: 'object' as const,
    properties: {
      question: {
        type: 'string',
        description: 'Question or problem to think deeply about',
      },
      mode: {
        type: 'string',
        enum: ['analytical', 'creative', 'critical', 'systems', 'strategic', 'lateral', 'convergent', 'divergent'],
        description: 'Thinking mode (default: analytical)',
      },
    },
    required: ['question'],
  },
  permission: 'auto',
};

export const ultimateLearnTool: ToolDefinition = {
  name: 'ultimate_learn',
  description:
    '📚 KNOWLEDGE GRAPH: Access comprehensive industry knowledge! ' +
    '30+ industries, 100+ skills, 500+ knowledge nodes. ' +
    'Categories: technology, business, science, creative, service, industry. ' +
    'Examples: ' +
    '"机器学习" → Related concepts, skills, tools ' +
    '"商业战略" → Frameworks, methods, cases ' +
    '"UI设计" → Skills, tools, best practices ' +
    'Provides structured knowledge and recommendations!',
  input_schema: {
    type: 'object' as const,
    properties: {
      topic: {
        type: 'string',
        description: 'Topic or keyword to learn about',
      },
      category: {
        type: 'string',
        description: 'Category filter (optional)',
      },
    },
    required: ['topic'],
  },
  permission: 'auto',
};

export const ultimateSkillsTool: ToolDefinition = {
  name: 'ultimate_skills',
  description:
    '💼 INDUSTRY SKILLS: Browse skills across 30+ industries! ' +
    'Industries: Software Development, Data Science, AI, Game Development, Finance, Healthcare, Education, Design, Marketing, Legal, Science, Manufacturing, and more! ' +
    'Each industry includes: skills, tools, knowledge, complexity levels. ' +
    'Examples: ' +
    '"查看所有行业" → List all industries ' +
    '"软件开发技能" → Software development skills ' +
    '"数据分析" → Data analysis skills ' +
    'Know what skills are available for any task!',
  input_schema: {
    type: 'object' as const,
    properties: {
      industry: {
        type: 'string',
        description: 'Industry name or keyword (optional, shows all if omitted)',
      },
    },
    required: [],
  },
  permission: 'auto',
};

export const ultimateCommandTool: ToolDefinition = {
  name: 'ultimate_command',
  description:
    '💻 SYSTEM COMMAND: Execute any system command or control any software! ' +
    'Supports: system commands, application control, file operations, network, database, API. ' +
    'Can control: VS Code, Git, Docker, Node.js, Python, Chrome, Excel, Word, Photoshop, Unity, Unreal, and more! ' +
    'Examples: ' +
    '"打开VS Code" → Launch VS Code ' +
    '"运行Python脚本" → Execute Python ' +
    '"git status" → Check git status ' +
    '"下载文件" → Download file ' +
    'Full system control at your fingertips!',
  input_schema: {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        description: 'Command to execute or software to control',
      },
      parameters: {
        type: 'object',
        description: 'Command parameters (optional)',
      },
    },
    required: ['command'],
  },
  permission: 'ask',
};

export const ultimateStatusTool: ToolDefinition = {
  name: 'ultimate_status',
  description:
    '📊 SYSTEM STATUS: Check the ultimate CLI system status! ' +
    'Shows: knowledge graph stats, compute engine status, command history, etc. ' +
    'Use this to understand system capabilities and performance!',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  permission: 'auto',
};

// ── 聚合所有终极工具 ─────────────────────────────────────────────────

export const allUltimateTools: ToolDefinition[] = [
  ultimateSolveTool,
  ultimateCalculateTool,
  ultimateThinkTool,
  ultimateLearnTool,
  ultimateSkillsTool,
  ultimateCommandTool,
  ultimateStatusTool,
];
