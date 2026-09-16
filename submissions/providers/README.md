# 运行时服务商声明目录

这个目录是 **D1 运行时服务商目录的审核入口**：一个文件 = 一个服务商，文件名必须等于 `id`：

```text
submissions/providers/<id>.json     例如 submissions/providers/zhipu.json
```

- PR 合并到 `main` 之后，[`.github/workflows/sync-providers.yml`](../../.github/workflows/sync-providers.yml) 会运行
  [`scripts/sync-providers.mjs`](../../scripts/sync-providers.mjs)，把这里所有声明转成幂等 upsert 并写入 D1，`GET /api/providers` 立刻反映结果。
- **合并 PR 就是审核**。所以正常情况下新增/更新用 `"status": "approved"`；还没核验完可以用 `"pending"`（不会被接口返回）；审核不通过用 `"rejected"`。
- 根目录的 `providers.json` 是页面的历史静态基础目录，**不会**因为这里新增一条就被改动或删除；两者按 `id` 合并，静态目录优先。

字段规范见 [`../providers.schema.json`](../providers.schema.json)（编辑器/Agent 会自动校验），可直接复制的完整示例见 [`../examples/approved.example.json`](../examples/approved.example.json) 与 [`../examples/disabled.example.json`](../examples/disabled.example.json)。

> 示例放在 `submissions/examples/`，不会被同步 —— 同步只扫描 `submissions/providers/*.json`。

## 最小声明示例

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
  "verifiedAt": "2026-09-16",
  "status": "approved",
  "submittedBy": "your-github-login"
}
```

`id` / `name` / `protocol` / `baseUrl` / `models` / `status` 必填，其余可选；出现未定义的字段会直接报错，避免 `baseURL` 这类拼写错误被静默忽略。

## status 生命周期

| status | 含义 | `GET /api/providers` |
| --- | --- | --- |
| `pending` | 已声明、待审核 | 不返回 |
| `approved` | 已审核通过 | **返回** |
| `disabled` | 显式下线，记录保留 | 不返回 |
| `rejected` | 审核不通过 | 不返回 |

## 新增服务商

1. 新建 `submissions/providers/<id>.json`，`id` 与文件名一致，`status` 填 `approved`。
2. 本地自检（可选，但建议）：

   ```bash
   node scripts/sync-providers.mjs --dir submissions/providers          # 输出 SQL 到 stdout
   node scripts/sync-providers.mjs --out .wrangler/sync-providers.sql   # 或写入文件
   ```

   只要有一个文件不合规，脚本会列出每个文件的具体问题并以退出码 1 结束，**不会**输出任何 SQL。
3. 提交 PR。合并后 workflow 自动同步，页面刷新即可看到新服务商。

## 下线服务商

把同一个文件的 `status` 改成 `"disabled"`，并补上**必填**的 `offlineReason` 与 `offlineAt`（真实存在的 `YYYY-MM-DD`）：

```json
{
  "id": "zhipu",
  "status": "disabled",
  "offlineReason": "免费额度活动已结束，新账号不再赠送额度",
  "offlineAt": "2026-09-16"
}
```

其余字段（`name` / `protocol` / `baseUrl` / `models` …）必须原样保留：D1 的约束仍然要求这些列合法，它们也是恢复时的依据。

合并后同步脚本会 upsert 这一行并写入 `status = 'disabled'`，接口立即不再返回它；D1 里的记录**不会被删除**，其他表（评价、投票）也不受影响。

## 恢复服务商

把 `status` 改回 `"approved"`，并删掉 `offlineReason` / `offlineAt`（非 `disabled` 状态保留这两个字段会被判为无效）。合并后同步脚本会重新 upsert，接口恢复返回。

## 删除声明文件会怎样？

**不会**删除或下线 D1 里的记录。同步脚本只写「当前还存在声明文件」的那批 `id`，它无法区分「文件被删了」和「这次只改了一个文件」，所以本期明确**不把删除映射成删除/下线**：

- 想下线：按上面的方式显式写 `"status": "disabled"`，保留文件，git 历史里也留得下原因。
- 直接删文件：D1 里的行原样留在 `status = 'approved'`，接口仍然返回 —— 这属于**未预期的状态**，发现后请补一个 `disabled` 的声明把它正确下线。

## 校验规则（比 JSON Schema 更严的部分）

同步脚本在生成 SQL 之前会逐条校验，全部通过才会输出：

- `id` 必须匹配 `^[a-z0-9][a-z0-9_-]{0,63}$`，且与文件名一致；所有文件之间 `id` 不能重复。
- `baseUrl` / `homepage` / `consoleUrl` / `icon`（如果写的是 URL）必须是 `https://`，不能带用户名密码，不能指向 `localhost`，长度 ≤ 2048。
- `icon` 只接受 `https://` 地址或 LobeHub 图标 slug（如 `zhipu-color`）。
- `region` 只能是 `cn` / `global`；`protocol` / `protocols` 只能是 4 种受支持协议之一。
- `models` 至少 1 条、最多 50 条，`models[i].id` 非空且不重复，`contextWindow` 必须是正整数。
- `envKey` 必须匹配 `^[A-Z][A-Z0-9_]{1,63}$`；`verifiedAt` / `offlineAt` 必须是真实的 `YYYY-MM-DD`。
- `status = "disabled"` 必须同时给出 `offlineReason` 与 `offlineAt`；其它状态不允许出现这两个字段。
- 未知字段、空字符串、控制字符一律报错。

## 相关文档

- 管理员如何配置 GitHub Secrets、同步失败怎么处理、新库/旧库的迁移顺序：见仓库根目录 [`README.md`](../../README.md) 的「运行时服务商（D1）」与「同步服务商声明到 D1」两节。
- 静态目录 `providers.json` 的投稿规范：见 [`CONTRIBUTING_AGENT.md`](../../CONTRIBUTING_AGENT.md)。
