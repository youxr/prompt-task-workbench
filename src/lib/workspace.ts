import type { AnalysisResult, AtomicTask } from "./types";

export type ContextPackKind = "brief" | "constraints" | "assumptions" | "retrieval" | "memory";
export type RiskLevel = "高" | "中" | "低";

export interface WorkflowStage {
  id: string;
  title: string;
  purpose: string;
  taskIds: string[];
  owner: string;
  expectedOutput: string;
  qualityGateId: string;
}

export interface AgentRole {
  id: string;
  name: string;
  responsibility: string;
  ownsTaskIds: string[];
  handoffRule: string;
}

export interface ContextPack {
  id: string;
  kind: ContextPackKind;
  title: string;
  content: string[];
  usageRule: string;
}

export interface QualityGate {
  id: string;
  title: string;
  checklist: string[];
  passCondition: string;
}

export interface RiskItem {
  id: string;
  level: RiskLevel;
  title: string;
  trigger: string;
  mitigation: string;
}

export interface ExecutionContract {
  title: string;
  summary: string;
  contractPrompt: string;
  readinessScore: number;
  contextCompression: number;
  autonomyLevel: string;
}

export interface WorkspaceBlueprint {
  missionName: string;
  maturityLevel: string;
  stages: WorkflowStage[];
  roles: AgentRole[];
  contextPacks: ContextPack[];
  qualityGates: QualityGate[];
  risks: RiskItem[];
  executionContract: ExecutionContract;
}

export function buildWorkspaceBlueprint(analysis: AnalysisResult): WorkspaceBlueprint {
  const stages = buildStages(analysis.tasks);
  const roles = buildRoles(analysis.tasks);
  const contextPacks = buildContextPacks(analysis);
  const qualityGates = buildQualityGates(analysis.tasks);
  const risks = buildRisks(analysis);
  const readinessScore = scoreReadiness(analysis, stages, contextPacks, qualityGates, risks);
  const contextCompression = estimateContextCompression(analysis);

  return {
    missionName: analysis.goal,
    maturityLevel: getMaturityLevel(readinessScore),
    stages,
    roles,
    contextPacks,
    qualityGates,
    risks,
    executionContract: {
      title: "AI 执行合约",
      summary: "把提示词升级为可交接、可检查、可复盘的任务执行协议。",
      contractPrompt: buildExecutionContractPrompt(analysis, stages, roles, contextPacks, qualityGates, risks),
      readinessScore,
      contextCompression,
      autonomyLevel: readinessScore >= 85 ? "高自治：AI 可按合约连续执行" : "半自治：建议先确认缺失信息"
    }
  };
}

function buildStages(tasks: AtomicTask[]): WorkflowStage[] {
  if (tasks.length === 0) {
    return [];
  }

  const groups = [
    {
      title: "理解与澄清",
      purpose: "锁定目标、约束、缺失信息和成功标准。",
      matcher: /确认|澄清|提取|目标|收集|补全/
    },
    {
      title: "规划与设计",
      purpose: "形成结构、策略、数据、功能或分析框架。",
      matcher: /规划|设计|分析|调研|比较|数据模型|架构|策略/
    },
    {
      title: "生成与实现",
      purpose: "产出正文、代码、页面、方案、报告或具体交付物。",
      matcher: /写|撰写|生成|实现|开发|创建|构建|输出|正文|文案|页面/
    },
    {
      title: "验证与交付",
      purpose: "检查覆盖率、风险、格式、依赖顺序和最终可交付性。",
      matcher: /测试|验证|检查|自检|润色|验收|部署|回滚/
    }
  ];

  const stages = groups
    .map((group, index) => {
      const matchedTasks = tasks.filter((task) => group.matcher.test(`${task.title}${task.description}`));
      return {
        id: `S${index + 1}`,
        title: group.title,
        purpose: group.purpose,
        taskIds: matchedTasks.map((task) => task.id),
        owner: getStageOwner(group.title),
        expectedOutput: getExpectedOutput(group.title),
        qualityGateId: `Q${index + 1}`
      };
    })
    .filter((stage) => stage.taskIds.length > 0);

  return stages.length > 0
    ? stages
    : [
        {
          id: "S1",
          title: "端到端执行",
          purpose: "按任务序列完成完整交付。",
          taskIds: tasks.map((task) => task.id),
          owner: "执行代理",
          expectedOutput: "完整回答与自检结果",
          qualityGateId: "Q1"
        }
      ];
}

function getStageOwner(title: string): string {
  if (title.includes("理解")) return "上下文经理";
  if (title.includes("规划")) return "规划代理";
  if (title.includes("生成")) return "执行代理";
  return "质检代理";
}

