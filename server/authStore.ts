import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { AnalysisResult } from "../src/lib/types";

export type UserRole = "user" | "admin";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AnalysisLog {
  id: string;
  userId: string | null;
  userEmail: string;
  promptPreview: string;
  source: AnalysisResult["source"];
  taskCount: number;
  createdAt: string;
}

interface StoredUser extends PublicUser {
  passwordHash: string;
  passwordSalt: string;
}

interface Session {
  token: string;
  userId: string;
  createdAt: string;
}

interface AppData {
  users: StoredUser[];
  sessions: Session[];
  analysisLogs: AnalysisLog[];
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  totalAnalyses: number;
  anonymousAnalyses: number;
  latestAnalysisAt: string | null;
}

const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";

export class AuthStore {
  constructor(private readonly filePath: string) {}

  async init(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const data = await this.readData();
    if (data.users.length === 0) {
      const admin = this.createStoredUser({
        name: "系统管理员",
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
        role: "admin"
      });
      await this.writeData({ ...data, users: [admin] });
    }
  }

  async register(input: { name: string; email: string; password: string }): Promise<{ user: PublicUser; token: string }> {
    const name = input.name.trim();
    const email = normalizeEmail(input.email);
    validateCredentials(name, email, input.password);

    const data = await this.readData();
    if (data.users.some((user) => user.email === email)) {
      throw new AuthError(409, "该邮箱已注册");
    }

    const user = this.createStoredUser({ name, email, password: input.password, role: "user" });
    const session = this.createSession(user.id);
    await this.writeData({
      ...data,
      users: [...data.users, user],
      sessions: [...data.sessions, session]
    });

    return { user: toPublicUser(user), token: session.token };
  }

  async login(input: { email: string; password: string }): Promise<{ user: PublicUser; token: string }> {
    const email = normalizeEmail(input.email);
    const data = await this.readData();
    const user = data.users.find((item) => item.email === email);

    if (!user || !verifyPassword(input.password, user.passwordSalt, user.passwordHash)) {
      throw new AuthError(401, "邮箱或密码不正确");
    }

    if (!user.active) {
      throw new AuthError(403, "该账号已被停用");
    }

    const session = this.createSession(user.id);
    const updatedUser = { ...user, lastLoginAt: nowIso() };
    await this.writeData({
      ...data,
      users: data.users.map((item) => (item.id === user.id ? updatedUser : item)),
      sessions: [...data.sessions.filter((item) => item.userId !== user.id), session]
    });

    return { user: toPublicUser(updatedUser), token: session.token };
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const data = await this.readData();
    await this.writeData({ ...data, sessions: data.sessions.filter((session) => session.token !== token) });
  }

  async getUserByToken(token: string | undefined): Promise<PublicUser | null> {
    if (!token) return null;
    const data = await this.readData();
    const session = data.sessions.find((item) => item.token === token);
    if (!session) return null;
    const user = data.users.find((item) => item.id === session.userId);
    if (!user || !user.active) return null;
    return toPublicUser(user);
  }

  async listUsers(): Promise<PublicUser[]> {
    const data = await this.readData();
    return data.users.map(toPublicUser);
  }

  async updateUser(
    id: string,
    patch: Partial<Pick<PublicUser, "name" | "role" | "active">>
  ): Promise<PublicUser> {
    const data = await this.readData();
    const user = data.users.find((item) => item.id === id);
    if (!user) {
      throw new AuthError(404, "用户不存在");
    }

    if (patch.role && patch.role !== "admin" && user.role === "admin" && countActiveAdmins(data.users) <= 1) {
      throw new AuthError(400, "至少需要保留一个可用管理员");
    }

    if (patch.active === false && user.role === "admin" && countActiveAdmins(data.users) <= 1) {
      throw new AuthError(400, "不能停用最后一个管理员");
    }

    const updated: StoredUser = {
      ...user,
      name: typeof patch.name === "string" && patch.name.trim() ? patch.name.trim() : user.name,
      role: patch.role || user.role,
      active: typeof patch.active === "boolean" ? patch.active : user.active
    };
    await this.writeData({ ...data, users: data.users.map((item) => (item.id === id ? updated : item)) });
    return toPublicUser(updated);
  }

  async deleteUser(id: string): Promise<void> {
    const data = await this.readData();
    const user = data.users.find((item) => item.id === id);
    if (!user) {
      throw new AuthError(404, "用户不存在");
    }

    if (user.role === "admin" && countActiveAdmins(data.users) <= 1) {
      throw new AuthError(400, "不能删除最后一个管理员");
    }

    await this.writeData({
      ...data,
      users: data.users.filter((item) => item.id !== id),
      sessions: data.sessions.filter((session) => session.userId !== id)
    });
  }

  async logAnalysis(input: {
    user: PublicUser | null;
    prompt: string;
    result: AnalysisResult;
  }): Promise<AnalysisLog> {
    const data = await this.readData();
    const log: AnalysisLog = {
      id: randomId(),
      userId: input.user?.id || null,
      userEmail: input.user?.email || "anonymous",
      promptPreview: input.prompt.trim().slice(0, 120),
      source: input.result.source,
      taskCount: input.result.tasks.length,
      createdAt: nowIso()
    };
    await this.writeData({ ...data, analysisLogs: [log, ...data.analysisLogs].slice(0, 200) });
    return log;
  }

  async listAnalysisLogs(): Promise<AnalysisLog[]> {
    const data = await this.readData();
    return data.analysisLogs;
  }

  async getStats(): Promise<AdminStats> {
    const data = await this.readData();
    return {
      totalUsers: data.users.length,
      activeUsers: data.users.filter((user) => user.active).length,
      adminUsers: data.users.filter((user) => user.role === "admin").length,
      totalAnalyses: data.analysisLogs.length,
      anonymousAnalyses: data.analysisLogs.filter((log) => !log.userId).length,
      latestAnalysisAt: data.analysisLogs[0]?.createdAt || null
    };
  }

  private createStoredUser(input: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }): StoredUser {
    const salt = crypto.randomBytes(16).toString("hex");
    return {
      id: randomId(),
      name: input.name,
      email: input.email,
      role: input.role,
      active: true,
      createdAt: nowIso(),
      passwordSalt: salt,
      passwordHash: hashPassword(input.password, salt)
    };
  }

  private createSession(userId: string): Session {
    return {
      token: crypto.randomBytes(32).toString("hex"),
      userId,
      createdAt: nowIso()
    };
  }

  private async readData(): Promise<AppData> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppData>;
      return {
        users: parsed.users || [],
        sessions: parsed.sessions || [],
        analysisLogs: parsed.analysisLogs || []
      };
    } catch {
      return { users: [], sessions: [], analysisLogs: [] };
    }
  }

  private async writeData(data: AppData): Promise<void> {
    await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
}

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

function validateCredentials(name: string, email: string, password: string): void {
  if (name.length < 2) {
    throw new AuthError(400, "用户名至少需要 2 个字符");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError(400, "邮箱格式不正确");
  }

  if (password.length < 6) {
    throw new AuthError(400, "密码至少需要 6 个字符");
  }
}

function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 100_000, 32, "sha256").toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actualHash = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function countActiveAdmins(users: StoredUser[]): number {
  return users.filter((user) => user.role === "admin" && user.active).length;
}

function randomId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}
