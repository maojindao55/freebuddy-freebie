# FreeBuddy 白嫖专区页面

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/maojindao55/freebuddy-freebie)

这是 FreeBuddy 侧栏「白嫖」入口内嵌的外部页面。它是一个无构建步骤的静态站点，部署在 Cloudflare 上；修改 `providers.json` 并推送即可上线，不需要发布 FreeBuddy 新版本。

## 一键导入 / 部署 (Deploy to Cloudflare)

点击下方按钮一键部署到 Cloudflare：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/maojindao55/freebuddy-freebie)

### 手动导入步骤（可选）

1. 点击上方按钮或访问 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages（Workers 和 Pages）** → **Create（创建）**。
2. 顶部选择 **Pages** 选项卡（**请注意：必须选 Pages，不要选 Worker**），点击 **Connect to Git（连接到 Git）**。
3. 授权并选择本仓库 `maojindao55/freebuddy-freebie`（或你的 Fork 仓库）。
4. **Build settings（构建配置）**：
   - **Framework preset**: `None`
   - **Build command**: 留空（无构建命令）
   - **Build output directory**: `.` 或 `/`（直接使用根目录）
5. 点击 **Save and Deploy（保存并部署）** 即可完成上线！
6. 部署完成后得到 `https://<project>.pages.dev/`。把这个地址写入 FreeBuddy 的 `src/config/freebie.ts` 中的 `DEFAULT_FREEBIE_PAGE_URL`（只需配置一次）。
7. 之后每次向本仓库推送改动，Cloudflare Pages 都会自动重新部署。

## 目录

| 文件 | 作用 |
| --- | --- |
| `index.html` / `styles.css` / `app.js` | 页面本体，渲染服务商卡片、筛选、导入按钮 |
| `freebuddy-bridge.js` | 与 FreeBuddy 通信的 postMessage 客户端（协议 v1） |
| `providers.json` | 服务商目录，唯一需要经常维护的文件 |
| `providers.schema.json` | 目录的 JSON Schema，编辑器会据此校验 |
| `_headers` | Cloudflare Pages 响应头（CORS 及安全策略） |
| `wrangler.toml` | Cloudflare Pages 项目配置 |

## 维护 providers.json

每个服务商一条记录：

```json
{
  "id": "zhipu",
  "name": "智谱 BigModel",
  "region": "cn",
  "homepage": "https://bigmodel.cn",
  "consoleUrl": "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
  "freeTierSummary": { "zh-CN": "……", "en": "……" },
  "protocol": "openai-chat",
  "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
  "envKey": "OPENAI_API_KEY",
  "models": [{ "id": "glm-4-flash", "name": "GLM-4-Flash", "contextWindow": 128000 }],
  "verifiedAt": "2026-09-09"
}
```

- `id`：小写 slug，稳定不变，FreeBuddy 用它判断「已导入」。
- `protocol`：`openai-chat`（绝大多数）、`openai-responses`、`anthropic`、`deepseek`。
  决定 FreeBuddy 用哪个基座 CLI（Codex / Claude Code / DeepSeek）承载。
- `baseUrl` / `homepage` / `consoleUrl` 必须是 `https://`。
- `models[0]` 会成为导入后的默认模型。
- 改完顺手更新 `verifiedAt` 和顶层 `updatedAt`。

## 本地预览

```bash
npx serve . -l 8788
# 或
python3 -m http.server 8788
```

让 FreeBuddy 加载本地页面：

```bash
VITE_FREEBIE_PAGE_URL=http://localhost:8788/ npm run dev
```

## 桥协议 v1

所有消息都带 `source: "freebuddy-freebie"` 与 `protocolVersion: 1`。

页面 → FreeBuddy：

| type | 字段 | 说明 |
| --- | --- | --- |
| `ready` | — | 请求握手 |
| `importAgent` | `requestId`, `preset` | 请求创建 BYOK Agent，`preset` 为一条服务商记录，**不含 API Key** |
| `openExternal` | `url` | 用系统浏览器打开 https 链接 |
| `getState` | `requestId` | 重新请求状态 |

FreeBuddy → 页面：

| type | 字段 | 说明 |
| --- | --- | --- |
| `hello` | `locale`, `theme`, `platform`, `importedProviderIds`, `runtimes` | 握手应答 |
| `result` | `requestId`, `ok`, `agentId` / `error` | `importAgent` 的结果；用户取消时 `error: "cancelled"` |
| `state` | `importedProviderIds`, `runtimes` | 状态变化广播 |

FreeBuddy 只接受来自配置页面 origin 的消息，并在原生对话框里向用户展示
`baseUrl` 与模型列表、由用户输入 API Key 后才会真正创建 Agent。
