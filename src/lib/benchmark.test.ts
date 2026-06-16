import { describe, expect, it } from "vitest";
import { BENCHMARK_CASES, buildBenchmarkReport, renderBenchmarkMarkdown } from "./benchmark";

describe("benchmark report", () => {
  it("evaluates every benchmark case against the baseline", () => {
    const report = buildBenchmarkReport();

    expect(report.cases).toHaveLength(BENCHMARK_CASES.length);
    expect(report.summary.caseCount).toBe(6);
    expect(report.summary.averageOptimized).toBeGreaterThan(report.summary.averageBaseline);
    expect(report.summary.averageDelta).toBeGreaterThanOrEqual(35);
  });

  it("keeps per-case optimized scores above baseline scores", () => {
    const report = buildBenchmarkReport();

    report.cases.forEach((testCase) => {
      expect(testCase.averageOptimized).toBeGreaterThan(testCase.averageBaseline);
      expect(testCase.taskTitles.length).toBeGreaterThan(0);
      expect(testCase.metricResults.every((metric) => metric.optimized > metric.baseline)).toBe(true);
    });
  });

  it("renders a markdown report with summary, cases and limitations", () => {
    const markdown = renderBenchmarkMarkdown(buildBenchmarkReport());

    expect(markdown).toContain("Baseline 对比测试报告");
    expect(markdown).toContain("我们做了什么");
    expect(markdown).toContain("局限");
  });
});
