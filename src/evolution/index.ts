/**
 * Evolution Module - 自主进化系统
 *
 * 完整的自主进化系统，包含：
 * - EvolutionAgent: 自主进化Agent
 * - ExpertDispatcher: 专家调度器
 * - SelfLearningSystem: 自我学习系统
 * - WebLearningModule: 行业限制的网页学习
 * - KnowledgeBase: Agent知识库
 * - KnowledgeManager: 知识管理器
 * - EvolutionOrchestrator: 进化协调器
 * - EXPERT_AGENTS: 行业专家集合
 */

export { EvolutionAgent } from './agent';
export { ExpertDispatcher } from './dispatcher';
export { SelfLearningSystem } from './self-learning';
export { WebLearningModule } from './web-learning';
export { AgentKnowledgeBase } from './knowledge-base';
export { KnowledgeManager } from './knowledge-manager';
export { EvolutionOrchestrator } from './orchestrator';
export {
  EXPERT_AGENTS,
  matchExpertByKeyword,
  getExpertsByIndustry,
  getIndustries,
  searchExperts,
  getExpertWebConfig,
} from './experts';
export type { ExpertAgent } from './experts';
export type {
  LearnedSkill,
  KnowledgeEntry,
  LearningGoal,
} from './self-learning';
export type {
  WebLearningConfig,
  LearningResource,
  IndustryWebConfig,
} from './web-learning';
export type {
  KnowledgeItem,
  KnowledgeBaseConfig,
  KnowledgeBaseStats,
  AgentUpgradeRecord,
} from './knowledge-base';
export type { KnowledgeSource } from './knowledge-manager';
export type { EvolutionConfig } from './orchestrator';