function getExpectedOutput(title: string): string {
  if (title.includes("理解")) return "目标摘要、缺失信息和默认假设";
  if (title.includes("规划")) return "任务结构、依赖顺序和关键决策";
  if (title.includes("生成")) return "主要交付物初稿";
  return "验收清单、风险复核和最终版本";
}

function buildRoles(tasks: AtomicTask[]): AgentRole[] {
  return [
    {
      id: "R1",
      name: "上下文经理",
      responsibility: "压缩原始提示词，维护目标、约束、缺失信息和默认假设。",
      ownsTaskIds: tasks.filter((task) => /确认|澄清|提取|补全/.test(task.title)).map((task) => task.id),
      handoffRule: "只有当目标、输出格式和关键缺失信息被声明后，才交给规划代理。"
    },
    {
      id: "R2",
      name: "规划代理",
      responsibility: "把目标拆为阶段、依赖和执行顺序，识别高重要度任务。",
      ownsTaskIds: tasks.filter((task) => /规划|设计|分析|调研|比较|数据模型/.test(task.title)).map((task) => task.id),
      handoffRule: "交付任务图、依赖边和优先级后，交给执行代理。"
    },
    {
      id: "R3",
      name: "执行代理",
      responsibility: "按阶段产出正文、代码、方案、页面或报告。",
      ownsTaskIds: tasks.filter((task) => /写|撰写|生成|实现|开发|输出|页面|文案/.test(task.title)).map((task) => task.id),
      handoffRule: "每完成一个阶段，带上产物摘要和未解决问题交给质检代理。"
    },
    {
      id: "R4",
      name: "质检代理",
      responsibility: "验证覆盖率、依赖顺序、约束遵循、风险和最终格式。",
      ownsTaskIds: tasks.filter((task) => /测试|验证|检查|自检|润色|验收|回滚/.test(task.title)).map((task) => task.id),
      handoffRule: "若质量门未通过，返回对应阶段重做；通过后输出最终版本。"
    }
  ];
}

function buildContextPacks(analysis: AnalysisResult): ContextPack[] {
  const taskSummary = analysis.tasks.map((task) => `${task.id} ${task.title}(${task.importance}/100)`);
  return [
    {
      id: "C1",
      kind: "brief",
      title: "任务简报",
      content: [`核心目标：${analysis.goal}`, `任务序列：${taskSummary.join(" -> ")}`],
      usageRule: "每个阶段开始前读取，防止偏离主目标。"
    },
    {
      id: "C2",
      kind: "constraints",
      title: "约束与质量要求",
      content: [
        "必须按依赖顺序执行。",
        "高重要度任务必须在最终结果中明确体现。",
        "输出结束前必须执行自检。"
      ],
      usageRule: "作为执行过程中的硬约束，不满足时必须修订。"
    },
    {
      id: "C3",
      kind: "assumptions",
      title: "缺失信息与默认假设",
      content: [...analysis.missingInformation.map((item) => `待确认：${item}`), ...analysis.assumptions],
      usageRule: "信息缺失时先提问；若用户要求直接执行，则显式声明采用这些假设。"
    },
    {
      id: "C4",
      kind: "retrieval",
      title: "检索增强触发器",
      content: [
        "涉及价格、法规、竞品、产品版本、接口文档等时触发外部检索。",
        "检索证据必须和最终建议绑定，避免只凭常识生成。"
      ],
      usageRule: "当任务依赖事实新鲜度或外部证据时，先检索再生成。"
    },
    {
      id: "C5",
      kind: "memory",
      title: "可复用记忆",
      content: [
        "保留用户偏好、默认输出格式、已确认约束和历史决策。",
        "下一轮优化时优先复用，不重复询问已经确认的信息。"
      ],
      usageRule: "用于多轮会话，降低上下文重复和状态丢失。"
    }
  ];
}

function buildQualityGates(tasks: AtomicTask[]): QualityGate[] {
  return [
    {
      id: "Q1",
      title: "目标锁定门",
      checklist: ["目标是否一句话可复述", "缺失信息是否列出", "默认假设是否明确"],
      passCondition: "目标、缺失信息和假设三者都已显式呈现。"
    },
    {
      id: "Q2",
      title: "依赖顺序门",
      checklist: ["是否存在跳过前置任务", "依赖产物是否被后续任务引用", "高重要度任务是否靠前处理"],
      passCondition: `至少覆盖 ${Math.max(1, tasks.length - 1)} 个任务间关系或说明无依赖原因。`
    },
    {
      id: "Q3",
      title: "交付完整门",
      checklist: ["每个元任务是否有产物", "输出格式是否符合要求", "关键约束是否被保留"],
      passCondition: "所有高重要度任务都有可检查结果。"
    },
    {
      id: "Q4",
      title: "风险复核门",
      checklist: ["事实是否需要检索", "风险项是否有缓解方案", "最终自检是否发现遗漏"],
      passCondition: "无未处理高风险项，或已声明限制与下一步。"
    }
  ];
}

