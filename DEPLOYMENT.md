# 部署与扫码访问

## 当前状态

项目已经改造成可部署结构：

- 前端：React/Vite，可部署到 GitHub Pages。
- 后端：Express API，可部署到 Render、Railway、Fly.io、VPS 等 Node 服务。
- 登录：未登录不能使用工作台；`/api/analyze` 后端也强制要求 Bearer token。
- 管理系统：管理员可管理用户、查看统计和分析日志。
- 二维码：`npm run qr` 可生成扫码访问页和 SVG。

## 为什么不能只靠 GitHub Pages

GitHub Pages 只能托管静态文件，不能运行 Express、注册登录、JSON 数据存储或管理 API。

所以“微信扫码可用”的完整形态需要：

1. GitHub Pages 托管前端。
2. 一个公网 Node 后端提供登录、管理和分析 API。
3. 前端构建时设置 `VITE_API_BASE_URL` 指向后端。

## 1. 创建 GitHub 仓库并推送

当前本地已经是 git 仓库，分支为 `main`，并已提交。

在 GitHub 创建空仓库，例如：

```text
https://github.com/youxr/prompt-task-workbench
```

然后运行：

```powershell
.\scripts\publish-github.ps1 -RemoteUrl "https://github.com/youxr/prompt-task-workbench.git"
```

## 2. 部署后端

可以用仓库里的 `render.yaml` 在 Render 创建 Web Service。

后端环境变量建议：

```text
NODE_VERSION=24
PORT=8787
AUTH_DATA_FILE=/opt/render/project/src/data/app-data.json
PUBLIC_ORIGIN=https://youxr.github.io/prompt-task-workbench
ADMIN_EMAIL=你的管理员邮箱
ADMIN_PASSWORD=你的强密码
AI_API_KEY=可选
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4.1-mini
```

部署完成后得到后端公网地址，例如：

```text
https://prompt-workbench-api.onrender.com
```

## 3. 配置 GitHub Pages 前端

在 GitHub 仓库 Settings → Secrets and variables → Actions 添加：

```text
VITE_API_BASE_URL=https://prompt-workbench-api.onrender.com
```

然后到 Settings → Pages，选择 GitHub Actions 作为 Pages 部署来源。

推送到 `main` 后，`.github/workflows/pages.yml` 会自动部署前端。

## 4. 生成二维码

前端部署完成后，运行：

```powershell
$env:PUBLIC_APP_URL="https://youxr.github.io/prompt-task-workbench"
npm run qr
```

输出：

- `docs/access-qr.svg`
- `docs/access-qr.html`

微信或浏览器扫码即可打开前端页面。若登录失败，检查：

- 后端服务是否在线。
- GitHub secret `VITE_API_BASE_URL` 是否正确。
- 后端 `PUBLIC_ORIGIN` 是否等于前端 Pages URL。
- 是否使用部署时配置的 `ADMIN_EMAIL` / `ADMIN_PASSWORD`。
