import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AuthStore } from "./authStore";
import { analyzePrompt } from "../src/lib/analyzer";

async function createStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prompt-auth-"));
  const store = new AuthStore(path.join(dir, "app-data.json"));
  await store.init();
  return {
    store,
    cleanup: () => rm(dir, { recursive: true, force: true })
  };
}

describe("AuthStore", () => {
  it("creates a default admin and supports login", async () => {
    const { store, cleanup } = await createStore();
    try {
      const result = await store.login({ email: "admin@example.com", password: "admin123456" });

      expect(result.user.role).toBe("admin");
      expect(result.token.length).toBeGreaterThan(20);
      await expect(store.getUserByToken(result.token)).resolves.toMatchObject({
        email: "admin@example.com"
      });
    } finally {
      await cleanup();
    }
  });

  it("registers normal users and prevents duplicate emails", async () => {
    const { store, cleanup } = await createStore();
    try {
      const result = await store.register({
        name: "测试用户",
        email: "user@example.com",
        password: "user123"
      });

      expect(result.user.role).toBe("user");
      await expect(
        store.register({ name: "另一个用户", email: "USER@example.com", password: "user123" })
      ).rejects.toThrow("该邮箱已注册");
    } finally {
      await cleanup();
    }
  });

  it("protects the last admin account", async () => {
    const { store, cleanup } = await createStore();
    try {
      const admin = (await store.listUsers()).find((user) => user.role === "admin");
      expect(admin).toBeDefined();

      await expect(store.updateUser(admin!.id, { active: false })).rejects.toThrow("不能停用最后一个管理员");
      await expect(store.deleteUser(admin!.id)).rejects.toThrow("不能删除最后一个管理员");
    } finally {
      await cleanup();
    }
  });

  it("records analysis logs and stats", async () => {
    const { store, cleanup } = await createStore();
    try {
      const login = await store.login({ email: "admin@example.com", password: "admin123456" });
      const result = analyzePrompt("先分析竞品，再设计功能，然后写推广文案");
      await store.logAnalysis({
        user: login.user,
        prompt: "先分析竞品，再设计功能，然后写推广文案",
        result
      });

      const stats = await store.getStats();
      const logs = await store.listAnalysisLogs();
      expect(stats.totalAnalyses).toBe(1);
      expect(logs[0].userEmail).toBe("admin@example.com");
      expect(logs[0].taskCount).toBe(3);
    } finally {
      await cleanup();
    }
  });
});
