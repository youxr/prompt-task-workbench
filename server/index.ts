import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePrompt } from "../src/lib/analyzer";
import type { AnalysisResult, PromptAnalysisOptions } from "../src/lib/types";
import { AuthError, AuthStore, type PublicUser } from "./authStore";
import { replyToFeishuMessage } from "./feishuClient";
import { handleFeishuAgentCommand } from "./feishuAgent";

const app = express();
const port = Number(process.env.PORT || 8787);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const authStore = new AuthStore(process.env.AUTH_DATA_FILE || path.join(projectRoot, "data", "app-data.json"));

app.use((request, response, next) => {
  const allowedOrigin = process.env.PUBLIC_ORIGIN || request.headers.origin || "*";
  response.header("Access-Control-Allow-Origin", allowedOrigin);
  response.header("Vary", "Origin");
  response.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.header("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json({ limit: "1mb" }));

await authStore.init();

app.post("/api/auth/register", async (request, response) => {
  try {
    const result = await authStore.register({
      name: String(request.body?.name || ""),
      email: String(request.body?.email || ""),
      password: String(request.body?.password || "")
    });
    response.status(201).json(result);
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/auth/login", async (request, response) => {
  try {
    const result = await authStore.login({
      email: String(request.body?.email || ""),
      password: String(request.body?.password || "")
    });
    response.json(result);
  } catch (error) {
    sendError(response, error);
  }
});

app.get("/api/auth/me", async (request, response) => {
  const user = await getRequestUser(request);
  if (!user) {
    response.status(401).json({ message: "未登录" });
    return;
  }
  response.json({ user });
});

app.post("/api/auth/logout", async (request, response) => {
  await authStore.logout(getBearerToken(request));
  response.json({ ok: true });
});

app.get("/api/admin/users", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) return;
  response.json({ users: await authStore.listUsers() });
});

app.patch("/api/admin/users/:id", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) return;

  try {
    const updated = await authStore.updateUser(request.params.id, {
      name: typeof request.body?.name === "string" ? request.body.name : undefined,
      role: request.body?.role === "admin" || request.body?.role === "user" ? request.body.role : undefined,
      active: typeof request.body?.active === "boolean" ? request.body.active : undefined
    });
    response.json({ user: updated });
  } catch (error) {
    sendError(response, error);
  }
});

app.delete("/api/admin/users/:id", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) return;

  try {
    await authStore.deleteUser(request.params.id);
    response.json({ ok: true });
  } catch (error) {
    sendError(response, error);
  }
});

app.get("/api/admin/stats", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) return;
  response.json({ stats: await authStore.getStats() });
});

app.get("/api/admin/analysis-logs", async (request, response) => {
  const user = await requireAdmin(request, response);
  if (!user) return;
  response.json({ logs: await authStore.listAnalysisLogs() });
});

app.post("/api/feishu/command", async (request, response) => {
  if (!isValidFeishuAgentSecret(request)) {
    response.status(401).json({ ok: false, message: "Invalid feishu agent secret" });
    return;
  }

  try {
    const result = await handleFeishuAgentCommand(
      {
        text: String(request.body?.text || request.body?.message || ""),
        operatorOpenId: typeof request.body?.operatorOpenId === "string" ? request.body.operatorOpenId : undefined,
        operatorName: typeof request.body?.operatorName === "string" ? request.body.operatorName : undefined,
        confirm: request.body?.confirm === true
      },
      authStore
    );
    response.status(result.ok ? 200 : result.needsConfirmation ? 409 : 400).json(result);
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/feishu/events", async (request, response) => {
  if (request.body?.type === "url_verification" && typeof request.body?.challenge === "string") {
    response.json({ challenge: request.body.challenge });
    return;
  }

  if (!isValidFeishuVerificationToken(request)) {
    response.status(401).json({ ok: false, message: "Invalid feishu verification token" });
    return;
  }

  const text = extractFeishuEventText(request.body);
  const operatorOpenId = extractFeishuOpenId(request.body);
  const messageId = extractFeishuMessageId(request.body);

  if (!text) {
    response.json({ ok: true, message: "ignored unsupported feishu event" });
    return;
  }

  try {
    const result = await handleFeishuAgentCommand({ text, operatorOpenId }, authStore);
    const feishuReply = messageId
      ? await replyToFeishuMessage(messageId, result.reply)
      : { sent: false, reason: "Missing message_id" };
    response.json({
      ok: true,
      action: result.action,
      reply: result.reply,
      data: result.data,
      feishuReply
    });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/analyze", async (request, response) => {
  const prompt = String(request.body?.prompt || "");
  const options = request.body?.options as Partial<PromptAnalysisOptions> | undefined;
  const user = await getRequestUser(request);

  if (!user) {
    response.status(401).json({ message: "请先登录后再使用分析功能" });
    return;
  }

  const localResult = analyzePrompt(prompt, options);

  if (!prompt.trim()) {
    response.json(localResult);
    return;
  }

  if (options?.mode === "local") {
    await authStore.logAnalysis({ user, prompt, result: localResult });
    response.json(localResult);
    return;
  }

  try {
    const llmResult = await analyzeWithLlm(prompt, options, localResult);
    await authStore.logAnalysis({ user, prompt, result: llmResult });
    response.json(llmResult);
  } catch (error) {
    const fallbackResult: AnalysisResult = {
      ...localResult,
      source: "hybrid-fallback",
      assumptions: [
        ...localResult.assumptions,
        `LLM 增强不可用，已降级到本地规则：${error instanceof Error ? error.message : "未知错误"}`
      ]
    };
    await authStore.logAnalysis({ user, prompt, result: fallbackResult });
    response.json(fallbackResult);
  }
});

app.use(express.static(distDir));

app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Prompt optimizer API listening on http://127.0.0.1:${port}`);
});

