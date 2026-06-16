import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";

const appUrl = process.env.PUBLIC_APP_URL || process.argv[2] || "http://127.0.0.1:5173";
const outputDir = path.resolve("docs");
const svgPath = path.join(outputDir, "access-qr.svg");
const htmlPath = path.join(outputDir, "access-qr.html");

await mkdir(outputDir, { recursive: true });

const svg = await QRCode.toString(appUrl, {
  type: "svg",
  margin: 2,
  width: 320,
  errorCorrectionLevel: "M"
});

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>扫码访问 AI 任务编排工作台</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #17211c;
        background: #f5f7f4;
      }
      main {
        width: min(480px, calc(100% - 32px));
        padding: 28px;
        border: 1px solid #d7ded7;
        border-radius: 8px;
        background: #fff;
        text-align: center;
      }
      svg {
        width: min(320px, 100%);
        height: auto;
      }
      a {
        color: #0b7f67;
        font-weight: 800;
        word-break: break-all;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>扫码访问 AI 任务编排工作台</h1>
      ${svg}
      <p><a href="${appUrl}">${appUrl}</a></p>
      <p>微信或浏览器扫码即可打开。若登录/分析失败，请确认后端 API 已部署并配置。</p>
    </main>
  </body>
</html>
`;

await writeFile(svgPath, svg, "utf8");
await writeFile(htmlPath, html, "utf8");

console.log(`Generated QR code for ${appUrl}`);
console.log(`- ${svgPath}`);
console.log(`- ${htmlPath}`);
