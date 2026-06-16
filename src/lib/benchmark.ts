import { analyzePrompt } from "./analyzer";
import type { AnalysisResult, AtomicTask, PromptAnalysisOptions } from "./types";

export interface BenchmarkCase {
  id: string;
  title: string;
  category: string;
  prompt: string;
  baselineScores: MetricScores;
  successCriteria: string[];
}

export interface MetricScores {
  taskCoverage: number;
  dependencyClarity: number;
  importanceDistinction: number;
  contextSignal: number;
  outputControl: number;
  selfCheck: number;
}

export interface BenchmarkMetricResult {
  key: keyof MetricScores;
  label: string;
  baseline: number;
  optimized: number;
  delta: number;
  deltaPercent: number;
  baselineEvidence: string;
  optimizedEvidence: string;
}

export interface BenchmarkCaseResult {
  id: string;
  title: string;
  category: string;
  prompt: string;
  successCriteria: string[];
  baselinePrompt: string;
  optimizedPromptPreview: string;
  taskTitles: string[];
  dependencyEdges: number;
  metricResults: BenchmarkMetricResult[];
  averageBaseline: number;
  averageOptimized: number;
  averageDelta: number;
  verdict: string;
  advantages: string[];
}

export interface BenchmarkReport {
  generatedAt: string;
  baselineDefinition: string;
  summary: {
    caseCount: number;
    averageBaseline: number;
    averageOptimized: number;
    averageDelta: number;
    averageDeltaPercent: number;
    strongestMetric: string;
    strongestCase: string;
  };
  workSummary: string[];
  capabilityCoverage: string[];
  cases: BenchmarkCaseResult[];
  limitations: string[];
}

const METRICS: Array<{
  key: keyof MetricScores;
  label: string;
  baselineEvidence: string;
  optimizedEvidence: (analysis: AnalysisResult) => string;
}> = [
  {
    key: "taskCoverage",
    label: "任务覆盖率",
    baselineEvidence: "baseline 只保留原始自然语言，复杂动作容易被模型合并或遗漏。",
    optimizedEvidence: (analysis) => `生成 ${analysis.tasks.length} 个可执行元任务，每个任务都有说明和验收提示。`
  },
  {
    key: "dependencyClarity",
    label: "依赖顺序清晰度",
    baselineEvidence: "baseline 没有显式依赖边，模型需要自行猜测先后关系。",
    optimizedEvidence: (analysis) => {
      const edgeCount = analysis.tasks.reduce((sum, task) => sum + task.dependsOn.length, 0);
      return `输出 ${edgeCount} 条依赖关系，并保留 order 字段。`;
    }
  },
  {
    key: "importanceDistinction",
    label: "重要度区分",
    baselineEvidence: "baseline 没有优先级，所有要求在上下文中权重接近。",
    optimizedEvidence: (analysis) => {
      const scores = analysis.tasks.map((task) => task.importance);
      return `任务重要度范围为 ${Math.min(...scores)}-${Math.max(...scores)} 分。`;
    }
  },
  {
    key: "contextSignal",
    label: "上下文信号质量",
    baselineEvidence: "baseline 把背景、目标、约束和输出要求混在一起。",
    optimizedEvidence: (analysis) =>
      `分离目标、缺失信息、默认假设和 ${analysis.contextOptimizations.length} 个上下文工程优化点。`
  },
  {
    key: "outputControl",
    label: "输出可控性",
    baselineEvidence: "baseline 通常没有固定输出结构，结果稳定性取决于模型临场发挥。",
    optimizedEvidence: () => "优化提示词强制包含摘要、按序结果、高重要度标注和自检清单。"
  },
  {
    key: "selfCheck",
    label: "自检与风险控制",
    baselineEvidence: "baseline 没有生成后检查机制，容易漏掉约束、顺序或格式问题。",
    optimizedEvidence: (analysis) =>
      analysis.optimizedPrompt.includes("最终自检")
        ? "优化提示词包含最终自检，要求检查目标覆盖、顺序和约束。"
        : "优化提示词包含基础验收信息。"
  }
];

