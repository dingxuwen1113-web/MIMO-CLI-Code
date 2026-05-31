// ── Feature System Barrel Export ──────────────────────
// Central registration of all 55 innovation features

export { FeatureRegistry, FeatureModule, FeatureContext, FeatureMeta, FeatureCategory } from './registry';
export { estimateTokens, readFileSafe, getSourceFiles, runCommand, countLines, debounce, deepMerge, now_iso, now_date, fileHash, safeJsonParse } from './utils';

// Perception Layer (Features 1-7)
export { PredictiveIntentFeature } from './perception/predictive-intent';
export { CodePatternDNAFeature } from './perception/code-dna';
export { ContextMemoryGraphFeature } from './perception/memory-graph';
export { SemanticCodeSearchFeature } from './perception/semantic-search';
export { LiveFilesystemFeature } from './perception/live-filesystem';
export { SmartEnvironmentFeature } from './perception/smart-environment';
export { ContextualRelevanceDecayFeature } from './perception/relevance-decay';

// Quality Layer (Features 8-15)
export {
  MutationTestingFeature, DebtScoringFeature, RealtimeReviewFeature,
  APIContractFeature, DeadCodeFeature, BreakingChangeFeature,
  SmartLintFeature, MigrationGeneratorFeature,
} from './quality/index';

// Developer Experience Layer (Features 16-24)
export {
  CodeArchaeologyFeature, CodeTourFeature, TimeTravelFeature,
  SessionForkingFeature, MultiModalFeature, CommandSuggesterFeature,
  FuzzyNavigatorFeature, KeybindingFeature, DependencyGraphFeature,
} from './devex/index';

// DevOps + Collaboration Layer (Features 25-34)
export {
  CIOptimizerFeature, DeployWatchdogFeature, SupplyChainFeature,
  ContainerSandboxFeature, EnvParityFeature, TeamKnowledgeFeature,
  PRTemplateFeature, OwnershipTrackerFeature, AsyncCollabFeature,
  TeamConfigSyncFeature,
} from './devops-collab/index';

// Performance + Security + AI + Terminal Layer (Features 35-55)
export {
  CostPredictorFeature, BudgetSplitterFeature, ParallelDiffFeature,
  CacheMonitorFeature, SmartContextFeature, BatchOptimizerFeature,
  ThreatModelingFeature, ComplianceCheckerFeature, SecretLeakFeature,
  SandboxVisualizationFeature, MultiAgentDebateFeature, PropagationAnalysisFeature,
  AdaptiveLearningFeature, RegressionTestFeature, MultiRepoFeature,
  ADRGeneratorFeature, StreamingDiffFeature, SplitPaneFeature,
  NotificationFeature, HealthDashboardFeature, ActivityHeatmapFeature,
} from './advanced/index';

// Registration helper
import { FeatureRegistry, FeatureModule, FeatureContext } from './registry';
import { PredictiveIntentFeature } from './perception/predictive-intent';
import { CodePatternDNAFeature } from './perception/code-dna';
import { ContextMemoryGraphFeature } from './perception/memory-graph';
import { SemanticCodeSearchFeature } from './perception/semantic-search';
import { LiveFilesystemFeature } from './perception/live-filesystem';
import { SmartEnvironmentFeature } from './perception/smart-environment';
import { ContextualRelevanceDecayFeature } from './perception/relevance-decay';
import {
  MutationTestingFeature, DebtScoringFeature, RealtimeReviewFeature,
  APIContractFeature, DeadCodeFeature, BreakingChangeFeature,
  SmartLintFeature, MigrationGeneratorFeature,
} from './quality/index';
import {
  CodeArchaeologyFeature, CodeTourFeature, TimeTravelFeature,
  SessionForkingFeature, MultiModalFeature, CommandSuggesterFeature,
  FuzzyNavigatorFeature, KeybindingFeature, DependencyGraphFeature,
} from './devex/index';
import {
  CIOptimizerFeature, DeployWatchdogFeature, SupplyChainFeature,
  ContainerSandboxFeature, EnvParityFeature, TeamKnowledgeFeature,
  PRTemplateFeature, OwnershipTrackerFeature, AsyncCollabFeature,
  TeamConfigSyncFeature,
} from './devops-collab/index';
import {
  CostPredictorFeature, BudgetSplitterFeature, ParallelDiffFeature,
  CacheMonitorFeature, SmartContextFeature, BatchOptimizerFeature,
  ThreatModelingFeature, ComplianceCheckerFeature, SecretLeakFeature,
  SandboxVisualizationFeature, MultiAgentDebateFeature, PropagationAnalysisFeature,
  AdaptiveLearningFeature, RegressionTestFeature, MultiRepoFeature,
  ADRGeneratorFeature, StreamingDiffFeature, SplitPaneFeature,
  NotificationFeature, HealthDashboardFeature, ActivityHeatmapFeature,
} from './advanced/index';

/** Create and register all 55 features */
export function createFeatureRegistry(): FeatureRegistry {
  const registry = new FeatureRegistry();

  // All 55 features
  const allFeatures: FeatureModule[] = [
    // Perception (1-7)
    PredictiveIntentFeature, CodePatternDNAFeature, ContextMemoryGraphFeature,
    SemanticCodeSearchFeature, LiveFilesystemFeature, SmartEnvironmentFeature,
    ContextualRelevanceDecayFeature,
    // Quality (8-15)
    MutationTestingFeature, DebtScoringFeature, RealtimeReviewFeature,
    APIContractFeature, DeadCodeFeature, BreakingChangeFeature,
    SmartLintFeature, MigrationGeneratorFeature,
    // DevEx (16-24)
    CodeArchaeologyFeature, CodeTourFeature, TimeTravelFeature,
    SessionForkingFeature, MultiModalFeature, CommandSuggesterFeature,
    FuzzyNavigatorFeature, KeybindingFeature, DependencyGraphFeature,
    // DevOps + Collaboration (25-34)
    CIOptimizerFeature, DeployWatchdogFeature, SupplyChainFeature,
    ContainerSandboxFeature, EnvParityFeature, TeamKnowledgeFeature,
    PRTemplateFeature, OwnershipTrackerFeature, AsyncCollabFeature,
    TeamConfigSyncFeature,
    // Performance + Security + AI + Terminal (35-55)
    CostPredictorFeature, BudgetSplitterFeature, ParallelDiffFeature,
    CacheMonitorFeature, SmartContextFeature, BatchOptimizerFeature,
    ThreatModelingFeature, ComplianceCheckerFeature, SecretLeakFeature,
    SandboxVisualizationFeature, MultiAgentDebateFeature, PropagationAnalysisFeature,
    AdaptiveLearningFeature, RegressionTestFeature, MultiRepoFeature,
    ADRGeneratorFeature, StreamingDiffFeature, SplitPaneFeature,
    NotificationFeature, HealthDashboardFeature, ActivityHeatmapFeature,
  ];

  registry.registerAll(allFeatures);
  return registry;
}
