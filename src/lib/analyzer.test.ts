import { describe, expect, it } from "vitest";
import { analyzePrompt } from "./analyzer";

describe("analyzePrompt", () => {
  it("splits a job email prompt into expected atomic tasks", () => {
    const result = analyzePrompt("帮我写一封求职邮件");

    expect(result.tasks).toHaveLength(4);
    expect(result.tasks.map((task) => task.title)).toEqual([
      "确认求职目标与邮件场景",
      "补全收件人与候选人信息",
      "撰写邮件正文",
      "润色并检查可发送性"
    ]);
    expect(result.tasks[2].dependsOn).toEqual(["T2"]);
    expect(result.optimizedPrompt).toContain("自检清单");
  });

  it("builds a project workflow for an ecommerce website prompt", () => {
    const result = analyzePrompt("帮我做一个电商网站，包括商品页、购物车、订单和后台管理");

    expect(result.tasks.length).toBeGreaterThanOrEqual(5);
    expect(result.tasks.some((task) => task.title.includes("数据模型"))).toBe(true);
    expect(result.tasks.some((task) => task.description.includes("商品页"))).toBe(true);
    expect(result.estimatedImprovements.find((item) => item.metric === "任务覆盖率")?.improvement).toBeGreaterThanOrEqual(
      45
    );
  });

  it("preserves explicit sequence dependencies", () => {
    const result = analyzePrompt("先分析竞品，再设计功能，然后写推广文案");

    expect(result.tasks.map((task) => task.title)).toEqual(["分析竞品", "设计功能", "写推广文案"]);
    expect(result.tasks[0].dependsOn).toEqual([]);
    expect(result.tasks[1].dependsOn).toEqual(["T1"]);
    expect(result.tasks[2].dependsOn).toEqual(["T2"]);
    expect(result.estimatedImprovements.find((item) => item.metric === "执行顺序正确率")?.improvement).toBe(60);
  });

  it("extracts missing information and context optimizations for long prompts", () => {
    const result = analyzePrompt(
      "我们准备发布一个面向大学生的学习工具，背景是用户经常不知道如何把课程资料整理成复习计划。请你分析需求、拆解功能、写出产品介绍和三条推广文案，还要注意语气年轻、不要夸大效果，输出结构清晰。"
    );

    expect(result.goal).toContain("学习工具");
    expect(result.contextOptimizations.some((item) => item.name === "目标前后锚定")).toBe(true);
    expect(result.estimatedImprovements.find((item) => item.metric === "上下文噪声控制")?.improvement).toBe(35);
  });

  it("expands vague creative build prompts into a concrete production plan", () => {
    const result = analyzePrompt("我想做个小汽车");

    expect(result.tasks).toHaveLength(6);
    expect(result.tasks.map((task) => task.title)).toEqual([
      "明确作品形态与目标体验",
      "拆解核心组成元素",
      "设计最小可行版本",
      "补充表现力与交互细节",
      "生成制作提示词或实现计划",
      "验收与迭代建议"
    ]);
    expect(result.tasks[1].description).toContain("小汽车");
    expect(result.optimizedPrompt).toContain("可视化原型或交互小作品");
  });
});
