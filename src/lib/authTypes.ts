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

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  totalAnalyses: number;
  anonymousAnalyses: number;
  latestAnalysisAt: string | null;
}

export interface AnalysisLog {
  id: string;
  userId: string | null;
  userEmail: string;
  promptPreview: string;
  source: "local" | "llm" | "hybrid-fallback";
  taskCount: number;
  createdAt: string;
}
