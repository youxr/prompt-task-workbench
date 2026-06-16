import type {
  AnalysisResult,
  AtomicTask,
  ContextOptimization,
  EstimatedImprovement,
  PromptAnalysisOptions
} from "./types";

const DEFAULT_OPTIONS: PromptAnalysisOptions = {
  mode: "local",
  granularity: "balanced",
  preferDependencyOrder: true,
  includeContextEngineering: true
};

const ACTION_PATTERN =
  /(分析|调研|比较|设计|规划|制定|拆解|给出|写|撰写|生成|创建|构建|实现|开发|整理|总结|提取|优化|测试|验证|部署|评估|解释|分类|排序|评分|翻译|润色|检查)([^，。；;、\n]*)/g;

const SEQUENCE_MARKERS = ["首先", "先", "第一步", "然后", "再", "接着", "其次", "最后"];

const RISK_TERMS = ["上线", "支付", "订单", "安全", "隐私", "合规", "数据库", "部署", "测试", "验证", "风险"];

const OUTPUT_TERMS = ["输出", "交付", "页面", "文案", "报告", "代码", "邮件", "网站", "系统", "方案"];

const CREATIVE_OBJECT_TERMS = [
  "小汽车",
  "汽车",
  "车",
  "机器人",
  "飞机",
  "房子",
  "玩具",
  "模型",
  "小游戏",
  "动画",
  "海报",
  "logo",
  "Logo",
  "图标",
  "角色"
];