async function analyzeWithLlm(
  prompt: string,
  options: Partial<PromptAnalysisOptions> | undefined,
  localResult: AnalysisResult
): Promise<AnalysisResult> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.AI_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    throw new Error("未配置 AI_API_KEY");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "你是提示词任务拆解与上下文工程优化专家。只返回严格 JSON，不要 Markdown，不要解释。JSON 必须兼容用户提供的 schema。"
        },
        {
          role: "user",
          content: JSON.stringify({
            instruction:
              "基于原始提示词生成 AnalysisResult。可以参考 localResult，但要改进任务拆解、依赖、重要度和优化提示词。source 必须为 llm。",
            prompt,
            options,
            schema: {
              goal: "string",
              tasks:
                "AtomicTask[]: id,title,description,dependsOn,importance,order,rationale,contextHints",
              optimizedPrompt: "string",
              contextOptimizations: "ContextOptimization[]",
              estimatedImprovements: "EstimatedImprovement[]",
              missingInformation: "string[]",
              assumptions: "string[]",
              source: "llm"
            },
            localResult
          })
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`LLM API 返回 ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("LLM 返回为空");
  }

  const parsed = JSON.parse(content) as AnalysisResult;

  if (!isValidAnalysisResult(parsed)) {
    throw new Error("LLM JSON 结构不合法");
  }

  return {
    ...parsed,
    source: "llm"
  };
}

function isValidAnalysisResult(result: AnalysisResult): boolean {
  return Boolean(
    result &&
      typeof result.goal === "string" &&
      Array.isArray(result.tasks) &&
      typeof result.optimizedPrompt === "string" &&
      Array.isArray(result.contextOptimizations) &&
      Array.isArray(result.estimatedImprovements)
  );
}

async function getRequestUser(request: express.Request): Promise<PublicUser | null> {
  return authStore.getUserByToken(getBearerToken(request));
}

async function requireAdmin(
  request: express.Request,
  response: express.Response
): Promise<PublicUser | null> {
  const user = await getRequestUser(request);
  if (!user) {
    response.status(401).json({ message: "未登录" });
    return null;
  }

  if (user.role !== "admin") {
    response.status(403).json({ message: "需要管理员权限" });
    return null;
  }

  return user;
}

function getBearerToken(request: express.Request): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }
  return header.slice("Bearer ".length).trim();
}

function isValidFeishuAgentSecret(request: express.Request): boolean {
  const expected = process.env.FEISHU_AGENT_SECRET;
  if (!expected) {
    return true;
  }

  return request.header("x-feishu-agent-secret") === expected;
}

function isValidFeishuVerificationToken(request: express.Request): boolean {
  const expected = process.env.FEISHU_VERIFICATION_TOKEN;
  if (!expected) {
    return true;
  }

  return request.body?.token === expected || request.header("x-feishu-verification-token") === expected;
}

function extractFeishuEventText(payload: unknown): string {
  const body = payload as {
    event?: {
      message?: {
        content?: string;
      };
    };
  };
  const content = body.event?.message?.content;
  if (!content) {
    return "";
  }

  try {
    const parsed = JSON.parse(content) as { text?: string };
    return parsed.text || "";
  } catch {
    return content;
  }
}

function extractFeishuOpenId(payload: unknown): string | undefined {
  const body = payload as {
    event?: {
      sender?: {
        sender_id?: {
          open_id?: string;
        };
      };
    };
  };
  return body.event?.sender?.sender_id?.open_id;
}

function extractFeishuMessageId(payload: unknown): string | undefined {
  const body = payload as {
    event?: {
      message?: {
        message_id?: string;
      };
    };
  };
  return body.event?.message?.message_id;
}

function sendError(response: express.Response, error: unknown): void {
  if (error instanceof AuthError) {
    response.status(error.status).json({ message: error.message });
    return;
  }

  response.status(500).json({ message: error instanceof Error ? error.message : "服务器错误" });
}
