import crypto from "node:crypto";
import os from "node:os";
import { analyzePrompt } from "../src/lib/analyzer";
import type { AuthStore, PublicUser } from "./authStore";

export type FeishuAgentAction =
  | "help"
  | "system.status"
  | "user.stats"
  | "user.list"
  | "user.find"
  | "user.register"
  | "user.enable"
  | "user.disable"
  | "user.promote"
  | "user.demote"
  | "prompt.analyze"
  | "analysis.logs"
  | "unknown";

export interface FeishuAgentCommandInput {
  text: string;
  operatorOpenId?: string;
  operatorName?: string;
  confirm?: boolean;
}

export interface FeishuAgentCommandResult {
  ok: boolean;
  action: FeishuAgentAction;
  reply: string;
  needsConfirmation?: boolean;
  data?: unknown;
}

interface ParsedCommand {
  action: FeishuAgentAction;
  email?: string;
  name?: string;
  password?: string;
  prompt?: string;
  limit: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

export async function handleFeishuAgentCommand(
  input: FeishuAgentCommandInput,
  store: AuthStore
): Promise<FeishuAgentCommandResult> {
  const authError = validateOperator(input.operatorOpenId);
  if (authError) {
    return authError;
  }

  const parsed = parseFeishuAgentCommand(input.text);

  switch (parsed.action) {
    case "help":
      return { ok: true, action: "help", reply: buildHelpText() };
    case "system.status":
      return buildSystemStatus(store);
    case "user.stats":
      return buildUserStats(store);
    case "user.list":
      return listUsers(store, parsed.limit);
    case "user.find":
      return findUser(store, parsed.email);
    case "user.register":
      return registerUserByCommand(store, parsed);
    case "user.disable":
    case "user.enable":
    case "user.promote":
    case "user.demote":
      return updateUserByCommand(store, parsed, Boolean(input.confirm));
    case "prompt.analyze":
      return analyzePromptByCommand(store, parsed);
    case "analysis.logs":
      return listAnalysisLogs(store, parsed.limit);
    default:
      return {
        ok: false,
        action: "unknown",
        reply: `我还不能理解这条指令：${input.text}\n\n${buildHelpText()}`
      };
  }
}

export function parseFeishuAgentCommand(text: string): ParsedCommand {
  const normalized = normalizeText(text);
  const email = extractEmail(normalized);
  const name = extractName(normalized, email);
  const password = extractPassword(normalized);
  const prompt = extractAnalysisPrompt(normalized);
  const limit = extractLimit(normalized);

  if (!normalized || /帮助|help|菜单|指令|用法/.test(normalized)) {
    return { action: "help", email, name, password, prompt, limit };
  }

  if (/注册|创建用户|新增用户|开通账号|开通用户|新建账号/.test(normalized) && email) {
    return { action: "user.register", email, name, password, prompt, limit };
  }

  if ((/分析提示词|分析一下|帮我分析|运行分析|使用系统|拆解任务|优化提示词/.test(normalized) && prompt) || /^分析[:：]/.test(normalized)) {
    return {
      action: "prompt.analyze",
      email,
      name,
      password,
      prompt: prompt || normalized.replace(/^分析[:：]\s*/, ""),
      limit
    };
  }

  if (/系统|服务|状态|健康|运行|机器|服务器/.test(normalized)) {
    return { action: "system.status", email, name, password, prompt, limit };
  }

  if (/统计|概览|仪表盘|总数/.test(normalized) && /用户|账号|分析|系统/.test(normalized)) {
    return { action: "user.stats", email, name, password, prompt, limit };
  }

  if (/日志|记录|分析记录|最近分析/.test(normalized)) {
    return { action: "analysis.logs", email, name, password, prompt, limit };
  }

  if (/禁用|停用|封禁|冻结/.test(normalized) && email) {
    return { action: "user.disable", email, name, password, prompt, limit };
  }

  if (/启用|恢复|解封|激活/.test(normalized) && email) {
    return { action: "user.enable", email, name, password, prompt, limit };
  }

  if (/设为管理员|设置管理员|升为管理员|给.*管理员|promote/i.test(normalized) && email) {
    return { action: "user.promote", email, name, password, prompt, limit };
  }

  if (/取消管理员|设为普通用户|降为用户|demote/i.test(normalized) && email) {
    return { action: "user.demote", email, name, password, prompt, limit };
  }

  if (/查找|搜索|查询|看看|查看/.test(normalized) && /用户|账号|邮箱/.test(normalized) && email) {
    return { action: "user.find", email, name, password, prompt, limit };
  }

  if (/列出|列表|所有用户|最近用户|用户列表|账号列表/.test(normalized)) {
    return { action: "user.list", email, name, password, prompt, limit };
  }

  if (email) {
    return { action: "user.find", email, name, password, prompt, limit };
  }

  return { action: "unknown", email, name, password, prompt, limit };
}

function validateOperator(operatorOpenId?: string): FeishuAgentCommandResult | null {
  const allowed = splitEnvList(process.env.FEISHU_ADMIN_OPEN_IDS);
  if (allowed.length === 0) {
    return null;
  }

  if (!operatorOpenId || !allowed.includes(operatorOpenId)) {
    return {
      ok: false,
      action: "unknown",
      reply: "你没有权限使用飞书管理智能体。请让系统管理员把你的 open_id 加到 FEISHU_ADMIN_OPEN_IDS。"
    };
  }

  return null;
}

function buildHelpText(): string {
  return [
    "可用指令：",
    "1. 查看系统状态",
    "2. 查看用户统计",
    "3. 列出最近10个用户",
    "4. 查找用户 user@example.com",
    "5. 注册用户 张三 user@example.com 密码 abc123",
    "6. 替 user@example.com 分析提示词：帮我写一个短视频脚本",
    "7. 禁用用户 user@example.com",
    "8. 启用用户 user@example.com",
    "9. 把 user@example.com 设为管理员",
    "10. 把 user@example.com 设为普通用户",
    "11. 查看最近10条分析记录",
    "",
    "禁用、启用、改角色等修改类指令需要在请求里传 confirm: true 才会真正执行。"
  ].join("\n");
}

async function buildSystemStatus(store: AuthStore): Promise<FeishuAgentCommandResult> {
  const stats = await store.getStats();
  const memory = process.memoryUsage();
  const data = {
    service: "online",
    nodeVersion: process.version,
    platform: `${os.type()} ${os.release()}`,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMB: Math.round(memory.rss / 1024 / 1024),
    serverTime: new Date().toISOString(),
    stats
  };

  return {
    ok: true,
    action: "system.status",
    data,
    reply: [
      "系统状态：online",
      `Node：${data.nodeVersion}`,
      `平台：${data.platform}`,
      `运行时长：${formatDuration(data.uptimeSeconds)}`,
      `内存占用：${data.memoryMB} MB`,
      `用户数：${stats.totalUsers}，活跃：${stats.activeUsers}，管理员：${stats.adminUsers}`,
      `分析次数：${stats.totalAnalyses}`
    ].join("\n")
  };
}

async function buildUserStats(store: AuthStore): Promise<FeishuAgentCommandResult> {
  const stats = await store.getStats();
  return {
    ok: true,
    action: "user.stats",
    data: stats,
    reply: [
      "用户统计：",
      `总用户：${stats.totalUsers}`,
      `活跃用户：${stats.activeUsers}`,
      `管理员：${stats.adminUsers}`,
      `分析次数：${stats.totalAnalyses}`,
      `最近分析：${stats.latestAnalysisAt || "暂无"}`
    ].join("\n")
  };
}

async function listUsers(store: AuthStore, limit: number): Promise<FeishuAgentCommandResult> {
  const users = (await store.listUsers()).slice(0, limit);
  return {
    ok: true,
    action: "user.list",
    data: users,
    reply: [`最近 ${users.length} 个用户：`, ...users.map(formatUserLine)].join("\n")
  };
}

async function findUser(store: AuthStore, email?: string): Promise<FeishuAgentCommandResult> {
  if (!email) {
    return missingEmail("user.find");
  }

  const user = await findUserByEmail(store, email);
  if (!user) {
    return {
      ok: false,
      action: "user.find",
      reply: `没有找到用户：${email}`
    };
  }

  return {
    ok: true,
    action: "user.find",
    data: user,
    reply: `找到用户：\n${formatUserDetail(user)}`
  };
}

async function registerUserByCommand(
  store: AuthStore,
  parsed: ParsedCommand
): Promise<FeishuAgentCommandResult> {
  if (!parsed.email) {
    return missingEmail("user.register");
  }

  const existing = await findUserByEmail(store, parsed.email);
  if (existing) {
    return {
      ok: false,
      action: "user.register",
      data: existing,
      reply: `用户已存在：\n${formatUserDetail(existing)}`
    };
  }

  const password = parsed.password || generatePassword();
  const userName = parsed.name || parsed.email.split("@")[0] || "飞书用户";
  const result = await store.register({
    name: userName,
    email: parsed.email,
    password
  });

  return {
    ok: true,
    action: "user.register",
    data: {
      user: result.user,
      loginUrl: getPublicAppUrl(),
      generatedPassword: parsed.password ? undefined : password
    },
    reply: [
      "已创建网页用户：",
      formatUserDetail(result.user),
      `登录地址：${getPublicAppUrl()}`,
      `初始密码：${password}`,
      "请提醒用户登录后尽快自行更换密码。"
    ].join("\n")
  };
}

async function updateUserByCommand(
  store: AuthStore,
  parsed: ParsedCommand,
  confirmed: boolean
): Promise<FeishuAgentCommandResult> {
  if (!parsed.email) {
    return missingEmail(parsed.action);
  }

  const user = await findUserByEmail(store, parsed.email);
  if (!user) {
    return {
      ok: false,
      action: parsed.action,
      reply: `没有找到用户：${parsed.email}`
    };
  }

  if (!confirmed) {
    return {
      ok: false,
      action: parsed.action,
      needsConfirmation: true,
      data: { target: user },
      reply: `这是一条修改类指令，需要二次确认。\n目标用户：${formatUserLine(user)}\n确认执行请再次请求并传 confirm: true。`
    };
  }

  const patch = getUserPatch(parsed.action);
  const updated = await store.updateUser(user.id, patch);
  return {
    ok: true,
    action: parsed.action,
    data: updated,
    reply: `已执行：${describeAction(parsed.action)}\n${formatUserDetail(updated)}`
  };
}

async function analyzePromptByCommand(
  store: AuthStore,
  parsed: ParsedCommand
): Promise<FeishuAgentCommandResult> {
  const prompt = parsed.prompt?.trim();
  if (!prompt) {
    return {
      ok: false,
      action: "prompt.analyze",
      reply: "请带上要分析的提示词，例如：替 user@example.com 分析提示词：帮我做一个小汽车"
    };
  }

  const user = parsed.email ? await findUserByEmail(store, parsed.email) : null;
  if (parsed.email && !user) {
    return {
      ok: false,
      action: "prompt.analyze",
      reply: `没有找到用户：${parsed.email}`
    };
  }

  const result = analyzePrompt(prompt, {
    mode: "local",
    granularity: "balanced",
    preferDependencyOrder: true,
    includeContextEngineering: true
  });
  await store.logAnalysis({ user: user || null, prompt, result });

  return {
    ok: true,
    action: "prompt.analyze",
    data: {
      user,
      goal: result.goal,
      taskCount: result.tasks.length,
      tasks: result.tasks.slice(0, 6),
      optimizedPrompt: result.optimizedPrompt
    },
    reply: [
      user ? `已为 ${user.email} 完成提示词分析。` : "已完成匿名提示词分析。",
      `目标：${result.goal}`,
      `元任务数：${result.tasks.length}`,
      "任务序列：",
      ...result.tasks.slice(0, 6).map((task) => `- ${task.id} ${task.title}（${task.importance}/100）`),
      `网页地址：${getPublicAppUrl()}`
    ].join("\n")
  };
}

async function listAnalysisLogs(store: AuthStore, limit: number): Promise<FeishuAgentCommandResult> {
  const logs = (await store.listAnalysisLogs()).slice(0, limit);
  return {
    ok: true,
    action: "analysis.logs",
    data: logs,
    reply:
      logs.length === 0
        ? "暂无分析记录。"
        : [
            `最近 ${logs.length} 条分析记录：`,
            ...logs.map((log) => `- ${log.userEmail}：${log.taskCount} 个任务，${log.source}，${log.createdAt}`)
          ].join("\n")
  };
}

function getUserPatch(action: FeishuAgentAction): Partial<Pick<PublicUser, "role" | "active">> {
  switch (action) {
    case "user.disable":
      return { active: false };
    case "user.enable":
      return { active: true };
    case "user.promote":
      return { role: "admin" };
    case "user.demote":
      return { role: "user" };
    default:
      return {};
  }
}

function describeAction(action: FeishuAgentAction): string {
  const labels: Partial<Record<FeishuAgentAction, string>> = {
    "user.disable": "禁用用户",
    "user.enable": "启用用户",
    "user.promote": "设为管理员",
    "user.demote": "设为普通用户"
  };
  return labels[action] || action;
}

async function findUserByEmail(store: AuthStore, email: string): Promise<PublicUser | undefined> {
  const normalized = email.toLowerCase();
  return (await store.listUsers()).find((user) => user.email.toLowerCase() === normalized);
}

function missingEmail(action: FeishuAgentAction): FeishuAgentCommandResult {
  return {
    ok: false,
    action,
    reply: "这条指令需要带上用户邮箱，例如：禁用用户 user@example.com"
  };
}

function formatUserLine(user: PublicUser): string {
  return `- ${user.email} | ${user.name} | ${user.role} | ${user.active ? "启用" : "停用"}`;
}

function formatUserDetail(user: PublicUser): string {
  return [
    `邮箱：${user.email}`,
    `姓名：${user.name}`,
    `角色：${user.role}`,
    `状态：${user.active ? "启用" : "停用"}`,
    `创建时间：${user.createdAt}`,
    `最近登录：${user.lastLoginAt || "暂无"}`
  ].join("\n");
}

function normalizeText(text: string): string {
  return String(text || "").trim();
}

function extractEmail(text: string): string | undefined {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0].toLowerCase();
}