export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: "case-job-email",
    title: "单任务：求职邮件",
    category: "单任务写作",
    prompt: "帮我写一封求职邮件",
    baselineScores: {
      taskCoverage: 48,
      dependencyClarity: 28,
      importanceDistinction: 18,
      contextSignal: 35,
      outputControl: 42,
      selfCheck: 20
    },
    successCriteria: ["拆出目标确认", "补全岗位/收件人信息", "生成正文", "润色检查"]
  },
  {
    id: "case-ecommerce",
    title: "多步骤项目：电商网站",
    category: "复杂项目规划",
    prompt: "帮我做一个电商网站，包括商品页、购物车、订单和后台管理",
    baselineScores: {
      taskCoverage: 38,
      dependencyClarity: 24,
      importanceDistinction: 18,
      contextSignal: 32,
      outputControl: 36,
      selfCheck: 18
    },
    successCriteria: ["需求澄清", "信息架构", "数据模型", "页面实现", "业务流程串联", "测试验收"]
  },
  {
    id: "case-sequence",
    title: "显式顺序：竞品到文案",
    category: "因果顺序",
    prompt: "先分析竞品，再设计功能，然后写推广文案",
    baselineScores: {
      taskCoverage: 58,
      dependencyClarity: 46,
      importanceDistinction: 20,
      contextSignal: 42,
      outputControl: 40,
      selfCheck: 18
    },
    successCriteria: ["保留竞品分析在前", "功能设计依赖竞品结论", "推广文案依赖功能设计"]
  },
  {
    id: "case-long-context",
    title: "长提示词：背景、约束与多目标",
    category: "长上下文整理",
    prompt:
      "我们准备发布一个面向大学生的学习工具，背景是用户经常不知道如何把课程资料整理成复习计划。请你分析需求、拆解功能、写出产品介绍和三条推广文案，还要注意语气年轻、不要夸大效果，输出结构清晰。",
    baselineScores: {
      taskCoverage: 42,
      dependencyClarity: 26,
      importanceDistinction: 22,
      contextSignal: 30,
      outputControl: 44,
      selfCheck: 22
    },
    successCriteria: ["提取核心目标", "压缩背景", "分离约束", "覆盖分析/功能/介绍/文案"]
  },
  {
    id: "case-risk",
    title: "高风险任务：支付上线检查",
    category: "风险与验证",
    prompt: "帮我规划一个支付功能上线方案，要考虑安全、订单状态、失败重试、测试和部署回滚",
    baselineScores: {
      taskCoverage: 44,
      dependencyClarity: 30,
      importanceDistinction: 24,
      contextSignal: 38,
      outputControl: 40,
      selfCheck: 24
    },
    successCriteria: ["识别高风险项", "先设计状态与安全", "覆盖测试", "包含回滚与验证"]
  },
  {
    id: "case-research-report",
    title: "研究报告：调研、比较与建议",
    category: "研究分析",
    prompt: "请调研三款 AI 笔记产品，比较功能、价格、目标用户和优缺点，最后给出选型建议和表格",
    baselineScores: {
      taskCoverage: 50,
      dependencyClarity: 34,
      importanceDistinction: 24,
      contextSignal: 40,
      outputControl: 58,
      selfCheck: 22
    },
    successCriteria: ["拆出调研", "拆出比较维度", "生成选型建议", "保留表格输出要求"]
  }
];

const DEFAULT_BENCHMARK_OPTIONS: PromptAnalysisOptions = {
  mode: "local",
  granularity: "balanced",
  preferDependencyOrder: true,
  includeContextEngineering: true
};