function buildRisks(analysis: AnalysisResult): RiskItem[] {
  const risks: RiskItem[] = [];

  if (analysis.missingInformation.length > 0) {
    risks.push({
      id: "K1",
      level: "中",
      title: "关键信息缺失",
      trigger: analysis.missingInformation.join("、"),
      mitigation: "先列出待确认问题；若继续执行，必须显式声明默认假设。"
    });
  }

  if (analysis.tasks.some((task) => /安全|支付|订单|部署|回滚|合规|风险/.test(`${task.title}${task.description}`))) {
    risks.push({
      id: "K2",
      level: "高",
      title: "高风险交付链路",
      trigger: "任务包含安全、支付、订单、部署或回滚。",
      mitigation: "提高测试和风险复核权重，最终输出 Go/No-Go 条件。"
    });
  }

  if (analysis.optimizedPrompt.length > 1200) {
    risks.push({
      id: "K3",
      level: "低",
      title: "上下文过长",
      trigger: "优化提示词较长，可能稀释关键信息。",
      mitigation: "用任务简报和质量门做前后锚定，只保留必要上下文。"
    });
  }

  return risks.length > 0
    ? risks
    : [
        {
          id: "K1",
          level: "低",
          title: "常规执行漂移",
          trigger: "模型可能在长输出中偏离任务表。",
          mitigation: "每阶段结束后用质量门回看目标、依赖和格式。"
        }
      ];
}

function scoreReadiness(
  analysis: AnalysisResult,
  stages: WorkflowStage[],
  contextPacks: ContextPack[],
  qualityGates: QualityGate[],
  risks: RiskItem[]
): number {
  const dependencyEdges = analysis.tasks.reduce((sum, task) => sum + task.dependsOn.length, 0);
  const highRiskPenalty = risks.filter((risk) => risk.level === "高").length * 6;
  return clamp(
    48 + stages.length * 6 + dependencyEdges * 4 + contextPacks.length * 3 + qualityGates.length * 4 - highRiskPenalty,
    45,
    96
  );
}

function estimateContextCompression(analysis: AnalysisResult): number {
  const rawBlocks = 1 + analysis.tasks.length + analysis.contextOptimizations.length;
  const packs = 5;
  return clamp(Math.round(((rawBlocks - packs) / Math.max(rawBlocks, 1)) * 100), 18, 68);
}

function getMaturityLevel(score: number): string {
  if (score >= 86) return "工作流级：可交给 AI 连续执行";
  if (score >= 72) return "协作级：适合人机共同推进";
  return "草案级：建议先补齐上下文";
}

function buildExecutionContractPrompt(
  analysis: AnalysisResult,
  stages: WorkflowStage[],
  roles: AgentRole[],
  contextPacks: ContextPack[],
  qualityGates: QualityGate[],
  risks: RiskItem[]
): string {
  return `# AI 任务执行合约

## 任务目标
${analysis.goal}

## 角色分工
${roles.map((role) => `- ${role.name}：${role.responsibility} 交接规则：${role.handoffRule}`).join("\n")}

## 执行阶段
${stages
  .map(
    (stage) =>
      `${stage.id}. ${stage.title} / ${stage.owner}\n   目的：${stage.purpose}\n   任务：${stage.taskIds.join(", ")}\n   产物：${stage.expectedOutput}\n   质量门：${stage.qualityGateId}`
  )
  .join("\n")}

## 上下文包
${contextPacks.map((pack) => `- ${pack.title}：${pack.content.join("；")} 用法：${pack.usageRule}`).join("\n")}

## 风险登记
${risks.map((risk) => `- [${risk.level}] ${risk.title}：${risk.trigger}；缓解：${risk.mitigation}`).join("\n")}

## 质量门
${qualityGates
  .map((gate) => `- ${gate.title}：${gate.checklist.join("；")}。通过条件：${gate.passCondition}`)
  .join("\n")}

## 输出要求
按阶段执行；每阶段先列输入、再列产物、最后过质量门。若质量门失败，先修订再继续。`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