export function analyzePrompt(
  prompt: string,
  rawOptions: Partial<PromptAnalysisOptions> = {}
): AnalysisResult {
  const options = { ...DEFAULT_OPTIONS, ...rawOptions };
  const normalized = normalizePrompt(prompt);

  if (!normalized) {
    return createEmptyResult();
  }

  const goal = extractGoal(normalized);
  const taskDrafts = createTaskDrafts(normalized, goal, options);
  const orderedTasks = scoreAndOrderTasks(taskDrafts, normalized, options);
  const missingInformation = inferMissingInformation(normalized, goal);
  const assumptions = inferAssumptions(normalized, goal, missingInformation);
  const contextOptimizations = options.includeContextEngineering
    ? buildContextOptimizations(normalized, orderedTasks)
    : [];
  const estimatedImprovements = estimateImprovements(normalized, orderedTasks);
  const optimizedPrompt = buildOptimizedPrompt({
    originalPrompt: normalized,
    goal,
    tasks: orderedTasks,
    contextOptimizations,
    missingInformation,
    assumptions
  });

  return {
    goal,
    tasks: orderedTasks,
    optimizedPrompt,
    contextOptimizations,
    estimatedImprovements,
    missingInformation,
    assumptions,
    source: "local"
  };
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function createEmptyResult(): AnalysisResult {
  return {
    goal: "等待输入提示词",
    tasks: [],
    optimizedPrompt: "请输入一个提示词后再开始分析。",
    contextOptimizations: [],
    estimatedImprovements: [],
    missingInformation: [],
    assumptions: [],
    source: "local"
  };
}

function extractGoal(prompt: string): string {
  const firstLine = prompt.split(/\n|。|！|？|\?|!/)[0]?.trim() || prompt;
  return stripAssistantPrefix(firstLine).slice(0, 120);
}

function stripAssistantPrefix(text: string): string {
  return text.replace(/^(请|帮我|帮忙|你需要|我想让你|麻烦你|请你)/, "").trim();
}

interface TaskDraft {
  title: string;
  description: string;
  dependsOn: string[];
  rationale: string;
  contextHints: string[];
}

function createTaskDrafts(
  prompt: string,
  goal: string,
  options: PromptAnalysisOptions
): TaskDraft[] {
  if (isJobEmailPrompt(prompt)) {
    return createJobEmailTasks();
  }

  if (isRiskLaunchPrompt(prompt)) {
    return createRiskLaunchTasks(prompt, goal);
  }

  if (isProjectPrompt(prompt)) {
    return createProjectTasks(prompt, goal, options);
  }

  if (isCreativeBuildPrompt(prompt)) {
    return createCreativeBuildTasks(prompt, goal, options);
  }

  const sequenceTasks = extractExplicitSequenceTasks(prompt);
  if (sequenceTasks.length >= 2) {
    return withSequentialDependencies(sequenceTasks);
  }

  const actionTasks = extractActionTasks(prompt);
  if (actionTasks.length > 0) {
    return withPlanningAndReview(actionTasks, options);
  }

  return createGenericTasks(goal, options);
}

function isJobEmailPrompt(prompt: string): boolean {
  return /求职|应聘|简历|岗位|职位/.test(prompt) && /邮件|email|信/.test(prompt);
}

function createJobEmailTasks(): TaskDraft[] {
  return [
    {
      title: "确认求职目标与邮件场景",
      description: "明确目标岗位、收件人、投递目的和希望对方采取的下一步行动。",
      dependsOn: [],
      rationale: "求职邮件的语气、内容重点和行动号召都依赖目标场景。",
      contextHints: ["岗位名称", "公司名称", "邮件用途", "期望回应"]
    },
    {
      title: "补全收件人与候选人信息",
      description: "整理收件人称谓、候选人经历亮点、匹配能力和附件信息。",
      dependsOn: ["T1"],
      rationale: "缺少收件人和岗位信息时，正文容易空泛或误配。",
      contextHints: ["收件人姓名", "核心经历", "岗位要求", "简历/作品集链接"]
    },
    {
      title: "撰写邮件正文",
      description: "生成主题、问候、求职动机、能力匹配、附件说明和礼貌结尾。",
      dependsOn: ["T2"],
      rationale: "正文是主要交付物，必须建立在已确认的信息之上。",
      contextHints: ["邮件长度", "正式程度", "是否需要中英双语"]
    },
    {
      title: "润色并检查可发送性",
      description: "检查语气、错别字、格式、行动号召和附件提醒，输出最终可发送版本。",
      dependsOn: ["T3"],
      rationale: "最后检查能降低遗漏附件、称谓错误和表达不专业的风险。",
      contextHints: ["称谓一致", "附件说明", "联系方式", "无多余套话"]
    }
  ];
}

function isProjectPrompt(prompt: string): boolean {
  return /网站|系统|应用|平台|项目|小程序|App|APP/.test(prompt);
}

function isRiskLaunchPrompt(prompt: string): boolean {
  return /支付|上线|回滚|失败重试|安全|订单状态/.test(prompt) && /方案|规划|检查|测试/.test(prompt);
}

function isCreativeBuildPrompt(prompt: string): boolean {
  if (/购物车|车站|车辆管理|车险|车贷/.test(prompt)) {
    return false;
  }

  const hasObject = CREATIVE_OBJECT_TERMS.some((term) => prompt.includes(term));
  const hasBuildIntent = /想做|做个|做一个|生成|画|设计|制作|实现|开发|创建|帮我做|我要做/.test(prompt);
  return hasObject && (hasBuildIntent || prompt.length <= 18);
}

function createCreativeBuildTasks(
  prompt: string,
  goal: string,
  options: PromptAnalysisOptions
): TaskDraft[] {
  const objectName = extractCreativeObject(prompt) || goal;
  const medium = inferCreativeMedium(prompt);
  const tasks: TaskDraft[] = [
    {
      title: "明确作品形态与目标体验",
      description: `把“${objectName}”从一句模糊想法落成具体作品：${medium}，并定义目标用户、使用场景和最终观感。`,
      dependsOn: [],
      rationale: "创意类短提示词最大的问题是目标形态不清，必须先把作品类型和体验目标定下来。",
      contextHints: ["作品类型", "目标用户", "使用场景", "完成形态"]
    },
    {
      title: "拆解核心组成元素",
      description: `列出${objectName}必须具备的结构、外观、交互和内容元素，例如主体、颜色、比例、状态和细节。`,
      dependsOn: ["T1"],
      rationale: "先拆元素可以避免生成结果只有一个空泛概念，没有可检查细节。",
      contextHints: ["主体结构", "颜色风格", "关键细节", "可选装饰"]
    },
    {
      title: "设计最小可行版本",
      description: `给出${objectName}的 MVP 方案，优先完成一眼能看懂、能演示、能迭代的版本。`,
      dependsOn: ["T2"],
      rationale: "MVP 能让模糊创意快速变成可交付成果，避免一开始追求过大范围。",
      contextHints: ["最小功能", "第一屏效果", "可演示路径", "暂不包含"]
    },
    {
      title: "补充表现力与交互细节",
      description: `为${objectName}补充视觉层次、动态反馈、用户操作和边界状态，让作品不只是“有”，而是“像”。`,
      dependsOn: ["T3"],
      rationale: "创意作品的质量差异通常来自细节和反馈，不应只停留在功能清单。",
      contextHints: ["视觉层次", "动画反馈", "交互状态", "异常/边界"]
    },
    {
      title: "生成制作提示词或实现计划",
      description: `输出可直接交给 AI 或开发者执行的制作指令，包含目标、元素、步骤、风格、验收标准。`,
      dependsOn: ["T4"],
      rationale: "最终产物要能被下一步直接执行，而不是只给概念描述。",
      contextHints: ["制作步骤", "提示词", "代码/素材要求", "验收标准"]
    },
    {
      title: "验收与迭代建议",
      description: `检查${objectName}是否满足目标体验，并给出 3 个可选升级方向。`,
      dependsOn: ["T5"],
      rationale: "创意项目需要明确“什么算好”和“下一版怎么变好”。",
      contextHints: ["验收清单", "可玩性/可视性", "升级方向", "用户反馈"]
    }
  ];

  return options.granularity === "compact" ? tasks.slice(0, 5) : tasks;
}

function extractCreativeObject(prompt: string): string {
  return CREATIVE_OBJECT_TERMS.find((term) => prompt.includes(term)) || "";
}

function inferCreativeMedium(prompt: string): string {
  if (/网页|页面|网站|前端|HTML|CSS|React|小游戏|交互/.test(prompt)) {
    return "交互式网页作品";
  }

  if (/画|图片|海报|logo|图标|视觉/.test(prompt)) {
    return "视觉设计稿";
  }

  if (/3D|模型|建模|立体/.test(prompt)) {
    return "三维或模型作品";
  }

  return "可视化原型或交互小作品";
}

function createRiskLaunchTasks(prompt: string, goal: string): TaskDraft[] {
  const riskItems = extractRiskItems(prompt);

  return [
    {
      title: "明确上线目标与风险边界",
      description: `确认上线范围、影响用户、成功标准和不能接受的失败状态。当前目标：${goal}。`,
      dependsOn: [],
      rationale: "高风险上线任务必须先定义边界，否则安全、订单和回滚策略容易遗漏。",
      contextHints: ["上线范围", "影响用户", "成功标准", "不可接受风险"]
    },
    {
      title: "设计安全与订单状态策略",
      description: "梳理支付安全、订单状态机、幂等处理和异常状态归档。",
      dependsOn: ["T1"],
      rationale: "安全和订单状态是支付链路的核心前置依赖。",
      contextHints: ["权限校验", "状态机", "幂等键", "异常订单"]
    },
    {
      title: "规划失败重试与降级回滚",
      description: `针对${riskItems.join("、")}设计失败重试、降级、告警和回滚策略。`,
      dependsOn: ["T2"],
      rationale: "失败路径要先于部署计划明确，避免上线后无法恢复。",
      contextHints: ["重试条件", "降级策略", "回滚触发", "告警阈值"]
    },
    {
      title: "制定测试与上线验证清单",
      description: "覆盖单元测试、集成测试、沙箱支付、灰度验证、监控和上线后巡检。",
      dependsOn: ["T3"],
      rationale: "测试和验证是支付上线的最后质量门槛。",
      contextHints: ["沙箱测试", "灰度发布", "监控面板", "巡检清单"]
    },
    {
      title: "输出上线决策与责任分工",
      description: "给出是否可上线、负责人、时间窗口、回滚负责人和最终确认项。",
      dependsOn: ["T4"],
      rationale: "高风险方案需要明确决策点和责任人，避免执行阶段失控。",
      contextHints: ["Go/No-Go", "负责人", "时间窗口", "复盘记录"]
    }
  ];
}

function extractRiskItems(prompt: string): string[] {
  const items = ["安全", "订单状态", "失败重试", "测试", "部署回滚"].filter((item) =>
    prompt.includes(item)
  );
  return items.length > 0 ? items : ["核心风险项"];
}

function createProjectTasks(
  prompt: string,
  goal: string,
  options: PromptAnalysisOptions
): TaskDraft[] {
  const includedFeatures = extractIncludedFeatures(prompt);
  const featureText = includedFeatures.length > 0 ? includedFeatures.join("、") : goal;

  const tasks: TaskDraft[] = [
    {
      title: "澄清产品目标与边界",
      description: `确认项目要解决的问题、目标用户、核心交付物和不做的范围。当前目标：${goal}。`,
      dependsOn: [],
      rationale: "项目型提示词如果不先定义边界，后续页面和数据模型容易膨胀。",
      contextHints: ["目标用户", "核心流程", "必须交付", "暂不包含"]
    },
    {
      title: "规划信息架构与功能模块",
      description: `把需求拆为页面、模块和关键流程，覆盖：${featureText}。`,
      dependsOn: ["T1"],
      rationale: "信息架构决定页面拆分和实现顺序。",
      contextHints: ["页面列表", "导航结构", "用户路径", "后台入口"]
    },
    {
      title: "设计数据模型与状态流",
      description: "定义核心实体、字段、状态变化、前后端接口和错误状态。",
      dependsOn: ["T2"],
      rationale: "数据模型是页面、购物流程和后台管理的共同依赖。",
      contextHints: ["实体关系", "状态枚举", "接口约定", "权限边界"]
    },
    {
      title: "实现核心页面与交互",
      description: `按依赖顺序实现面向用户和管理端的功能：${featureText}。`,
      dependsOn: ["T2", "T3"],
      rationale: "核心页面是主要交付物，需要同时遵守结构设计和数据约定。",
      contextHints: ["响应式布局", "空状态", "加载状态", "错误反馈"]
    },
    {
      title: "串联业务流程和上下文状态",
      description: "连接跨页面流程，确保用户操作、状态更新和管理端反馈一致。",
      dependsOn: ["T4"],
      rationale: "跨步骤流程最容易出现上下文断裂，需要单独验证。",
      contextHints: ["购物车同步", "订单状态", "表单校验", "权限提示"]
    },
    {
      title: "测试关键路径并输出验收清单",
      description: "覆盖主流程、边界状态、失败场景和最终交付说明。",
      dependsOn: ["T5"],
      rationale: "测试把实现结果与原始目标重新对齐，降低交付风险。",
      contextHints: ["主路径测试", "边界测试", "回归清单", "验收标准"]
    }
  ];

  return options.granularity === "compact" ? tasks.filter((_, index) => index !== 4) : tasks;
}

function extractIncludedFeatures(prompt: string): string[] {
  const includeMatch = prompt.match(/包括(.+?)(?:。|；|;|\n|$)/);
  if (!includeMatch) {
    return [];
  }

  return includeMatch[1]
    .split(/、|，|,|和|以及/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function extractExplicitSequenceTasks(prompt: string): TaskDraft[] {
  if (!SEQUENCE_MARKERS.some((marker) => prompt.includes(marker))) {
    return [];
  }

  return prompt
    .split(/首先|第一步|先|然后|再|接着|其次|最后|，|。|；|;|\n/)
    .map((part) => stripAssistantPrefix(part).trim())
    .filter((part) => {
      ACTION_PATTERN.lastIndex = 0;
      return part.length >= 2 && ACTION_PATTERN.test(part);
    })
    .map((part) => {
      ACTION_PATTERN.lastIndex = 0;
      return createDraftFromPhrase(part);
    });
}

function extractActionTasks(prompt: string): TaskDraft[] {
  ACTION_PATTERN.lastIndex = 0;
  const matches = [...prompt.matchAll(ACTION_PATTERN)]
    .map((match) => `${match[1]}${match[2]}`.trim())
    .filter((phrase) => phrase.length >= 2);

  const uniquePhrases = [...new Set(matches)].slice(0, 8);
  return uniquePhrases.map(createDraftFromPhrase);
}

function createDraftFromPhrase(phrase: string): TaskDraft {
  const title = normalizeTaskTitle(phrase);
  return {
    title,
    description: `围绕“${phrase}”完成一个单一、可验证的执行步骤，并明确输入与输出。`,
    dependsOn: [],
    rationale: "该动作来自原始提示词中的显式任务要求。",
    contextHints: ["输入材料", "输出格式", "完成标准"]
  };
}

function normalizeTaskTitle(phrase: string): string {
  const clean = stripAssistantPrefix(phrase).replace(/^并且|^同时|^以及/, "").trim();
  return clean.length > 24 ? `${clean.slice(0, 24)}...` : clean;
}

function withSequentialDependencies(tasks: TaskDraft[]): TaskDraft[] {
  return tasks.map((task, index) => ({
    ...task,
    dependsOn: index === 0 ? [] : [`T${index}`],
    rationale:
      index === 0
        ? "原始提示词把该任务放在序列开头，应作为前置分析。"
        : "原始提示词存在显式先后词，该任务应等待前一步产物。"
  }));
}

function withPlanningAndReview(tasks: TaskDraft[], options: PromptAnalysisOptions): TaskDraft[] {
  const result: TaskDraft[] = [
    {
      title: "确认目标、约束与交付格式",
      description: "提取最终目标、必要上下文、输出格式和不能违反的约束。",
      dependsOn: [],
      rationale: "先稳定任务边界，可以减少后续生成偏题和遗漏。",
      contextHints: ["最终目标", "受众", "格式要求", "限制条件"]
    },
    ...tasks.map((task, index) => ({
      ...task,
      dependsOn: index === 0 ? ["T1"] : [`T${index + 1}`]
    }))
  ];

  if (options.granularity !== "compact") {
    result.push({
      title: "自检覆盖率与约束遵循",
      description: "检查所有子任务是否完成、顺序是否正确、输出是否满足原始约束。",
      dependsOn: [`T${result.length}`],
      rationale: "最终自检能显著降低漏项和格式漂移。",
      contextHints: ["任务覆盖", "依赖顺序", "格式一致", "风险项"]
    });
  }

  return result;
}

function createGenericTasks(goal: string, options: PromptAnalysisOptions): TaskDraft[] {
  const tasks: TaskDraft[] = [
    {
      title: "提取目标与成功标准",
      description: `把“${goal}”转写为明确目标、受众、交付物和完成标准。`,
      dependsOn: [],
      rationale: "泛化提示词通常缺少可执行边界，先提取目标最稳。",
      contextHints: ["受众", "交付物", "成功标准"]
    },
    {
      title: "拆解可执行元任务",
      description: "把目标拆成单一动作、明确输入、明确输出的任务序列。",
      dependsOn: ["T1"],
      rationale: "元任务拆解能降低复杂提示词的一次性负担。",
      contextHints: ["动作", "输入", "输出", "验收"]
    },
    {
      title: "生成最终回答或交付物",
      description: "按照元任务产物生成最终内容，并保留关键约束。",
      dependsOn: ["T2"],
      rationale: "最终交付物必须建立在拆解后的任务结果之上。",
      contextHints: ["输出格式", "关键约束", "完成标准"]
    }
  ];

  if (options.granularity === "detailed") {
    tasks.push({
      title: "执行结果自检与修订",
      description: "检查遗漏、矛盾、格式错误和上下文噪声，并给出修订版。",
      dependsOn: ["T3"],
      rationale: "详细模式下需要把质量控制作为独立任务。",
      contextHints: ["遗漏检查", "矛盾检查", "格式检查"]
    });
  }

  return tasks;
}

function scoreAndOrderTasks(
  drafts: TaskDraft[],
  prompt: string,
  options: PromptAnalysisOptions
): AtomicTask[] {
  const withIds = drafts.map((task, index) => ({
    ...task,
    id: `T${index + 1}`
  }));

  const dependentCounts = new Map<string, number>();
  withIds.forEach((task) => {
    task.dependsOn.forEach((dependency) => {
      dependentCounts.set(dependency, (dependentCounts.get(dependency) || 0) + 1);
    });
  });

  const scored = withIds.map((task, index) => {
    const titleAndDescription = `${task.title}${task.description}`;
    const risk = RISK_TERMS.some((term) => titleAndDescription.includes(term)) ? 10 : 0;
    const outputImpact = OUTPUT_TERMS.some((term) => titleAndDescription.includes(term)) ? 12 : 0;
    const dependencyCentrality = Math.min((dependentCounts.get(task.id) || 0) * 8, 20);
    const bottleneck = /确认|澄清|收集|分析|设计|规划|数据模型|架构/.test(titleAndDescription) ? 10 : 0;
    const explicitPromptOverlap = prompt.includes(task.title.replace("...", "")) ? 8 : 0;
    const finalReview = /测试|验证|检查|自检|润色/.test(titleAndDescription) ? 8 : 0;
    const importance = clamp(
      Math.round(44 + risk + outputImpact + dependencyCentrality + bottleneck + explicitPromptOverlap + finalReview),
      45,
      98
    );

    return {
      id: task.id,
      title: task.title,
      description: task.description,
      dependsOn: task.dependsOn,
      importance,
      order: index + 1,
      rationale: task.rationale,
      contextHints: task.contextHints
    };
  });

  return options.preferDependencyOrder ? scored : scored.sort((a, b) => b.importance - a.importance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function inferMissingInformation(prompt: string, goal: string): string[] {
  const missing: string[] = [];

  if (!/受众|用户|读者|客户|面向/.test(prompt)) {
    missing.push("目标受众或使用场景");
  }

  if (!/格式|输出|表格|列表|JSON|Markdown|代码|页面/.test(prompt)) {
    missing.push("期望输出格式");
  }

  if (/邮件|求职|应聘/.test(prompt) && !/公司|岗位|收件人|HR|招聘/.test(prompt)) {
    missing.push("公司、岗位和收件人信息");
  }

  if (/网站|系统|应用|平台|项目/.test(goal) && !/技术栈|React|Vue|后端|数据库/.test(prompt)) {
    missing.push("技术栈、数据来源和部署约束");
  }

  if (isCreativeBuildPrompt(prompt)) {
    if (!/网页|页面|图片|3D|模型|实物|动画|小游戏|React|HTML|画/.test(prompt)) {
      missing.push("作品形态：网页、图片、动画、3D 模型还是实物方案");
    }

    if (!/风格|颜色|可爱|科技|卡通|写实|复古|极简/.test(prompt)) {
      missing.push("视觉风格和颜色偏好");
    }

    if (!/孩子|用户|展示|课程|比赛|作业|商用|个人/.test(prompt)) {
      missing.push("用途、受众和验收场景");
    }
  }

  return missing;
}

function inferAssumptions(prompt: string, goal: string, missingInformation: string[]): string[] {
  const assumptions: string[] = [];

  if (missingInformation.includes("目标受众或使用场景")) {
    assumptions.push("若未提供受众，默认面向普通中文用户，优先保证清晰和可执行。");
  }

  if (missingInformation.includes("期望输出格式")) {
    assumptions.push("若未提供格式，默认使用 Markdown 分节、任务表和检查清单。");
  }

  if (/网站|系统|应用|平台|项目/.test(goal)) {
    assumptions.push("项目型任务默认先做需求和数据结构，再做页面实现和测试。");
  }

  if (isCreativeBuildPrompt(prompt)) {
    assumptions.push("创意短提示默认按“可视化原型或交互小作品”推进，先做 MVP，再补表现力和验收标准。");
  }

  if (!/不要|禁止|不能/.test(prompt)) {
    assumptions.push("未声明禁区时，只保留与目标直接相关的上下文，减少噪声。");
  }

  return assumptions;
}

function buildContextOptimizations(prompt: string, tasks: AtomicTask[]): ContextOptimization[] {
  const hasLongPrompt = isLongContextPrompt(prompt);
  const hasDependencies = tasks.some((task) => task.dependsOn.length > 0);

  return [
    {
      name: "任务表结构化",
      description: "把复杂提示词拆成编号任务、依赖项和验收标准，降低模型跳步和漏项概率。",
      expectedImpact: "任务覆盖率预计提升 25%-45%。"
    },
    {
      name: "目标前后锚定",
      description: "在优化提示词开头声明目标，并在结尾用自检清单复述目标，缓解中段信息被忽视的问题。",
      expectedImpact: hasLongPrompt ? "长提示词遗漏率预计降低 35%-40%。" : "关键目标保持率预计提升 20%-30%。"
    },
    {
      name: "必要/可选上下文分离",
      description: "把必须遵守的信息、缺失信息和默认假设分区，避免把所有背景平均塞进上下文。",
      expectedImpact: "上下文噪声预计降低 25%-35%。"
    },
    {
      name: "依赖顺序显式化",
      description: hasDependencies
        ? "将前置任务和后续任务显式绑定，确保模型先产出依赖材料再继续。"
        : "即使原始提示词没有顺序，也补充先澄清、再执行、后检查的稳定流程。",
      expectedImpact: "执行顺序错误预计降低 30%-60%。"
    },
    {
      name: "自检与反思槽位",
      description: "在最终输出前要求检查覆盖率、约束遵循和格式一致性，吸收 Self-RAG 式的生成后批判思路。",
      expectedImpact: "格式稳定性和约束遵循预计提升 20%-35%。"
    }
  ];
}

function estimateImprovements(prompt: string, tasks: AtomicTask[]): EstimatedImprovement[] {
  const complexity = Math.min(tasks.length, 8);
  const hasExplicitSequence = SEQUENCE_MARKERS.some((marker) => prompt.includes(marker));
  const isLong = isLongContextPrompt(prompt);
  const isProject = isProjectPrompt(prompt);

  return [
    {
      metric: "任务覆盖率",
      before: "原提示词容易把多个动作混在一个生成步骤中。",
      after: "元任务拆解后，每个动作都有明确输入、输出和验收点。",
      improvement: clamp(20 + complexity * 4 + (isProject ? 8 : 0), 25, 55),
      rationale: "拆解粒度越多，越能减少遗漏；项目型任务收益更明显。"
    },
    {
      metric: "执行顺序正确率",
      before: "模型可能按文本近邻或显著性执行，而不是按依赖关系执行。",
      after: "依赖项和顺序编号让前置分析、设计、实现、检查形成稳定链路。",
      improvement: hasExplicitSequence ? 60 : clamp(25 + complexity * 4, 30, 52),
      rationale: hasExplicitSequence ? "原文已有先后词，显式保留后收益最高。" : "隐式依赖被转为显式任务边。"
    },
    {
      metric: "上下文噪声控制",
      before: "背景、目标、约束、交付格式混放，模型需要自行判断权重。",
      after: "必要上下文、缺失信息、默认假设和任务表分区呈现。",
      improvement: isLong ? 35 : 26,
      rationale: "分区能降低无关背景对关键目标的干扰。"
    },
    {
      metric: "格式稳定性",
      before: "输出形式依赖模型临场发挥。",
      after: "提示词包含固定结构、优先级标签和自检清单。",
      improvement: /邮件|文案|报告/.test(prompt) ? 30 : 24,
      rationale: "结构化输出要求能提升最终结果的一致性。"
    }
  ];
}

function isLongContextPrompt(prompt: string): boolean {
  const clauseCount = prompt.split(/，|。|；|;|\n/).filter((part) => part.trim().length > 0).length;
  return prompt.length > 95 || clauseCount >= 4;
}

function buildOptimizedPrompt(input: {
  originalPrompt: string;
  goal: string;
  tasks: AtomicTask[];
  contextOptimizations: ContextOptimization[];
  missingInformation: string[];
  assumptions: string[];
}): string {
  const {
    originalPrompt,
    goal,
    tasks,
    contextOptimizations,
    missingInformation,
    assumptions
  } = input;

  const taskRows = tasks
    .map((task) => {
      const priority = getPriorityLabel(task.importance);
      const dependencies = task.dependsOn.length > 0 ? task.dependsOn.join(", ") : "无";
      return `${task.order}. [${priority} ${task.importance}/100] ${task.title}\n   - 依赖：${dependencies}\n   - 执行：${task.description}\n   - 验收：${task.contextHints.join("；")}`;
    })
    .join("\n");

  const missingBlock =
    missingInformation.length > 0
      ? missingInformation.map((item) => `- ${item}`).join("\n")
      : "- 暂无明显缺失信息。";

  const assumptionBlock =
    assumptions.length > 0 ? assumptions.map((item) => `- ${item}`).join("\n") : "- 不额外引入假设。";

  const optimizationBlock =
    contextOptimizations.length > 0
      ? contextOptimizations.map((item) => `- ${item.name}：${item.description}`).join("\n")
      : "- 本次不加入额外上下文工程优化。";

  return `你是一个严谨的 AI 任务执行助手。请围绕以下目标完成任务，并严格按依赖顺序执行。

# 核心目标
${goal}

# 原始提示词
${originalPrompt}

# 缺失信息与默认处理
如果信息缺失，请先列出待确认问题；若用户要求直接执行，则使用下列默认假设继续：
${missingBlock}

# 默认假设
${assumptionBlock}

# 执行任务表
${taskRows}

# 上下文工程要求
${optimizationBlock}

# 输出格式
1. 先给出任务执行摘要。
2. 按任务顺序输出主要结果。
3. 对高重要度任务标注“关键”。
4. 最后给出自检清单，确认目标覆盖、顺序正确、约束遵循、格式一致。

# 最终自检
在结束前再次确认：回答是否服务于“${goal}”，是否遗漏高重要度任务，是否错误跳过依赖项。`;
}

function getPriorityLabel(score: number): string {
  if (score >= 82) {
    return "高";
  }

  if (score >= 66) {
    return "中";
  }

  return "低";
}

export function getSamplePrompts(): Array<{ title: string; prompt: string; expectation: string }> {
  return [
    {
      title: "单任务：求职邮件",
      prompt: "帮我写一封求职邮件",
      expectation: "应拆出目标确认、收件人/岗位信息、邮件正文、润色检查。"
    },
    {
      title: "多步骤项目：电商网站",
      prompt: "帮我做一个电商网站，包括商品页、购物车、订单和后台管理",
      expectation: "应拆出需求澄清、信息架构、数据模型、页面开发、状态管理、测试。"
    },
    {
      title: "显式顺序：竞品到文案",
      prompt: "先分析竞品，再设计功能，然后写推广文案",
      expectation: "应保留竞品分析、功能设计、推广文案的因果顺序。"
    },
    {
      title: "模糊创意：小汽车",
      prompt: "我想做个小汽车",
      expectation: "应主动补全作品形态、核心元素、MVP、表现力、制作计划和验收标准。"
    },
    {
      title: "长提示词：背景与多目标",
      prompt:
        "我们准备发布一个面向大学生的学习工具，背景是用户经常不知道如何把课程资料整理成复习计划。请你分析需求、拆解功能、写出产品介绍和三条推广文案，还要注意语气年轻、不要夸大效果，输出结构清晰。",
      expectation: "应提取目标、压缩上下文、分离约束和任务，并降低遗漏。"
    }
  ];
}