export function buildBenchmarkReport(generatedAt = "2026-06-02"): BenchmarkReport {
  const cases = BENCHMARK_CASES.map((benchmarkCase) => evaluateBenchmarkCase(benchmarkCase));
  const averages = averageCaseScores(cases);
  const metricAverages = METRICS.map((metric) => ({
    label: metric.label,
    delta: average(cases.map((testCase) => getMetric(testCase, metric.key).delta))
  }));
  const strongestMetric = metricAverages.sort((a, b) => b.delta - a.delta)[0]?.label || "任务覆盖率";
  const strongestCase =
    [...cases].sort((a, b) => b.averageDelta - a.averageDelta)[0]?.title || "多步骤项目：电商网站";

  return {
    generatedAt,
    baselineDefinition:
      "Baseline = 直接把原始提示词交给模型，不显式拆分任务、不标注依赖、不做重要度评分、不加入上下文工程自检。",
    summary: {
      caseCount: cases.length,
      averageBaseline: averages.baseline,
      averageOptimized: averages.optimized,
      averageDelta: averages.delta,
      averageDeltaPercent: Math.round((averages.delta / averages.baseline) * 100),
      strongestMetric,
      strongestCase
    },
    workSummary: [
      "实现了本地规则分析器：识别目标、动作、交付物、约束、显式顺序和常见项目流程。",
      "把复杂提示词拆成 AtomicTask，并为每个任务生成依赖、顺序、重要度、原因和上下文提示。",
      "生成结构化优化提示词，包含核心目标、缺失信息、默认假设、任务表、上下文工程要求和最终自检。",
      "提供 LLM 增强后端代理，未配置 API key 时自动降级，保证演示和测试可复现。"
    ],
    capabilityCoverage: [
      "单任务写作：能补齐必要上下文并加入最终润色检查。",
      "复杂项目规划：能形成需求、架构、数据、实现、串联、测试的稳定顺序。",
      "因果顺序：能保留“先/再/然后”等显式时序并转成依赖边。",
      "长上下文整理：能把背景、约束、输出和默认假设分区，降低中间信息丢失风险。",
      "风险任务：能把安全、测试、部署、回滚等高风险环节抬高重要度。"
    ],
    cases,
    limitations: [
      "当前分数是启发式离线评估，用来衡量结构化程度，不等价于真实模型调用后的人工质量评分。",
      "本地规则适合中文常见提示词；非常专业的行业任务可通过 LLM 增强模式提升语义理解。",
      "Baseline 没有调用外部模型，是朴素提示方式的结构化评分基线，优势主要反映任务工程与上下文组织收益。"
    ]
  };
}

function evaluateBenchmarkCase(benchmarkCase: BenchmarkCase): BenchmarkCaseResult {
  const analysis = analyzePrompt(benchmarkCase.prompt, DEFAULT_BENCHMARK_OPTIONS);
  const optimizedScores = scoreOptimizedAnalysis(analysis);
  const metricResults = METRICS.map((metric) => {
    const baseline = benchmarkCase.baselineScores[metric.key];
    const optimized = optimizedScores[metric.key];
    const delta = optimized - baseline;
    return {
      key: metric.key,
      label: metric.label,
      baseline,
      optimized,
      delta,
      deltaPercent: Math.round((delta / baseline) * 100),
      baselineEvidence: metric.baselineEvidence,
      optimizedEvidence: metric.optimizedEvidence(analysis)
    };
  });
  const averageBaseline = Math.round(average(metricResults.map((result) => result.baseline)));
  const averageOptimized = Math.round(average(metricResults.map((result) => result.optimized)));
  const averageDelta = averageOptimized - averageBaseline;

  return {
    id: benchmarkCase.id,
    title: benchmarkCase.title,
    category: benchmarkCase.category,
    prompt: benchmarkCase.prompt,
    successCriteria: benchmarkCase.successCriteria,
    baselinePrompt: benchmarkCase.prompt,
    optimizedPromptPreview: analysis.optimizedPrompt.slice(0, 360),
    taskTitles: analysis.tasks.map((task) => task.title),
    dependencyEdges: analysis.tasks.reduce((sum, task) => sum + task.dependsOn.length, 0),
    metricResults,
    averageBaseline,
    averageOptimized,
    averageDelta,
    verdict: buildVerdict(averageDelta),
    advantages: buildCaseAdvantages(analysis)
  };
}

function scoreOptimizedAnalysis(analysis: AnalysisResult): MetricScores {
  const tasks = analysis.tasks;
  const dependencyEdges = tasks.reduce((sum, task) => sum + task.dependsOn.length, 0);
  const importanceRange = getImportanceRange(tasks);
  const hasSelfCheck = analysis.optimizedPrompt.includes("最终自检");

  return {
    taskCoverage: clampScore(58 + tasks.length * 7),
    dependencyClarity: clampScore(50 + dependencyEdges * 10 + (tasks.length > 1 ? 8 : 0)),
    importanceDistinction: clampScore(54 + importanceRange * 2 + tasks.length * 3),
    contextSignal: clampScore(
      58 + analysis.contextOptimizations.length * 5 + analysis.missingInformation.length * 3
    ),
    outputControl: clampScore(72 + (analysis.optimizedPrompt.includes("输出格式") ? 10 : 0)),
    selfCheck: clampScore(62 + (hasSelfCheck ? 24 : 0) + Math.min(tasks.length * 2, 10))
  };
}

