# FreeBuddy 白嫖专区页面

这是 FreeBuddy 侧栏「白嫖」入口内嵌的外部页面。它是一个无构建步骤的静态站点，已部署在 Cloudflare 上；修改 `providers.json` 并推送到 `main` 分支即可自动触发构建上线，无需发布 FreeBuddy 新版本。

- **线上地址**：https://freebuddy-freebie.binbinzhaili.workers.dev/

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

## 🎁 提交 PR / 白嫖爆料指引 (Contribution & Agent Prompt)

发现新的免费模型、新用户免费额度或现有服务商信息过期？欢迎提交 PR！
本仓库特别优化了 **AI Agent 自动提交工作流**，你可以直接把爆料信息与提示词发给你的 AI 编程助手（如 Cursor, Claude Code, GitHub Copilot, Cline, Antigravity 等），由 Agent 全自动修改并向本仓库提交 PR。

---

### 🤖 方式一：让 AI Agent 帮你自动提交 PR（推荐）

直接复制下方提示词模板，填入你了解到的服务商信息，发给任何支持 Git/GitHub 操作的 AI Agent：

````markdown
你是一个熟练的开源贡献助手。请帮我向 GitHub 仓库 `maojindao55/freebuddy-freebie` 提交一个 Pull Request，用于【新增 / 更新】免费大模型服务商信息。

以下是我收集到的爆料信息：
- 服务商名称（name）：[例如：B.AI]
- 官网地址（homepage）：[例如：https://b.ai]
- API Key 申请地址（consoleUrl）：[例如：https://b.ai/settings/api-keys]
- API Base URL（baseUrl）：[例如：https://api.b.ai/v1]
- 协议类型（protocol）：[openai-chat / anthropic / deepseek，默认多为 openai-chat]
- 环境变量名（envKey）：[默认 OPENAI_API_KEY]
- 地区（region）：[cn（国内直连） / global（海外）]
- 免费政策与额度说明：[例如：新用户赠送 100 万 tokens，支持 GLM-5.3-Flash 等]
- 包含的免费模型列表（models）：[例如：GLM 5.3 Flash, Qwen3.8 Flash]

请严格遵循仓库中的 `providers.schema.json` 约束，完成以下操作：
1. 检查 `providers.json`，如果该服务商不存在则新增，已存在则更新其免费模型与政策描述；
2. 为该服务商分配唯一、简洁的小写 slug 作为 `id`（如 `b-ai`）；
3. 补全 `freeTierSummary` 的 `zh-CN` 与 `en` 双语简述（400 字以内）；
4. 确保所有 URL 均以 `https://` 开头；
5. 将新条目的 `verifiedAt` 以及文件顶层的 `updatedAt` 更新为今天的日期（YYYY-MM-DD）；
6. 验证 `providers.json` 为合法的 JSON 格式；
7. 创建分支（例如 `feat/add-<id>`），提交修改并使用 `gh pr create` 或提供 Git PR 提交指令。
````

---

### 📋 Agent 规约与技术细节 (Specifications for Agents)

如果你是正在阅读本仓库的 AI Agent，修改时请务必注意以下核心规范：

1. **唯一修改文件**：通常仅需修改 `providers.json`，无需修改任何前端界面文件或代码。
2. **严格遵守 Schema**：参照 `providers.schema.json`：
   - `id`: 必填，小写字母、数字及中划线/下划线（`^[a-z0-9][a-z0-9_-]{0,63}$`），**不可与已有 id 重复**。
   - `protocol`: 必须为 `openai-chat` | `openai-responses` | `anthropic` | `deepseek` 之一。
   - `baseUrl`: 协议标准接口端点（如 `https://api.example.com/v1`），末尾通常不带斜杠。
   - `models`: 数组必须至少包含 1 个模型；`models[0]` 将作为 FreeBuddy 导入时的默认主模型；每个模型必填 `id`，推荐填写易读的 `name`，如有视觉多模态能力可标注 `"supportsVision": true`。
   - `verifiedAt` 与顶层 `updatedAt`: 必须满足 `YYYY-MM-DD` 格式。
3. **语言友好**：`freeTierSummary` 尽量同时提供 `zh-CN` 与 `en`（中文清晰简明标注免费额度或永久免费模型，英文翻译准确）。
4. **验证命令**：提交前可运行 `node -e "JSON.parse(fs.readFileSync('providers.json'))"` 确保 JSON 解析无误。

---

### ✍️ 方式二：手动在 GitHub 网页端修改提交

1. 打开 [providers.json](https://github.com/maojindao55/freebuddy-freebie/blob/main/providers.json) 文件。
2. 点击右上角的 🖊（Edit this file）铅笔图标。
3. 参考已有条目，在 `providers` 列表中添加或修改你的服务商信息，并更新顶部的 `updatedAt` 日期。
4. 页面底部填写 Commit 说明，选择 **Create a new branch for this commit and start a pull request** 并点击确认即可！



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
