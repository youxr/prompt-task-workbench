import { useEffect, useMemo, useState, type FormEvent } from "react";
import "./App.css";
import { analyzePrompt, getSamplePrompts } from "./lib/analyzer";
import { buildBenchmarkReport } from "./lib/benchmark";
import { buildWorkspaceBlueprint } from "./lib/workspace";
import type { AdminStats, AnalysisLog, PublicUser } from "./lib/authTypes";
import type { AnalysisMode, AnalysisResult, Granularity, PromptAnalysisOptions } from "./lib/types";

const DEFAULT_PROMPT = "帮我做一个电商网站，包括商品页、购物车、订单和后台管理";
const TOKEN_STORAGE_KEY = "prompt-workbench-token";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function App() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [mode, setMode] = useState<AnalysisMode>("hybrid");
  const [granularity, setGranularity] = useState<Granularity>("balanced");
  const [preferDependencyOrder, setPreferDependencyOrder] = useState(true);
  const [includeContextEngineering, setIncludeContextEngineering] = useState(true);
  const [analysis, setAnalysis] = useState<AnalysisResult>(() =>
    analyzePrompt(DEFAULT_PROMPT, {
      mode: "hybrid",
      granularity: "balanced",
      preferDependencyOrder: true,
      includeContextEngineering: true
    })
  );
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("已使用本地规则生成初始分析。");
  const [copied, setCopied] = useState(false);
  const [contractCopied, setContractCopied] = useState(false);
  const [authToken, setAuthToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || "");
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "admin@example.com",
    password: "admin123456"
  });
  const [authMessage, setAuthMessage] = useState("默认管理员：admin@example.com / admin123456");
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [adminUsers, setAdminUsers] = useState<PublicUser[]>([]);
  const [analysisLogs, setAnalysisLogs] = useState<AnalysisLog[]>([]);
  const benchmarkReport = useMemo(() => buildBenchmarkReport(), []);

  const options: PromptAnalysisOptions = useMemo(
    () => ({
      mode,
      granularity,
      preferDependencyOrder,
      includeContextEngineering
    }),
    [granularity, includeContextEngineering, mode, preferDependencyOrder]
  );

  async function handleAnalyze() {
    if (!currentUser) {
      setStatus("请先登录后再使用 AI 任务编排工作台。");
      return;
    }

    if (!prompt.trim()) {
      setAnalysis(analyzePrompt("", options));
      setStatus("请输入提示词后再分析。");
      return;
    }

    setIsLoading(true);
    setStatus("正在分析提示词结构...");

    try {
      const response = await fetch(apiUrl("/api/analyze"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders()
        },
        body: JSON.stringify({ prompt, options })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message || `API 返回 ${response.status}`);
      }

      const result = (await response.json()) as AnalysisResult;
      setAnalysis(result);
      setStatus(
        result.source === "llm"
          ? "已完成 LLM 增强分析。"
          : "LLM 未配置或返回异常，已自动降级为本地分析。"
      );
    } catch (error) {
      setStatus(`分析失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(analysis.optimizedPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function loadSample(samplePrompt: string) {
    setPrompt(samplePrompt);
    const result = analyzePrompt(samplePrompt, options);
    setAnalysis(result);
    setStatus("已载入测试用例并完成本地预览。");
  }

  const averageImprovement =
    analysis.estimatedImprovements.length > 0
      ? Math.round(
          analysis.estimatedImprovements.reduce((sum, item) => sum + item.improvement, 0) /
            analysis.estimatedImprovements.length
        )
      : 0;
  const workspace = useMemo(() => buildWorkspaceBlueprint(analysis), [analysis]);

  useEffect(() => {
    if (!authToken) {
      setCurrentUser(null);
      return;
    }

    void loadCurrentUser(authToken);
  }, [authToken]);

  useEffect(() => {
    if (currentUser?.role === "admin") {
      void loadAdminData(authToken);
    }
  }, [authToken, currentUser]);

  async function handleCopyContract() {
    await navigator.clipboard.writeText(workspace.executionContract.contractPrompt);
    setContractCopied(true);
    window.setTimeout(() => setContractCopied(false), 1400);
  }

  async function loadCurrentUser(token: string) {
    try {
      const response = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error("登录已过期");
      }

      const payload = (await response.json()) as { user: PublicUser };
      setCurrentUser(payload.user);
      setAuthMessage(`已登录：${payload.user.name}`);
    } catch {
      setAuthToken("");
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      setCurrentUser(null);
      setAuthMessage("登录状态已失效，请重新登录。");
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    setAuthMessage(authMode === "login" ? "正在登录..." : "正在注册...");

    try {
      const response = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm)
      });
      const payload = (await response.json()) as { user?: PublicUser; token?: string; message?: string };

      if (!response.ok || !payload.user || !payload.token) {
        throw new Error(payload.message || "认证失败");
      }

      localStorage.setItem(TOKEN_STORAGE_KEY, payload.token);
      setAuthToken(payload.token);
      setCurrentUser(payload.user);
      setAuthMessage(`${authMode === "login" ? "登录" : "注册"}成功：${payload.user.name}`);
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "认证失败");
    }
  }

  async function handleLogout() {
    if (authToken) {
      await fetch(apiUrl("/api/auth/logout"), {
        method: "POST",
        headers: authHeaders()
      });
    }

    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setAuthToken("");
    setCurrentUser(null);
    setAdminStats(null);
    setAdminUsers([]);
    setAnalysisLogs([]);
    setAuthMessage("已退出登录。");
  }

  async function loadAdminData(token = authToken) {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [statsResponse, usersResponse, logsResponse] = await Promise.all([
      fetch(apiUrl("/api/admin/stats"), { headers }),
      fetch(apiUrl("/api/admin/users"), { headers }),
      fetch(apiUrl("/api/admin/analysis-logs"), { headers })
    ]);

    if (!statsResponse.ok || !usersResponse.ok || !logsResponse.ok) {
      setAuthMessage("管理员数据加载失败，请确认权限。");
      return;
    }

    const statsPayload = (await statsResponse.json()) as { stats: AdminStats };
    const usersPayload = (await usersResponse.json()) as { users: PublicUser[] };
    const logsPayload = (await logsResponse.json()) as { logs: AnalysisLog[] };
    setAdminStats(statsPayload.stats);
    setAdminUsers(usersPayload.users);
    setAnalysisLogs(logsPayload.logs);
  }

  async function updateUser(userId: string, patch: Partial<Pick<PublicUser, "role" | "active">>) {
    const response = await fetch(apiUrl(`/api/admin/users/${userId}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders()
      },
      body: JSON.stringify(patch)
    });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      setAuthMessage(payload.message || "用户更新失败");
      return;
    }

    await loadAdminData();
  }

  async function deleteUser(userId: string) {
    const response = await fetch(apiUrl(`/api/admin/users/${userId}`), {
      method: "DELETE",
      headers: authHeaders()
    });

    if (!response.ok) {
      const payload = (await response.json()) as { message?: string };
      setAuthMessage(payload.message || "用户删除失败");
      return;
    }

    await loadAdminData();
  }

  function authHeaders(): Record<string, string> {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  }

  function apiUrl(path: string): string {
    return `${API_BASE_URL}${path}`;
  }

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Prompt Task Optimizer</p>
          <h1>提示词任务拆解与上下文工程优化器</h1>
          <p>
            输入复杂提示词后，系统会拆元任务、推断依赖、评分重要度，并进一步生成 AI 执行合约、上下文包、角色分工、质量门和风险登记。
          </p>
        </div>
        <div className="hero-metrics" aria-label="分析结果摘要">
          <div>
            <strong>{analysis.tasks.length}</strong>
            <span>元任务</span>
          </div>
          <div>
            <strong>{averageImprovement}%</strong>
            <span>平均预估提升</span>
          </div>
          <div>
            <strong>{analysis.source}</strong>
            <span>分析来源</span>
          </div>
          <div>
            <strong>{workspace.executionContract.readinessScore}</strong>
            <span>执行就绪分</span>
          </div>
        </div>
      </section>

      <section className="account-section">
        <div className="account-panel">
          <div className="section-heading">
            <h2>用户账号</h2>
            <p>{authMessage}</p>
          </div>

          {currentUser ? (
            <div className="current-user-card">
              <div>
                <strong>{currentUser.name}</strong>
                <span>{currentUser.email}</span>
              </div>
              <span className={`role-badge role-${currentUser.role}`}>
                {currentUser.role === "admin" ? "管理员" : "普通用户"}
              </span>
              <button className="ghost-button" onClick={handleLogout}>
                退出登录
              </button>
            </div>
          ) : (
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <div className="auth-tabs">
                <button
                  type="button"
                  className={authMode === "login" ? "active" : ""}
                  onClick={() => setAuthMode("login")}
                >
                  登录
                </button>
                <button
                  type="button"
                  className={authMode === "register" ? "active" : ""}
                  onClick={() => setAuthMode("register")}
                >
                  注册
                </button>
              </div>
              {authMode === "register" && (
                <label>
                  用户名
                  <input
                    value={authForm.name}
                    onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                    placeholder="例如：张三"
                  />
                </label>
              )}
              <label>
                邮箱
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                密码
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                  placeholder="至少 6 位"
                />
              </label>
              <button className="primary-button" type="submit">
                {authMode === "login" ? "登录" : "创建账号"}
              </button>
            </form>
          )}
        </div>

        {currentUser?.role === "admin" && (
          <div className="admin-panel">
            <div className="section-heading">
              <h2>管理系统</h2>
              <button className="ghost-button" onClick={() => void loadAdminData()}>
                刷新数据
              </button>
            </div>

            <div className="admin-stats">
              <div>
                <strong>{adminStats?.totalUsers ?? 0}</strong>
                <span>总用户</span>
              </div>
              <div>
                <strong>{adminStats?.activeUsers ?? 0}</strong>
                <span>启用用户</span>
              </div>
              <div>
                <strong>{adminStats?.adminUsers ?? 0}</strong>
                <span>管理员</span>
              </div>
              <div>
                <strong>{adminStats?.totalAnalyses ?? 0}</strong>
                <span>分析次数</span>
              </div>
            </div>

            <div className="admin-grid">
              <div className="admin-table-wrap">
                <h3>用户管理</h3>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>用户</th>
                      <th>角色</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((user) => (
                      <tr key={user.id}>
                        <td>
                          <strong>{user.name}</strong>
                          <span>{user.email}</span>
                        </td>
                        <td>{user.role === "admin" ? "管理员" : "普通用户"}</td>
                        <td>{user.active ? "启用" : "停用"}</td>
                        <td>
                          <button
                            className="table-button"
                            onClick={() => void updateUser(user.id, { active: !user.active })}
                          >
                            {user.active ? "停用" : "启用"}
                          </button>
                          <button
                            className="table-button"
                            onClick={() =>
                              void updateUser(user.id, { role: user.role === "admin" ? "user" : "admin" })
                            }
                          >
                            {user.role === "admin" ? "设为用户" : "设为管理员"}
                          </button>
                          <button className="table-button danger" onClick={() => void deleteUser(user.id)}>
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="analysis-log-panel">
                <h3>分析日志</h3>
                <div className="analysis-log-list">
                  {analysisLogs.slice(0, 8).map((log) => (
                    <article key={log.id}>
                      <strong>{log.userEmail}</strong>
                      <span>
                        {log.taskCount} 个任务 / {log.source}
                      </span>
                      <p>{log.promptPreview || "空提示词"}</p>
                    </article>
                  ))}
                  {analysisLogs.length === 0 && <p className="empty-note">暂无分析日志。</p>}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {currentUser ? (
        <>
      <section className="workspace-grid">
        <div className="input-panel">
          <div className="panel-heading">
            <h2>输入与选项</h2>
            <span>{status}</span>
          </div>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="例如：先分析竞品，再设计功能，然后写推广文案"
          />

          <div className="controls">
            <label>
              分析模式
              <select value={mode} onChange={(event) => setMode(event.target.value as AnalysisMode)}>
                <option value="local">本地规则</option>
                <option value="llm">LLM增强</option>
                <option value="hybrid">混合模式</option>
              </select>
            </label>
            <label>
              拆解粒度
              <select
                value={granularity}
                onChange={(event) => setGranularity(event.target.value as Granularity)}
              >
                <option value="compact">简洁</option>
                <option value="balanced">均衡</option>
                <option value="detailed">详细</option>
              </select>
            </label>
          </div>

          <div className="toggle-row">
            <label>
              <input
                type="checkbox"
                checked={preferDependencyOrder}
                onChange={(event) => setPreferDependencyOrder(event.target.checked)}
              />
              优先按依赖顺序输出
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeContextEngineering}
                onChange={(event) => setIncludeContextEngineering(event.target.checked)}
              />
              加入上下文工程优化
            </label>
          </div>

          <div className="button-row">
            <button className="primary-button" onClick={handleAnalyze} disabled={isLoading}>
              {isLoading ? "分析中..." : "开始分析"}
            </button>
            <button className="ghost-button" onClick={handleCopy}>
              {copied ? "已复制" : "复制优化提示词"}
            </button>
          </div>
        </div>

        <div className="output-panel">
          <div className="panel-heading">
            <h2>优化后的提示词</h2>
            <span>按顺序、重要度和上下文分区重写</span>
          </div>
          <pre>{analysis.optimizedPrompt}</pre>
        </div>
      </section>

      <section className="result-grid">
        <div className="task-section">
          <div className="section-heading">
            <h2>元任务序列</h2>
            <p>重要度为启发式预估，综合目标相关性、依赖中心性、风险和交付影响。</p>
          </div>
          <div className="task-list">
            {analysis.tasks.map((task) => (
              <article className="task-card" key={task.id}>
                <div className="task-topline">
                  <span className="task-id">{task.id}</span>
                  <span className={`priority ${getPriorityClass(task.importance)}`}>
                    {task.importance}/100
                  </span>
                </div>
                <h3>
                  {task.order}. {task.title}
                </h3>
                <p>{task.description}</p>
                <div className="dependency-row">
                  <span>依赖</span>
                  <strong>{task.dependsOn.length > 0 ? task.dependsOn.join(" + ") : "无"}</strong>
                </div>
                <p className="rationale">{task.rationale}</p>
                <div className="hint-row">
                  {task.contextHints.map((hint) => (
                    <span key={hint}>{hint}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="side-section">
          <h2>上下文工程优化</h2>
          <div className="optimization-list">
            {analysis.contextOptimizations.map((item) => (
              <article className="optimization-item" key={item.name}>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <strong>{item.expectedImpact}</strong>
              </article>
            ))}
          </div>

          <h2>预估优化结果</h2>
          <div className="improvement-list">
            {analysis.estimatedImprovements.map((item) => (
              <article className="improvement-item" key={item.metric}>
                <div>
                  <h3>{item.metric}</h3>
                  <p>{item.rationale}</p>
                </div>
                <strong>{item.improvement}%</strong>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="orchestration-section">
        <div className="section-heading">
          <h2>AI 任务编排工作台</h2>
          <p>把提示词升级成可交接、可检查、可复盘的任务执行系统，而不只是改写一句 prompt。</p>
        </div>

        <div className="orchestration-summary">
          <div>
            <strong>{workspace.maturityLevel}</strong>
            <span>成熟度</span>
          </div>
          <div>
            <strong>{workspace.executionContract.autonomyLevel}</strong>
            <span>自治等级</span>
          </div>
          <div>
            <strong>{workspace.executionContract.contextCompression}%</strong>
            <span>上下文压缩</span>
          </div>
          <div>
            <strong>{workspace.risks.length}</strong>
            <span>风险登记</span>
          </div>
        </div>

        <div className="workflow-board">
          {workspace.stages.map((stage) => (
            <article className="stage-card" key={stage.id}>
              <div className="stage-index">{stage.id}</div>
              <h3>{stage.title}</h3>
              <p>{stage.purpose}</p>
              <div className="stage-meta">
                <span>{stage.owner}</span>
                <span>{stage.qualityGateId}</span>
              </div>
              <strong>{stage.expectedOutput}</strong>
              <div className="stage-tasks">
                {stage.taskIds.map((taskId) => (
                  <span key={taskId}>{taskId}</span>
                ))}
              </div>
            </article>
          ))}
        </div>

        <div className="orchestration-grid">
          <div className="role-panel">
            <h3>多代理角色分工</h3>
            <div className="role-list">
              {workspace.roles.map((role) => (
                <article key={role.id}>
                  <strong>{role.name}</strong>
                  <p>{role.responsibility}</p>
                  <span>负责：{role.ownsTaskIds.length > 0 ? role.ownsTaskIds.join("、") : "按需接管"}</span>
                  <em>{role.handoffRule}</em>
                </article>
              ))}
            </div>
          </div>

          <div className="context-panel">
            <h3>上下文包</h3>
            <div className="context-pack-list">
              {workspace.contextPacks.map((pack) => (
                <article key={pack.id}>
                  <div>
                    <strong>{pack.title}</strong>
                    <span>{pack.kind}</span>
                  </div>
                  <ul>
                    {pack.content.slice(0, 3).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <em>{pack.usageRule}</em>
                </article>
              ))}
            </div>
          </div>

          <div className="quality-panel">
            <h3>质量门</h3>
            <div className="quality-list">
              {workspace.qualityGates.map((gate) => (
                <article key={gate.id}>
                  <strong>{gate.id} · {gate.title}</strong>
                  <p>{gate.checklist.join(" / ")}</p>
                  <em>{gate.passCondition}</em>
                </article>
              ))}
            </div>
          </div>

          <div className="risk-panel">
            <h3>风险登记</h3>
            <div className="risk-list">
              {workspace.risks.map((risk) => (
                <article className={`risk-card risk-${risk.level}`} key={risk.id}>
                  <div>
                    <strong>{risk.title}</strong>
                    <span>{risk.level}</span>
                  </div>
                  <p>{risk.trigger}</p>
                  <em>{risk.mitigation}</em>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="contract-panel">
          <div className="panel-heading">
            <h2>{workspace.executionContract.title}</h2>
            <button className="ghost-button" onClick={handleCopyContract}>
              {contractCopied ? "合约已复制" : "复制执行合约"}
            </button>
          </div>
          <p>{workspace.executionContract.summary}</p>
          <pre>{workspace.executionContract.contractPrompt}</pre>
        </div>
      </section>

      <section className="sample-section">
        <div className="section-heading">
          <h2>测试用例</h2>
          <p>点击样例可直接载入输入框。百分比为本地启发式预估值，不是论文实测指标。</p>
        </div>
        <div className="sample-grid">
          {getSamplePrompts().map((sample) => (
            <button className="sample-card" key={sample.title} onClick={() => loadSample(sample.prompt)}>
              <strong>{sample.title}</strong>
              <span>{sample.prompt}</span>
              <em>{sample.expectation}</em>
            </button>
          ))}
        </div>
      </section>

      <section className="benchmark-section">
        <div className="section-heading">
          <h2>Baseline 对比实验</h2>
          <p>
            Baseline 是直接使用原始提示词；优化方案会拆元任务、显式依赖、标注重要度、加入上下文工程和最终自检。
          </p>
        </div>

        <div className="benchmark-summary">
          <div>
            <strong>{benchmarkReport.summary.caseCount}</strong>
            <span>测试用例</span>
          </div>
          <div>
            <strong>{benchmarkReport.summary.averageBaseline}</strong>
            <span>Baseline 平均分</span>
          </div>
          <div>
            <strong>{benchmarkReport.summary.averageOptimized}</strong>
            <span>优化后平均分</span>
          </div>
          <div>
            <strong>+{benchmarkReport.summary.averageDelta}</strong>
            <span>平均绝对提升</span>
          </div>
          <div>
            <strong>{benchmarkReport.summary.averageDeltaPercent}%</strong>
            <span>相对提升</span>
          </div>
        </div>

        <div className="benchmark-grid">
          <div className="comparison-table-wrap">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>用例</th>
                  <th>Baseline</th>
                  <th>优化后</th>
                  <th>提升</th>
                  <th>结论</th>
                </tr>
              </thead>
              <tbody>
                {benchmarkReport.cases.map((testCase) => (
                  <tr key={testCase.id}>
                    <td>
                      <strong>{testCase.title}</strong>
                      <span>{testCase.category}</span>
                    </td>
                    <td>{testCase.averageBaseline}</td>
                    <td>{testCase.averageOptimized}</td>
                    <td>+{testCase.averageDelta}</td>
                    <td>{testCase.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="work-report">
            <h3>我们的工作做了什么</h3>
            <ul>
              {benchmarkReport.workSummary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>能做到什么</h3>
            <ul>
              {benchmarkReport.capabilityCoverage.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </div>

        <div className="case-detail-grid">
          {benchmarkReport.cases.map((testCase) => (
            <article className="case-detail-card" key={testCase.id}>
              <div className="case-card-heading">
                <strong>{testCase.title}</strong>
                <span>+{testCase.averageDelta}</span>
              </div>
              <p>{testCase.prompt}</p>
              <div className="mini-metric-grid">
                {testCase.metricResults.slice(0, 3).map((metric) => (
                  <div key={metric.key}>
                    <span>{metric.label}</span>
                    <strong>
                      {metric.baseline} → {metric.optimized}
                    </strong>
                  </div>
                ))}
              </div>
              <em>{testCase.advantages.join(" ")}</em>
            </article>
          ))}
        </div>
      </section>
        </>
      ) : (
        <section className="locked-section">
          <div>
            <p className="eyebrow">Access Required</p>
            <h2>请先登录或注册</h2>
            <p>
              登录后才能使用 AI 任务编排工作台、生成执行合约、保存分析日志。管理员登录后还可以进入管理系统查看用户和使用记录。
            </p>
          </div>
        </section>
      )}
    </main>
  );
}

function getPriorityClass(score: number): string {
  if (score >= 82) {
    return "high";
  }

  if (score >= 66) {
    return "medium";
  }

  return "low";
}

export default App;
