export interface FeishuReplyResult {
  sent: boolean;
  reason?: string;
  status?: number;
}

interface TenantTokenCache {
  token: string;
  expiresAt: number;
}

let tenantTokenCache: TenantTokenCache | null = null;

export async function replyToFeishuMessage(messageId: string, text: string): Promise<FeishuReplyResult> {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    return {
      sent: false,
      reason: "FEISHU_APP_ID or FEISHU_APP_SECRET is not configured"
    };
  }

  if (!messageId) {
    return {
      sent: false,
      reason: "Missing feishu message_id"
    };
  }

  const token = await getTenantAccessToken(appId, appSecret);
  const response = await fetch(`${getFeishuBaseUrl()}/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      msg_type: "text",
      content: JSON.stringify({ text: truncateFeishuText(text) })
    })
  });

  if (!response.ok) {
    return {
      sent: false,
      status: response.status,
      reason: await response.text().catch(() => `Feishu reply API returned ${response.status}`)
    };
  }

  return { sent: true, status: response.status };
}

async function getTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const now = Date.now();
  if (tenantTokenCache && tenantTokenCache.expiresAt - 60_000 > now) {
    return tenantTokenCache.token;
  }

  const response = await fetch(`${getFeishuBaseUrl()}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });

  if (!response.ok) {
    throw new Error(`Feishu token API returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
  };

  if (payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(`Feishu token API failed: ${payload.msg || "missing tenant_access_token"}`);
  }

  tenantTokenCache = {
    token: payload.tenant_access_token,
    expiresAt: now + Math.max(1, payload.expire || 7200) * 1000
  };
  return tenantTokenCache.token;
}

function getFeishuBaseUrl(): string {
  return (process.env.FEISHU_BASE_URL || "https://open.feishu.cn").replace(/\/$/, "");
}

function truncateFeishuText(text: string): string {
  const normalized = String(text || "").trim();
  return normalized.length > 3500 ? `${normalized.slice(0, 3500)}\n\n...回复过长，已截断。` : normalized;
}
