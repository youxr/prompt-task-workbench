export type AnalysisMode = "local" | "llm" | "hybrid";

export type Granularity = "compact" | "balanced" | "detailed";

export interface PromptAnalysisOptions {
  mode: AnalysisMode;
  granularity: Granularity;
  preferDependencyOrder: boolean;
  includeContextEngineering: boolean;
}

export interface AtomicTask {
  id: string;
  title: string;
  description: string;
  dependsOn: string[];
  importance: number;
  order: number;
  rationale: string;
  contextHints: string[];
}

export interface ContextOptimization {
  name: string;
  description: string;
  expectedImpact: string;
}

export interface EstimatedImprovement {
  metric: string;
  before: string;
  after: string;
  improvement: number;
  rationale: string;
}

export interface AnalysisResult {
  goal: string;
  tasks: AtomicTask[];
  optimizedPrompt: string;
  contextOptimizations: ContextOptimization[];
  estimatedImprovements: EstimatedImprovement[];
  missingInformation: string[];
  assumptions: string[];
  source: "local" | "llm" | "hybrid-fallback";
}
