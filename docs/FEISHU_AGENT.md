# 飞书智能体控制接口

这个项目已经提供一个可被飞书机器人、飞书智能体工作流或任意 HTTP 工具调用的自然语言控制接口。

核心入口：

```http
POST /api/feishu/command
```

飞书事件回调基础入口：

```http
POST /api/feishu/events
```

当前 `/api/feishu/events` 已支持飞书 URL verification 和基础消息解析；真正“主动回复飞书消息”还需要继续配置飞书发送消息 API。

## 环境变量

服务器 `.env` 建议增加：

```env
FEISHU_AGENT_SECRET=change-me
FEISHU_ADMIN_OPEN_IDS=ou_xxx,ou_yyy
FEISHU_VERIFICATION_TOKEN=xxx
PUBLIC_APP_URL=http://101.132.44.51
```

说明：

- `FEISHU_AGENT_SECRET`：调用 `/api/feishu/command` 时要放在请求头 `x-feishu-agent-secret`。
- `FEISHU_ADMIN_OPEN_IDS`：允许使用管理智能体的飞书用户 open_id。留空则不限制，开发期可留空，生产建议配置。
- `FEISHU_VERIFICATION_TOKEN`：飞书事件订阅的 verification token。
- `PUBLIC_APP_URL`：机器人回复里给用户的网页访问地址。

## 可用自然语言指令

```text
查看系统状态
查看用户统计
列出最近10个用户
查找用户 user@example.com
注册用户 张三 user@example.com 密码 abc123
替 user@example.com 分析提示词：帮我写一个短视频脚本
禁用用户 user@example.com
启用用户 user@example.com
把 user@example.com 设为管理员
把 user@example.com 设为普通用户
查看最近10条分析记录
```

禁用、启用、改角色等修改类指令需要二次确认：第一次返回 `needsConfirmation: true`，第二次请求带 `confirm: true` 才会执行。

注册用户会直接创建网页账号，并返回登录地址和初始密码。

提示词分析会执行本地规则分析，并写入分析记录；如果带邮箱，会把记录归到对应用户。

## curl 调用示例

查看系统状态：

```bash
curl -X POST http://127.0.0.1:8787/api/feishu/command \
  -H "Content-Type: application/json" \
  -H "x-feishu-agent-secret: change-me" \
  -d '{"text":"查看系统状态"}'
```

注册用户：

```bash
curl -X POST http://127.0.0.1:8787/api/feishu/command \
  -H "Content-Type: application/json" \
  -H "x-feishu-agent-secret: change-me" \
  -d '{"text":"注册用户 张三 zhang@example.com 密码 abc123"}'
```

代用户分析提示词：

```bash
curl -X POST http://127.0.0.1:8787/api/feishu/command \
  -H "Content-Type: application/json" \
  -H "x-feishu-agent-secret: change-me" \
  -d '{"text":"替 zhang@example.com 分析提示词：帮我写一个短视频脚本"}'
```

禁用用户，第一次请求：

```bash
curl -X POST http://127.0.0.1:8787/api/feishu/command \
  -H "Content-Type: application/json" \
  -H "x-feishu-agent-secret: change-me" \
  -d '{"text":"禁用用户 zhang@example.com"}'
```

确认执行：

```bash
curl -X POST http://127.0.0.1:8787/api/feishu/command \
  -H "Content-Type: application/json" \
  -H "x-feishu-agent-secret: change-me" \
  -d '{"text":"禁用用户 zhang@example.com","confirm":true}'
```

## 飞书接入路径

第一阶段推荐：

1. 在飞书智能体/工作流里创建 HTTP 调用动作。
2. URL 填你的公网地址：

```text
http://你的服务器/api/feishu/command
```

3. Header 增加：

```text
x-feishu-agent-secret: 你的 FEISHU_AGENT_SECRET
```

4. Body 传：

```json
{
  "text": "{{用户输入}}",
  "operatorOpenId": "{{飞书用户 open_id}}"
}
```

第二阶段再接：

- 飞书事件订阅 `im.message.receive_v1`
- `/api/feishu/events`
- 飞书发送消息 API，把 `reply` 主动发回聊天窗口

这样可以先让“自然语言控制网页后端”跑起来，再逐步补完整飞书交互体验。
