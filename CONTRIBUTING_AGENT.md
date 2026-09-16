# AI Agent 自动爆料与 PR 提交规范 (Agent Contribution Guide)

> **Agent Instruction:**
> You are an automated open-source contribution assistant. Your task is to extract free-tier LLM information provided by the user, validate it against `providers.schema.json`, update `providers.json` in repository `maojindao55/freebuddy-freebie`, and submit a Pull Request.

---

## 🎯 任务目标

根据用户提供的服务商信息（官网、免费额度、免费模型等），修改本仓库的 `providers.json`，并提交 Pull Request 到 `maojindao55/freebuddy-freebie` 的 `main` 分支。

**核心准则：**
1. **只修改 `providers.json`**，请勿修改任何代码、样式或 HTML 文件。
2. **严禁包含任何私有 API Key 或 Token**。
3. **所有 URL 必须是 `https://`** 且真实可访问。

---

## 📋 字段规范 (Schema Constraints)

每一项服务商记录都必须符合 `providers.schema.json`：

| 字段名 | 类型 | 必填 | 说明与约束 | 示例 |
| --- | --- | --- | --- | --- |
| `id` | `string` | **是** | 小写英文字母、数字、中划线，全局唯一，不可与已有条目重复 | `"b-ai"`、`"zhipu"` |
| `name` | `string` | **是** | 服务商官方展示名称（1-80 字符） | `"B.AI"`、`"智谱 BigModel"` |
| `icon` | `string` | 否 | [LobeHub Icons](https://lobehub.com/icons) 图标名（如 `"zhipu-color"`），未收录可留空（会自动通过官网域名获取 Favicon 兜底） | `"zhipu-color"`、`"deepseek-color"` |
| `region` | `string` | 否 | 地区分类：`"cn"`（国内直连无需网络代理）或 `"global"`（海外） | `"cn"` |
| `homepage` | `string` | 否 | 官方网站，必须为 `https://` 开头 | `"https://b.ai"` |
| `consoleUrl` | `string` | 否 | 申请 API Key 或控制台直达链接，必须为 `https://` | `"https://b.ai/settings/api-keys"` |
| `freeTierSummary` | `object` | 否 | 免费政策简述（400 字以内），需包含 `zh-CN` 与 `en` 键 | 见下方示例 |
| `protocol` | `string` | **是** | 协议类型，仅限：`"openai-chat"`、`"openai-responses"`、`"anthropic"`、`"deepseek"` | `"openai-chat"` |
| `baseUrl` | `string` | **是** | 兼容协议的 API 端点，必须为 `https://`，末尾不带斜杠 | `"https://api.b.ai/v1"` |
| `envKey` | `string` | 否 | 环境变量名，通常为 `"OPENAI_API_KEY"` | `"OPENAI_API_KEY"` |
| `models` | `array` | **是** | 模型列表，至少包含 1 个模型，`models[0]` 为默认主模型 | 见下方说明 |
| `verifiedAt` | `string` | 否 | 核验日期，格式必须为 `YYYY-MM-DD` | `"2026-09-10"` |

### `models` 子项说明
每个模型对象包含：
- `id` (必填): 真实请求时传递的模型标识，如 `"glm-4-flash"`
- `name` (可选): 展示名称，如 `"GLM-4-Flash"`
- `contextWindow` (可选): 上下文长度数字，如 `128000`
- `supportsVision` (可选): 若支持图像理解，设为 `true`

---

## 💡 标准条目示例

```json
{
  "id": "b-ai",
  "name": "B.AI",
  "region": "cn",
  "homepage": "https://b.ai",
  "consoleUrl": "https://b.ai/user/api-key",
  "freeTierSummary": {
    "zh-CN": "平台限免支持 GLM 5.3 Flash、Qwen3.8 Flash、Hy3 与 Mimo2.5 等多款主流模型。",
    "en": "Limited-time free tier supporting GLM 5.3 Flash, Qwen3.8 Flash, Hy3, and Mimo2.5."
  },
  "protocol": "openai-chat",
  "baseUrl": "https://api.b.ai/v1",
  "envKey": "OPENAI_API_KEY",
  "models": [
    { "id": "glm-5.3-flash", "name": "GLM 5.3 Flash", "contextWindow": 128000 },
    { "id": "qwen-3.8-flash", "name": "Qwen3.8 Flash", "contextWindow": 128000 },
    { "id": "hy3", "name": "Hy3", "contextWindow": 65536 },
    { "id": "mimo-2.5", "name": "Mimo2.5", "contextWindow": 65536 }
  ],
  "verifiedAt": "2026-09-10"
}
```

---

## 🗂️ 可选：同时下发到运行时目录（D1）

`providers.json` 只影响页面静态目录。如果你希望这条服务商也进入 `GET /api/providers` 运行时目录，
**额外新增一个文件**（不要改代码，也不要删改 `providers.json` 里的历史条目）：

- 路径：`submissions/providers/<id>.json`，`<id>` 必须与文件内的 `id` 完全一致。
- 字段：与 `providers.json` 的同名字段一致（camelCase），另外**必须**带 `status`：
  - 新增/更新：`"status": "approved"`（合并 PR 即视为审核通过）
  - 下线：`"status": "disabled"`，且必须补 `offlineReason`（≤400 字）与 `offlineAt`（`YYYY-MM-DD`）
  - 恢复：把 `status` 改回 `"approved"`，并删掉 `offlineReason` / `offlineAt`
- 校验：`node scripts/sync-providers.mjs` 会先在本地全量校验，任何字段不合规都会报错并拒绝生成 SQL。
- 规范与示例：<https://github.com/maojindao55/freebuddy-freebie/blob/main/submissions/providers/README.md>

---

## 🛠️ Agent 执行步骤 (Step-by-step Workflow)

1. **查重与准备**：
   - 检查 `providers.json`，根据服务商名称或域名确认是否已有对应条目。
   - 若已有条目：更新其免费模型列表、`freeTierSummary` 与 `verifiedAt`。
   - 若为新服务商：在 `providers` 数组中追加新对象。
2. **更新顶层日期**：
   - 将 `providers.json` 顶部的 `"updatedAt": "YYYY-MM-DD"` 更新为今日日期。
3. **格式校验**：
   - 执行 Node.js 校验确保 JSON 语法合法：
     ```bash
     node -e "JSON.parse(require('fs').readFileSync('providers.json', 'utf8'))"
     ```
4. **Git 提交与 PR**：
   - 创建新分支：`git checkout -b feat/add-<provider-id>` 或 `update/<provider-id>`
   - 提交更改：
     ```bash
     git commit -am "feat(provider): add <provider-name> free tier models"
     ```
   - 推送分支并创建 PR（可使用 GitHub CLI `gh`）：
     ```bash
     gh pr create --repo maojindao55/freebuddy-freebie \
       --title "feat: 爆料新增 <provider-name> 免费模型" \
       --body "### 爆料服务商信息\n- 服务商：<provider-name>\n- 官网：<homepage>\n- 免费政策概述：<summary>\n- 核验日期：<today>"
     ```
   - 若环境未登录 `gh`，请向用户输出提交指引及已改好的分支。