function extractName(text: string, email?: string): string | undefined {
  const explicit = text.match(/(?:姓名|名字|用户|叫)[:：\s]*([^\s,，。]+)/)?.[1];
  if (explicit && !explicit.includes("@") && !/密码|口令/.test(explicit)) {
    return explicit;
  }

  if (!email) {
    return undefined;
  }

  const beforeEmail = text.slice(0, text.indexOf(email)).replace(/注册|创建用户|新增用户|开通账号|开通用户|新建账号/g, "");
  const candidate = beforeEmail
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .at(-1);
  return candidate && !/用户|账号|邮箱/.test(candidate) ? candidate : undefined;
}

function extractPassword(text: string): string | undefined {
  return text.match(/(?:密码|password|口令)[:：\s]*([A-Za-z0-9_@#$%^&*.-]{6,32})/i)?.[1];
}

function extractAnalysisPrompt(text: string): string | undefined {
  const markerMatch = text.match(/(?:分析提示词|提示词|prompt|分析一下|帮我分析|运行分析|拆解任务|优化提示词)[:：]\s*(.+)$/i);
  if (markerMatch?.[1]) {
    return markerMatch[1].trim();
  }

  const looseMatch = text.match(/(?:分析提示词|替\s*\S+\s*分析提示词|帮我分析|运行分析|拆解任务|优化提示词)\s+(.+)$/i);
  if (looseMatch?.[1]) {
    return looseMatch[1].trim();
  }

  return undefined;
}

function extractLimit(text: string): number {
  const match = text.match(/(?:最近|前|列出)?\s*(\d{1,2})\s*(?:个|条|位)?/);
  if (!match) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(Number(match[1]), MAX_LIMIT));
}

function splitEnvList(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return `${days}天${hours}小时`;
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`;
  }
  return `${minutes}分钟`;
}

function generatePassword(): string {
  return `pw-${crypto.randomBytes(5).toString("hex")}`;
}

function getPublicAppUrl(): string {
  return process.env.PUBLIC_APP_URL || process.env.PUBLIC_ORIGIN || "http://101.132.44.51";
}
