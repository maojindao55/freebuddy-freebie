# FreeBuddy 白嫖专区页面

这是 FreeBuddy 侧栏「白嫖」入口内嵌的外部页面。它是一个无构建步骤的静态站点，已部署在 Cloudflare 上；修改 `providers.json` 并推送到 `main` 分支即可自动触发构建上线，无需发布 FreeBuddy 新版本。

- **线上地址**：https://freebuddy-freebie.binbinzhaili.workers.dev/
- **交流群聊**：[点击链接加入群聊【FreeBuddy白嫖兄弟群】](https://qm.qq.com/q/Obv3kViheo)

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

## 🎁 提交 PR / 白嫖爆料指引 (Contribution Guide)

发现新的免费模型、新用户免费额度或现有服务商信息过期？欢迎提交 PR！

### 🤖 方式一：让 AI Agent 帮你自动提交 PR（极简推荐）

无需自己阅读复杂规则，直接将你了解到的服务商信息和下方规则链接复制给你的 AI 助手（如 Cursor、Claude Code、GitHub Copilot、Cline、ChatGPT 等），让 Agent 自己读取规则并提交 PR：

**📋 复制给 AI Agent 的一句话提示（点击代码块右上角一键复制）：**

```text
我要爆料/更新免费服务商信息：[粘贴官网链接、模型名或活动内容]
规则与规范请直接读取：https://github.com/maojindao55/freebuddy-freebie/blob/main/CONTRIBUTING_AGENT.md
请按规则修改 providers.json 并帮我向 maojindao55/freebuddy-freebie 提交 Pull Request。
```

Agent 会自动根据 [CONTRIBUTING_AGENT.md](./CONTRIBUTING_AGENT.md) 与 `providers.schema.json` 完成查重、校验、更新 `providers.json` 并提交 PR。

---

### ✍️ 方式二：手动在 GitHub 网页端修改提交

1. 打开 [providers.json](https://github.com/maojindao55/freebuddy-freebie/blob/main/providers.json) 文件。
2. 点击右上角的 🖊（Edit this file）铅笔图标。
3. 参考 [CONTRIBUTING_AGENT.md](./CONTRIBUTING_AGENT.md) 字段规范，在 `providers` 列表中添加或修改你的服务商信息，并更新顶部的 `updatedAt` 日期。
4. 页面底部填写 Commit 说明，选择 **Create a new branch for this commit and start a pull request** 并点击确认即可！

---

### 💬 方式三：进群交流与爆料

如果你不想操作 GitHub，也可以直接加入群聊分享：  
👉 [点击链接加入群聊【FreeBuddy白嫖兄弟群】](https://qm.qq.com/q/Obv3kViheo)



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
