import { describe, expect, it } from "vitest";
import { analyzePrompt } from "./analyzer";
import { buildWorkspaceBlueprint } from "./workspace";

describe("buildWorkspaceBlueprint", () => {
  it("turns an analysis result into an execution workspace", () => {
    const analysis = analyzePrompt("帮我做一个电商网站，包括商品页、购物车、订单和后台管理");
    const workspace = buildWorkspaceBlueprint(analysis);

    expect(workspace.stages.length).toBeGreaterThanOrEqual(3);
    expect(workspace.roles).toHaveLength(4);
    expect(workspace.contextPacks).toHaveLength(5);
    expect(workspace.qualityGates).toHaveLength(4);
    expect(workspace.executionContract.contractPrompt).toContain("AI 任务执行合约");
    expect(workspace.executionContract.readinessScore).toBeGreaterThan(70);
  });

  it("raises risk level for payment launch prompts", () => {
    const analysis = analyzePrompt("帮我规划一个支付功能上线方案，要考虑安全、订单状态、失败重试、测试和部署回滚");
    const workspace = buildWorkspaceBlueprint(analysis);

    expect(workspace.risks.some((risk) => risk.level === "高")).toBe(true);
    expect(workspace.executionContract.contractPrompt).toContain("Go/No-Go");
  });
});
