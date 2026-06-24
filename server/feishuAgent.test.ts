import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AuthStore } from "./authStore";
import { handleFeishuAgentCommand, parseFeishuAgentCommand } from "./feishuAgent";

async function createStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prompt-feishu-"));
  const store = new AuthStore(path.join(dir, "app-data.json"));
  await store.init();
  return {
    store,
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}

describe("feishuAgent", () => {
  it("parses common natural language admin commands", () => {
    expect(parseFeishuAgentCommand("查看系统状态").action).toBe("system.status");
    expect(parseFeishuAgentCommand("列出最近5个用户")).toMatchObject({
      action: "user.list",
      limit: 5
    });
    expect(parseFeishuAgentCommand("禁用用户 test@example.com")).toMatchObject({
      action: "user.disable",
      email: "test@example.com"
    });
    expect(parseFeishuAgentCommand("把 test@example.com 设为管理员").action).toBe("user.promote");
    expect(parseFeishuAgentCommand("注册用户 张三 zhang@example.com 密码 abc123").action).toBe("user.register");
    expect(parseFeishuAgentCommand("替 zhang@example.com 分析提示词：帮我写一个短视频脚本")).toMatchObject({
      action: "prompt.analyze",
      email: "zhang@example.com",
      prompt: "帮我写一个短视频脚本"
    });
  });

  it("returns system status and user stats", async () => {
    const { store, cleanup } = await createStore();
    try {
      const status = await handleFeishuAgentCommand({ text: "查看系统状态" }, store);
      const stats = await handleFeishuAgentCommand({ text: "查看用户统计" }, store);

      expect(status.ok).toBe(true);
      expect(status.action).toBe("system.status");
      expect(status.reply).toContain("系统状态");
      expect(stats.reply).toContain("总用户");
    } finally {
      await cleanup();
    }
  });

  it("registers users from a feishu command", async () => {
    const { store, cleanup } = await createStore();
    try {
      const created = await handleFeishuAgentCommand(
        { text: "注册用户 张三 zhang@example.com 密码 abc123" },
        store
      );
      const login = await store.login({ email: "zhang@example.com", password: "abc123" });

      expect(created.ok).toBe(true);
      expect(created.action).toBe("user.register");
      expect(created.reply).toContain("已创建网页用户");
      expect(login.user.name).toBe("张三");
    } finally {
      await cleanup();
    }
  });

  it("lists and finds users", async () => {
    const { store, cleanup } = await createStore();
    try {
      await store.register({ name: "测试用户", email: "user@example.com", password: "user123" });

      const list = await handleFeishuAgentCommand({ text: "列出最近10个用户" }, store);
      const found = await handleFeishuAgentCommand({ text: "查找用户 user@example.com" }, store);

      expect(list.reply).toContain("user@example.com");
      expect(found.ok).toBe(true);
      expect(found.reply).toContain("测试用户");
    } finally {
      await cleanup();
    }
  });

  it("requires confirmation for write actions before updating a user", async () => {
    const { store, cleanup } = await createStore();
    try {
      await store.register({ name: "测试用户", email: "user@example.com", password: "user123" });

      const pending = await handleFeishuAgentCommand({ text: "禁用用户 user@example.com" }, store);
      expect(pending.ok).toBe(false);
      expect(pending.needsConfirmation).toBe(true);

      const executed = await handleFeishuAgentCommand(
        { text: "禁用用户 user@example.com", confirm: true },
        store
      );
      expect(executed.ok).toBe(true);

      const found = await handleFeishuAgentCommand({ text: "查找用户 user@example.com" }, store);
      expect(found.reply).toContain("状态：停用");
    } finally {
      await cleanup();
    }
  });

  it("runs prompt analysis for a registered user and records the usage", async () => {
    const { store, cleanup } = await createStore();
    try {
      await store.register({ name: "张三", email: "zhang@example.com", password: "abc123" });

      const result = await handleFeishuAgentCommand(
        { text: "替 zhang@example.com 分析提示词：帮我写一个短视频脚本" },
        store
      );
      const logs = await store.listAnalysisLogs();

      expect(result.ok).toBe(true);
      expect(result.action).toBe("prompt.analyze");
      expect(result.reply).toContain("元任务数");
      expect(logs).toHaveLength(1);
      expect(logs[0].userEmail).toBe("zhang@example.com");
    } finally {
      await cleanup();
    }
  });
});
