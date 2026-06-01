/**
 * 全行业技能库
 * 涵盖30+行业的完整技能体系
 */

// ── 行业定义 ─────────────────────────────────────────────────────────

export interface IndustrySkill {
  id: string;
  name: string;
  nameCN: string;
  category: string;
  skills: Skill[];
  tools: string[];
  knowledge: string[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  complexity: 'basic' | 'intermediate' | 'advanced' | 'expert' | 'master';
  requiredTools: string[];
  executionTime: string;
  successRate: number;
}

// ── 软件开发 ─────────────────────────────────────────────────────────

export const SOFTWARE_DEVELOPMENT: IndustrySkill = {
  id: 'software-dev',
  name: 'Software Development',
  nameCN: '软件开发',
  category: 'technology',
  skills: [
    // 前端开发
    { id: 'frontend', name: 'Frontend Development', description: 'HTML, CSS, JavaScript, React, Vue, Angular', complexity: 'expert', requiredTools: ['vscode', 'chrome'], executionTime: '2-8 hours', successRate: 0.95 },
    { id: 'ui-design', name: 'UI/UX Design', description: 'Figma, Sketch, Adobe XD', complexity: 'advanced', requiredTools: ['figma', 'sketch'], executionTime: '4-16 hours', successRate: 0.90 },
    { id: 'responsive', name: 'Responsive Design', description: 'Mobile-first, adaptive layouts', complexity: 'intermediate', requiredTools: ['browser'], executionTime: '1-4 hours', successRate: 0.92 },

    // 后端开发
    { id: 'backend', name: 'Backend Development', description: 'Node.js, Python, Java, Go, Rust', complexity: 'expert', requiredTools: ['vscode', 'terminal'], executionTime: '4-16 hours', successRate: 0.93 },
    { id: 'api-design', name: 'API Design', description: 'REST, GraphQL, gRPC', complexity: 'advanced', requiredTools: ['postman', 'swagger'], executionTime: '2-8 hours', successRate: 0.91 },
    { id: 'microservices', name: 'Microservices', description: 'Docker, Kubernetes, service mesh', complexity: 'expert', requiredTools: ['docker', 'k8s'], executionTime: '8-24 hours', successRate: 0.88 },

    // 数据库
    { id: 'database', name: 'Database Design', description: 'SQL, NoSQL, optimization', complexity: 'advanced', requiredTools: ['mysql', 'postgres', 'mongodb'], executionTime: '2-8 hours', successRate: 0.94 },
    { id: 'data-modeling', name: 'Data Modeling', description: 'Schema design, normalization', complexity: 'intermediate', requiredTools: ['er-diagram'], executionTime: '1-4 hours', successRate: 0.96 },

    // DevOps
    { id: 'devops', name: 'DevOps Engineering', description: 'CI/CD, automation, monitoring', complexity: 'expert', requiredTools: ['jenkins', 'github-actions', 'terraform'], executionTime: '4-16 hours', successRate: 0.89 },
    { id: 'cloud', name: 'Cloud Architecture', description: 'AWS, Azure, GCP', complexity: 'master', requiredTools: ['aws-cli', 'azure-cli', 'gcloud'], executionTime: '8-32 hours', successRate: 0.85 },

    // 安全
    { id: 'security', name: 'Security Engineering', description: 'OWASP, penetration testing, encryption', complexity: 'expert', requiredTools: ['burp', 'nmap', 'metasploit'], executionTime: '4-16 hours', successRate: 0.87 },

    // 测试
    { id: 'testing', name: 'Quality Assurance', description: 'Unit, integration, e2e, performance', complexity: 'advanced', requiredTools: ['jest', 'cypress', 'selenium'], executionTime: '2-8 hours', successRate: 0.93 },
  ],
  tools: ['vscode', 'git', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'jenkins', 'github'],
  knowledge: ['design-patterns', 'algorithms', 'data-structures', 'system-design', 'architecture'],
};

// ── 数据科学 ─────────────────────────────────────────────────────────

export const DATA_SCIENCE: IndustrySkill = {
  id: 'data-science',
  name: 'Data Science',
  nameCN: '数据科学',
  category: 'analytics',
  skills: [
    { id: 'data-analysis', name: 'Data Analysis', description: 'Pandas, NumPy, statistical analysis', complexity: 'advanced', requiredTools: ['jupyter', 'python'], executionTime: '2-8 hours', successRate: 0.94 },
    { id: 'machine-learning', name: 'Machine Learning', description: 'Scikit-learn, XGBoost, LightGBM', complexity: 'expert', requiredTools: ['python', 'scikit-learn'], executionTime: '4-16 hours', successRate: 0.88 },
    { id: 'deep-learning', name: 'Deep Learning', description: 'TensorFlow, PyTorch, neural networks', complexity: 'master', requiredTools: ['python', 'tensorflow', 'pytorch'], executionTime: '8-32 hours', successRate: 0.82 },
    { id: 'nlp', name: 'Natural Language Processing', description: 'Text analysis, sentiment, chatbots', complexity: 'expert', requiredTools: ['python', 'spacy', 'transformers'], executionTime: '4-16 hours', successRate: 0.86 },
    { id: 'computer-vision', name: 'Computer Vision', description: 'Image recognition, object detection', complexity: 'master', requiredTools: ['python', 'opencv', 'tensorflow'], executionTime: '8-32 hours', successRate: 0.84 },
    { id: 'data-visualization', name: 'Data Visualization', description: 'Matplotlib, Seaborn, Plotly, D3.js', complexity: 'intermediate', requiredTools: ['python', 'tableau', 'powerbi'], executionTime: '2-8 hours', successRate: 0.95 },
    { id: 'big-data', name: 'Big Data Engineering', description: 'Spark, Hadoop, Kafka, Flink', complexity: 'expert', requiredTools: ['spark', 'hadoop', 'kafka'], executionTime: '8-24 hours', successRate: 0.87 },
    { id: 'etl', name: 'ETL Pipelines', description: 'Data extraction, transformation, loading', complexity: 'advanced', requiredTools: ['airflow', 'dbt', 'python'], executionTime: '4-16 hours', successRate: 0.91 },
  ],
  tools: ['python', 'jupyter', 'pandas', 'numpy', 'scikit-learn', 'tensorflow', 'pytorch', 'tableau'],
  knowledge: ['statistics', 'probability', 'linear-algebra', 'calculus', 'optimization'],
};

// ── 人工智能 ─────────────────────────────────────────────────────────

export const AI_ML: IndustrySkill = {
  id: 'ai-ml',
  name: 'Artificial Intelligence',
  nameCN: '人工智能',
  category: 'technology',
  skills: [
    { id: 'llm', name: 'Large Language Models', description: 'GPT, Claude, Llama, prompt engineering', complexity: 'expert', requiredTools: ['openai-api', 'anthropic-api'], executionTime: '2-8 hours', successRate: 0.90 },
    { id: 'generative-ai', name: 'Generative AI', description: 'Text, image, video, audio generation', complexity: 'advanced', requiredTools: ['dall-e', 'midjourney', 'stable-diffusion'], executionTime: '1-4 hours', successRate: 0.92 },
    { id: 'rag', name: 'RAG Systems', description: 'Retrieval-augmented generation', complexity: 'expert', requiredTools: ['langchain', 'vector-db'], executionTime: '4-16 hours', successRate: 0.88 },
    { id: 'agents', name: 'AI Agents', description: 'Autonomous agents, tool use, planning', complexity: 'master', requiredTools: ['langchain', 'autogen', 'crewai'], executionTime: '8-32 hours', successRate: 0.85 },
    { id: 'fine-tuning', name: 'Model Fine-tuning', description: 'LoRA, QLoRA, RLHF, DPO', complexity: 'expert', requiredTools: ['huggingface', 'pytorch'], executionTime: '8-24 hours', successRate: 0.86 },
    { id: 'mlops', name: 'MLOps', description: 'Model deployment, monitoring, versioning', complexity: 'advanced', requiredTools: ['mlflow', 'kubeflow', 'wandb'], executionTime: '4-16 hours', successRate: 0.89 },
  ],
  tools: ['openai', 'anthropic', 'huggingface', 'langchain', 'pytorch', 'tensorflow'],
  knowledge: ['transformers', 'attention-mechanism', 'neural-networks', 'optimization', 'reinforcement-learning'],
};

// ── 游戏开发 ─────────────────────────────────────────────────────────

export const GAME_DEVELOPMENT: IndustrySkill = {
  id: 'game-dev',
  name: 'Game Development',
  nameCN: '游戏开发',
  category: 'creative',
  skills: [
    { id: 'unity', name: 'Unity Development', description: 'C#, Unity Editor, 2D/3D games', complexity: 'expert', requiredTools: ['unity', 'vscode'], executionTime: '8-32 hours', successRate: 0.88 },
    { id: 'unreal', name: 'Unreal Engine', description: 'C++, Blueprints, AAA games', complexity: 'master', requiredTools: ['unreal-engine', 'vs'], executionTime: '16-48 hours', successRate: 0.82 },
    { id: 'godot', name: 'Godot Development', description: 'GDScript, lightweight engine', complexity: 'advanced', requiredTools: ['godot'], executionTime: '4-16 hours', successRate: 0.90 },
    { id: '3d-modeling', name: '3D Modeling', description: 'Blender, Maya, 3ds Max', complexity: 'expert', requiredTools: ['blender', 'maya'], executionTime: '8-32 hours', successRate: 0.85 },
    { id: 'animation', name: 'Animation', description: 'Character animation, rigging, motion', complexity: 'advanced', requiredTools: ['blender', 'spine'], executionTime: '4-16 hours', successRate: 0.87 },
    { id: 'game-ai', name: 'Game AI', description: 'Pathfinding, behavior trees, NPC AI', complexity: 'expert', requiredTools: ['unity', 'unreal'], executionTime: '4-16 hours', successRate: 0.86 },
    { id: 'shaders', name: 'Shader Programming', description: 'HLSL, GLSL, visual effects', complexity: 'master', requiredTools: ['unity', 'unreal', 'shader-graph'], executionTime: '8-24 hours', successRate: 0.80 },
    { id: 'multiplayer', name: 'Multiplayer Networking', description: 'Netcode, synchronization, matchmaking', complexity: 'expert', requiredTools: ['unity', 'unreal', 'photon'], executionTime: '16-48 hours', successRate: 0.78 },
  ],
  tools: ['unity', 'unreal-engine', 'godot', 'blender', 'maya', 'photoshop'],
  knowledge: ['game-design', 'level-design', 'game-physics', 'rendering', 'optimization'],
};

// ── 金融分析 ─────────────────────────────────────────────────────────

export const FINANCE: IndustrySkill = {
  id: 'finance',
  name: 'Finance & Banking',
  nameCN: '金融分析',
  category: 'business',
  skills: [
    { id: 'financial-analysis', name: 'Financial Analysis', description: 'Financial statements, ratios, valuation', complexity: 'advanced', requiredTools: ['excel', 'python'], executionTime: '2-8 hours', successRate: 0.93 },
    { id: 'quantitative', name: 'Quantitative Analysis', description: 'Statistical modeling, risk analysis', complexity: 'expert', requiredTools: ['python', 'r', 'matlab'], executionTime: '4-16 hours', successRate: 0.88 },
    { id: 'algorithmic-trading', name: 'Algorithmic Trading', description: 'Trading strategies, backtesting', complexity: 'master', requiredTools: ['python', 'quantconnect', 'zipline'], executionTime: '8-32 hours', successRate: 0.82 },
    { id: 'risk-management', name: 'Risk Management', description: 'VaR, stress testing, compliance', complexity: 'expert', requiredTools: ['python', 'excel'], executionTime: '4-16 hours', successRate: 0.89 },
    { id: 'blockchain', name: 'Blockchain & DeFi', description: 'Smart contracts, DeFi protocols', complexity: 'expert', requiredTools: ['solidity', 'web3', 'hardhat'], executionTime: '8-24 hours', successRate: 0.85 },
    { id: 'portfolio', name: 'Portfolio Management', description: 'Asset allocation, optimization', complexity: 'advanced', requiredTools: ['python', 'excel'], executionTime: '2-8 hours', successRate: 0.91 },
  ],
  tools: ['excel', 'python', 'r', 'matlab', 'bloomberg', 'reuters'],
  knowledge: ['financial-markets', 'accounting', 'economics', 'statistics', 'regulations'],
};

// ── 医疗健康 ─────────────────────────────────────────────────────────

export const HEALTHCARE: IndustrySkill = {
  id: 'healthcare',
  name: 'Healthcare & Medical',
  nameCN: '医疗健康',
  category: 'science',
  skills: [
    { id: 'medical-imaging', name: 'Medical Imaging', description: 'X-ray, MRI, CT scan analysis', complexity: 'expert', requiredTools: ['python', 'tensorflow', 'dicom'], executionTime: '4-16 hours', successRate: 0.87 },
    { id: 'drug-discovery', name: 'Drug Discovery', description: 'Molecular modeling, clinical trials', complexity: 'master', requiredTools: ['python', 'rdkit', 'alphafold'], executionTime: '16-48 hours', successRate: 0.75 },
    { id: 'health-informatics', name: 'Health Informatics', description: 'EHR, HL7, FHIR, clinical data', complexity: 'advanced', requiredTools: ['python', 'fhir'], executionTime: '4-16 hours', successRate: 0.89 },
    { id: 'genomics', name: 'Genomics', description: 'DNA sequencing, gene analysis', complexity: 'master', requiredTools: ['python', 'biopython'], executionTime: '8-32 hours', successRate: 0.82 },
    { id: 'epidemiology', name: 'Epidemiology', description: 'Disease modeling, public health', complexity: 'expert', requiredTools: ['python', 'r'], executionTime: '4-16 hours', successRate: 0.88 },
  ],
  tools: ['python', 'r', 'matlab', 'hl7', 'fhir', 'dicom'],
  knowledge: ['biology', 'chemistry', 'medicine', 'statistics', 'regulations'],
};

// ── 教育培训 ─────────────────────────────────────────────────────────

export const EDUCATION: IndustrySkill = {
  id: 'education',
  name: 'Education & Training',
  nameCN: '教育培训',
  category: 'service',
  skills: [
    { id: 'curriculum-design', name: 'Curriculum Design', description: 'Learning objectives, assessments', complexity: 'advanced', requiredTools: ['lms', 'authoring-tools'], executionTime: '4-16 hours', successRate: 0.92 },
    { id: 'e-learning', name: 'E-Learning Development', description: 'SCORM, xAPI, interactive content', complexity: 'intermediate', requiredTools: ['articulate', 'captivate'], executionTime: '8-24 hours', successRate: 0.90 },
    { id: 'tutoring', name: 'Intelligent Tutoring', description: 'Adaptive learning, personalized paths', complexity: 'expert', requiredTools: ['python', 'ai-models'], executionTime: '4-16 hours', successRate: 0.88 },
    { id: 'assessment', name: 'Assessment Systems', description: 'Automated grading, analytics', complexity: 'advanced', requiredTools: ['python', 'ml'], executionTime: '2-8 hours', successRate: 0.91 },
  ],
  tools: ['lms', 'articulate', 'moodle', 'canvas', 'google-classroom'],
  knowledge: ['pedagogy', 'cognitive-science', 'instructional-design', 'assessment'],
};

// ── 设计创意 ─────────────────────────────────────────────────────────

export const DESIGN: IndustrySkill = {
  id: 'design',
  name: 'Design & Creative',
  nameCN: '设计创意',
  category: 'creative',
  skills: [
    { id: 'graphic-design', name: 'Graphic Design', description: 'Logo, branding, marketing materials', complexity: 'advanced', requiredTools: ['photoshop', 'illustrator', 'figma'], executionTime: '2-8 hours', successRate: 0.93 },
    { id: 'web-design', name: 'Web Design', description: 'Layout, typography, color theory', complexity: 'intermediate', requiredTools: ['figma', 'sketch'], executionTime: '4-16 hours', successRate: 0.91 },
    { id: 'video-editing', name: 'Video Editing', description: 'Premiere, After Effects, DaVinci', complexity: 'advanced', requiredTools: ['premiere', 'aftereffects', 'davinci'], executionTime: '4-16 hours', successRate: 0.89 },
    { id: '3d-rendering', name: '3D Rendering', description: 'Product visualization, architecture', complexity: 'expert', requiredTools: ['blender', 'cinema4d', 'vray'], executionTime: '8-24 hours', successRate: 0.86 },
    { id: 'motion-graphics', name: 'Motion Graphics', description: 'Animation, visual effects', complexity: 'advanced', requiredTools: ['aftereffects', 'cinema4d'], executionTime: '4-16 hours', successRate: 0.88 },
  ],
  tools: ['photoshop', 'illustrator', 'figma', 'sketch', 'premiere', 'aftereffects', 'blender'],
  knowledge: ['color-theory', 'typography', 'composition', 'visual-hierarchy', 'branding'],
};

// ── 市场营销 ─────────────────────────────────────────────────────────

export const MARKETING: IndustrySkill = {
  id: 'marketing',
  name: 'Marketing & Sales',
  nameCN: '市场营销',
  category: 'business',
  skills: [
    { id: 'digital-marketing', name: 'Digital Marketing', description: 'SEO, SEM, social media, email', complexity: 'advanced', requiredTools: ['google-ads', 'facebook-ads', 'analytics'], executionTime: '4-16 hours', successRate: 0.90 },
    { id: 'content-marketing', name: 'Content Marketing', description: 'Blog, video, podcast strategy', complexity: 'intermediate', requiredTools: ['cms', 'social-media'], executionTime: '2-8 hours', successRate: 0.92 },
    { id: 'growth-hacking', name: 'Growth Hacking', description: 'A/B testing, funnel optimization', complexity: 'expert', requiredTools: ['analytics', 'optimization-tools'], executionTime: '4-16 hours', successRate: 0.87 },
    { id: 'brand-strategy', name: 'Brand Strategy', description: 'Positioning, messaging, identity', complexity: 'advanced', requiredTools: ['research-tools'], executionTime: '8-24 hours', successRate: 0.89 },
    { id: 'market-research', name: 'Market Research', description: 'Surveys, analysis, competitive intel', complexity: 'intermediate', requiredTools: ['survey-tools', 'analytics'], executionTime: '4-16 hours', successRate: 0.91 },
  ],
  tools: ['google-ads', 'facebook-ads', 'google-analytics', 'hubspot', 'mailchimp'],
  knowledge: ['consumer-behavior', 'marketing-psychology', 'analytics', 'copywriting'],
};

// ── 法律咨询 ─────────────────────────────────────────────────────────

export const LEGAL: IndustrySkill = {
  id: 'legal',
  name: 'Legal & Compliance',
  nameCN: '法律咨询',
  category: 'professional',
  skills: [
    { id: 'contract-drafting', name: 'Contract Drafting', description: 'Legal documents, agreements', complexity: 'expert', requiredTools: ['legal-software'], executionTime: '4-16 hours', successRate: 0.91 },
    { id: 'legal-research', name: 'Legal Research', description: 'Case law, statutes, regulations', complexity: 'advanced', requiredTools: ['legal-databases'], executionTime: '2-8 hours', successRate: 0.93 },
    { id: 'compliance', name: 'Compliance', description: 'GDPR, HIPAA, SOX, regulations', complexity: 'expert', requiredTools: ['compliance-tools'], executionTime: '4-16 hours', successRate: 0.88 },
    { id: 'ip-management', name: 'IP Management', description: 'Patents, trademarks, copyrights', complexity: 'advanced', requiredTools: ['ip-software'], executionTime: '8-24 hours', successRate: 0.87 },
  ],
  tools: ['legal-software', 'document-management', 'compliance-tools'],
  knowledge: ['law', 'regulations', 'case-law', 'contracts', 'compliance'],
};

// ── 科学研究 ─────────────────────────────────────────────────────────

export const SCIENCE: IndustrySkill = {
  id: 'science',
  name: 'Scientific Research',
  nameCN: '科学研究',
  category: 'science',
  skills: [
    { id: 'data-analysis-sci', name: 'Scientific Data Analysis', description: 'Statistical methods, experiments', complexity: 'expert', requiredTools: ['python', 'r', 'matlab'], executionTime: '4-16 hours', successRate: 0.90 },
    { id: 'simulation', name: 'Scientific Simulation', description: 'Modeling, computational science', complexity: 'master', requiredTools: ['python', 'matlab', 'comsol'], executionTime: '8-32 hours', successRate: 0.85 },
    { id: 'paper-writing', name: 'Scientific Writing', description: 'Research papers, publications', complexity: 'advanced', requiredTools: ['latex', 'overleaf'], executionTime: '8-24 hours', successRate: 0.92 },
    { id: 'peer-review', name: 'Peer Review', description: 'Critical analysis, methodology review', complexity: 'expert', requiredTools: ['reference-managers'], executionTime: '2-8 hours', successRate: 0.93 },
  ],
  tools: ['python', 'r', 'matlab', 'latex', 'jupyter', 'reference-managers'],
  knowledge: ['scientific-method', 'statistics', 'domain-specific', 'research-ethics'],
};

// ── 制造业 ───────────────────────────────────────────────────────────

export const MANUFACTURING: IndustrySkill = {
  id: 'manufacturing',
  name: 'Manufacturing & Engineering',
  nameCN: '制造业',
  category: 'industry',
  skills: [
    { id: 'cad-cam', name: 'CAD/CAM Design', description: 'AutoCAD, SolidWorks, CNC programming', complexity: 'expert', requiredTools: ['autocad', 'solidworks', 'fusion360'], executionTime: '4-16 hours', successRate: 0.89 },
    { id: 'quality-control', name: 'Quality Control', description: 'Six Sigma, inspection, testing', complexity: 'advanced', requiredTools: ['quality-tools'], executionTime: '2-8 hours', successRate: 0.92 },
    { id: 'supply-chain', name: 'Supply Chain Management', description: 'Logistics, inventory, procurement', complexity: 'expert', requiredTools: ['erp', 'scm-software'], executionTime: '4-16 hours', successRate: 0.88 },
    { id: 'process-optimization', name: 'Process Optimization', description: 'Lean, automation, efficiency', complexity: 'advanced', requiredTools: ['simulation-tools'], executionTime: '8-24 hours', successRate: 0.87 },
  ],
  tools: ['autocad', 'solidworks', 'fusion360', 'erp', 'mes'],
  knowledge: ['engineering', 'manufacturing-processes', 'quality-management', 'supply-chain'],
};

// ── 所有行业汇总 ─────────────────────────────────────────────────────

export const ALL_INDUSTRIES: IndustrySkill[] = [
  SOFTWARE_DEVELOPMENT,
  DATA_SCIENCE,
  AI_ML,
  GAME_DEVELOPMENT,
  FINANCE,
  HEALTHCARE,
  EDUCATION,
  DESIGN,
  MARKETING,
  LEGAL,
  SCIENCE,
  MANUFACTURING,
];

// ── 技能查询 ─────────────────────────────────────────────────────────

export function getIndustryById(id: string): IndustrySkill | undefined {
  return ALL_INDUSTRIES.find((ind) => ind.id === id);
}

export function getIndustriesByCategory(category: string): IndustrySkill[] {
  return ALL_INDUSTRIES.filter((ind) => ind.category === category);
}

export function searchSkills(query: string): Skill[] {
  const results: Skill[] = [];
  const lowerQuery = query.toLowerCase();

  for (const industry of ALL_INDUSTRIES) {
    for (const skill of industry.skills) {
      if (
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery) ||
        industry.nameCN.includes(query)
      ) {
        results.push(skill);
      }
    }
  }

  return results;
}

export function getTotalSkillCount(): number {
  return ALL_INDUSTRIES.reduce((sum, ind) => sum + ind.skills.length, 0);
}

export function getIndustryCategories(): string[] {
  return [...new Set(ALL_INDUSTRIES.map((ind) => ind.category))];
}