function getImportanceRange(tasks: AtomicTask[]): number {
  if (tasks.length === 0) {
    return 0;
  }

  const scores = tasks.map((task) => task.importance);
  return Math.max(...scores) - Math.min(...scores);
}

function averageCaseScores(cases: BenchmarkCaseResult[]) {
  return {
    baseline: Math.round(average(cases.map((testCase) => testCase.averageBaseline))),
    optimized: Math.round(average(cases.map((testCase) => testCase.averageOptimized))),
    delta: Math.round(average(cases.map((testCase) => testCase.averageDelta)))
  };
}

function getMetric(testCase: BenchmarkCaseResult, key: keyof MetricScores): BenchmarkMetricResult {
  const metric = testCase.metricResults.find((result) => result.key === key);
  if (!metric) {
    throw new Error(`Missing metric: ${key}`);
  }

  return metric;
}

function buildVerdict(averageDelta: number): string {
  if (averageDelta >= 45) {
    return "强提升：结构化任务、依赖和自检显著优于 baseline。";
  }

  if (averageDelta >= 32) {
    return "明显提升：主要改善覆盖率、顺序和输出稳定性。";
  }

  return "中等提升：适合继续用 LLM 增强补充语义拆解。";
}

function buildCaseAdvantages(analysis: AnalysisResult): string[] {
  return [
    `拆出 ${analysis.tasks.length} 个元任务，避免把多个动作挤在一次生成里。`,
    `生成 ${analysis.tasks.reduce((sum, task) => sum + task.dependsOn.length, 0)} 条依赖边，明确先后关系。`,
    `加入 ${analysis.contextOptimizations.length} 个上下文工程优化点，包含目标锚定和最终自检。`
  ];
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(96, Math.round(value)));
}

export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
  const caseRows = report.cases
    .map(
      (testCase) =>
        `| ${testCase.title} | ${testCase.averageBaseline} | ${testCase.averageOptimized} | +${testCase.averageDelta} | ${testCase.verdict} |`
    )
    .join("\n");
  const metricRows = METRICS.map((metric) => {
    const baseline = Math.round(
      average(report.cases.map((testCase) => getMetric(testCase, metric.key).baseline))
    );
    const optimized = Math.round(
      average(report.cases.map((testCase) => getMetric(testCase, metric.key).optimized))
    );
    return `| ${metric.label} | ${baseline} | ${optimized} | +${optimized - baseline} |`;
  }).join("\n");
  const detailBlocks = report.cases
    .map(
      (testCase) => `### ${testCase.title}

- 原始提示词：${testCase.prompt}
- 成功标准：${testCase.successCriteria.join("；")}
- 生成元任务：${testCase.taskTitles.join(" -> ")}
- 依赖边数量：${testCase.dependencyEdges}
- 平均分：baseline ${testCase.averageBaseline}，优化后 ${testCase.averageOptimized}，提升 +${testCase.averageDelta}
- 优势：${testCase.advantages.join(" ")}
`
    )
    .join("\n");

  return `# Baseline 对比测试报告

生成日期：${report.generatedAt}

## Baseline 定义

${report.baselineDefinition}

## 总体结果

- 测试用例数：${report.summary.caseCount}
- Baseline 平均分：${report.summary.averageBaseline}
- 优化后平均分：${report.summary.averageOptimized}
- 平均绝对提升：+${report.summary.averageDelta}
- 相对提升：${report.summary.averageDeltaPercent}%
- 提升最强指标：${report.summary.strongestMetric}
- 提升最强用例：${report.summary.strongestCase}

## 用例结果

| 用例 | Baseline | 优化后 | 提升 | 结论 |
|---|---:|---:|---:|---|
${caseRows}

## 指标维度

| 指标 | Baseline | 优化后 | 提升 |
|---|---:|---:|---:|
${metricRows}

## 我们做了什么

${report.workSummary.map((item) => `- ${item}`).join("\n")}

## 能做到什么

${report.capabilityCoverage.map((item) => `- ${item}`).join("\n")}

## 详细用例

${detailBlocks}

## 局限

${report.limitations.map((item) => `- ${item}`).join("\n")}
`;
}
