# 提示词任务拆解与上下文工程优化器

一个可运行的 React + Vite + TypeScript AI 任务编排工作台。用户输入提示词后，应用不只会优化 prompt，还会把需求升级成可交接、可检查、可复盘的 AI 执行系统：元任务、依赖、重要度、上下文包、角色分工、质量门、风险登记和执行合约。

## 功能

- 本地规则分析：无需 API key 也能完整使用。
- LLM 增强模式：通过后端代理读取环境变量，失败时自动降级本地规则。
- 用户注册登录：支持邮箱注册、登录、退出和 token 会话。
- 管理系统：管理员可查看用户、启停账号、切换角色、删除用户、查看分析统计和分析日志。
- 元任务序列：展示任务说明、依赖、顺序、重要度和上下文提示。
- 上下文工程优化：任务表结构化、目标前后锚定、必要/可选上下文分离、依赖显式化、自检清单。
- AI 任务编排工作台：
  - 阶段流：理解与澄清、规划与设计、生成与实现、验证与交付。
  - 多代理角色：上下文经理、规划代理、执行代理、质检代理。
  - 上下文包：任务简报、约束、默认假设、检索触发器、可复用记忆。
  - 质量门：目标锁定、依赖顺序、交付完整、风险复核。
  - 风险登记：识别缺失信息、高风险交付链路和上下文过长。
  - AI 执行合约：可复制给 AI 直接执行的阶段化协议。
- 测试用例：内置求职邮件、电商网站、显式顺序和长提示词样例。

## 运行

```bash
npm install
npm run dev
```

前端页面：http://127.0.0.1:5173

后端 API：http://127.0.0.1:8787/api/analyze

默认管理员账号会在第一次启动后端时自动创建：

```text
邮箱：admin@example.com
密码：admin123456
```

用户、会话和分析日志默认保存到 `data/app-data.json`。这是本地演示用的轻量 JSON 存储，适合课程、原型和本地演示，不建议直接当生产数据库。

现在工作台已启用真实门禁：未登录只能看到注册/登录入口，登录后才能使用分析和执行合约；只有管理员能进入管理系统。

## LLM 增强配置

复制 `.env.example` 为 `.env`，按需配置：

```bash
AI_API_KEY=your_api_key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4.1-mini
PORT=8787
AUTH_DATA_FILE=./data/app-data.json
PUBLIC_ORIGIN=http://127.0.0.1:5173
VITE_API_BASE_URL=http://127.0.0.1:8787
VITE_BASE_PATH=/
PUBLIC_APP_URL=http://127.0.0.1:5173
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123456
```

未配置 `AI_API_KEY` 时，`LLM增强` 和 `混合模式` 会自动降级为本地规则分析，页面仍可完整运行。

## GitHub 与扫码部署

可以做到“别人微信或浏览器扫码使用”，但需要注意：GitHub Pages 只能托管前端静态页面，不能运行 Express 登录/管理后端。因此推荐部署形态是：

- GitHub 仓库存代码。
- GitHub Pages 部署前端。
- Render、Railway、Fly.io、VPS 等 Node 平台部署后端 API。
- 前端构建时设置 `VITE_API_BASE_URL` 指向后端公网地址。
- 后端设置 `PUBLIC_ORIGIN` 为 GitHub Pages 前端地址。

本项目已包含 GitHub Pages 工作流：`.github/workflows/pages.yml`。仓库中需要配置 secret：

```text
VITE_API_BASE_URL=https://你的后端公网地址
```

后端可用 `render.yaml` 部署到 Render。部署后建议设置：

```text
PUBLIC_ORIGIN=https://你的用户名.github.io/你的仓库名
ADMIN_EMAIL=你自己的管理员邮箱
ADMIN_PASSWORD=你自己的强密码
AI_API_KEY=可选
AUTH_DATA_FILE=/opt/render/project/src/data/app-data.json
```

生成扫码二维码：

```bash
PUBLIC_APP_URL=https://你的用户名.github.io/你的仓库名 npm run qr
```

生成文件：

- `docs/access-qr.svg`
- `docs/access-qr.html`

## 验证

```bash
npm test
npm run benchmark
npm run build
```

当前测试覆盖：

- 单任务输入：“帮我写一封求职邮件”
- 多步骤项目：“帮我做一个电商网站，包括商品页、购物车、订单和后台管理”
- 有因果顺序：“先分析竞品，再设计功能，然后写推广文案”
- 长提示词：背景、约束、交付物和多个目标混合输入

页面中的百分比是启发式预估值，用于解释优化方向，不是论文实测指标。

## Baseline 对比报告

运行 `npm run benchmark` 会生成两份可复现结果：

- `docs/benchmark-results.json`：机器可读的完整测试数据，包括 baseline 分、优化后分、差值和证据。
- `docs/benchmark-report.md`：中文分析报告，展示测试用例、总体结果、指标维度、我们的工作、能力边界和优势。

Baseline 定义为：直接把原始提示词交给模型，不显式拆分任务、不标注依赖、不做重要度评分、不加入上下文工程自检。优化方案使用本项目生成的结构化提示词做对比。
