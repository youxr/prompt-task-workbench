import { afterEach, describe, expect, it } from "vitest";
import { replyToFeishuMessage } from "./feishuClient";

const originalAppId = process.env.FEISHU_APP_ID;
const originalAppSecret = process.env.FEISHU_APP_SECRET;

describe("feishuClient", () => {
  afterEach(() => {
    process.env.FEISHU_APP_ID = originalAppId;
    process.env.FEISHU_APP_SECRET = originalAppSecret;
  });

  it("skips replying when app credentials are not configured", async () => {
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;

    const result = await replyToFeishuMessage("om_mock", "hello");

    expect(result.sent).toBe(false);
    expect(result.reason).toContain("FEISHU_APP_ID");
  });
});
