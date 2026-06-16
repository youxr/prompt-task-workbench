import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildBenchmarkReport, renderBenchmarkMarkdown } from "../src/lib/benchmark";

const docsDir = path.resolve("docs");
const report = buildBenchmarkReport("2026-06-02");

await mkdir(docsDir, { recursive: true });
await writeFile(path.join(docsDir, "benchmark-results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(path.join(docsDir, "benchmark-report.md"), renderBenchmarkMarkdown(report), "utf8");

console.log(
  `Generated benchmark report: ${report.summary.caseCount} cases, +${report.summary.averageDelta} average score delta.`
);
