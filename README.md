# FreeBuddy 白嫖专区页面

这是 FreeBuddy 侧栏「白嫖」入口内嵌的外部页面。它是一个无构建步骤的静态站点，已部署在 Cloudflare 上；修改 `providers.json` 并推送到 `main` 分支即可自动触发构建上线，无需发布 FreeBuddy 新版本。

- **线上地址**：https://freebuddy-freebie.binbinzhaili.workers.dev/
- **交流群聊**：[点击链接加入群聊【FreeBuddy白嫖兄弟群】](https://qm.qq.com/q/Obv3kViheo)

## 目录

| 文件 | 作用 |
| --- | --- |
| `index.html` / `styles.css` / `app.js` | 页面本体，渲染服务商卡片、筛选、导入按钮 |
| `freebuddy-bridge.js` | 与 FreeBuddy 通信的 postMessage 客户端（协议 v1） |
| `providers.json` | 静态服务商目录（历史基础目录，按 `id` 与运行时目录合并，静态条目优先） |
| `providers.schema.json` | 静态目录的 JSON Schema，编辑器会据此校验 |
| `submissions/providers/` | **D1 运行时服务商声明**：一个文件一个服务商，PR 合并后由 workflow 同步进 D1。规范见 [submissions/providers/README.md](./submissions/providers/README.md) |
| `submissions/examples/` | 可直接复制的声明示例（不会被同步） |
| `scripts/sync-providers.mjs` | 校验全部声明并生成确定性 upsert SQL（原生 Node，无依赖），只输出不直接连库 |
| `scripts/check-d1-preflight.mjs` | workflow 写入前的只读 preflight：用当前凭据运行 `wrangler d1 list --json`，确认 `freebie-db`（UUID `b95f…`）可见，否则以清晰错误中止；不输出 Token / 账号 ID |
| `worker.js` | Cloudflare Worker：评测/投票 API、`GET /api/providers` 运行时目录、静态资源回退 |
| `schema.sql` | D1 表结构（`reviews`、`votes`、`providers`），全新数据库使用 |
| `migrations/` | D1 迁移脚本，已有数据库升级用（`0001` 补约束、`0002` 扩展 `disabled` 状态，均保留数据且中断后可安全重跑） |
| `.github/workflows/sync-providers.yml` | `main` 上的声明变更 → 生成 SQL → D1 preflight（凭据能看到 `freebie-db` 才继续）→ `wrangler d1 execute --remote --command`（写入库前先执行一次 `schema.sql`，首次同步自动建表） |
| `tests/` | `node --test` 测试（Node ≥ 22.13.0），不参与静态资源发布 |
| `_headers` | Cloudflare Pages 响应头（CORS 及安全策略） |
| `.assetsignore` | 发布排除清单（语法同 `.gitignore`）：`node_modules/`、`.wrangler/`、`.codebuddy/`、`tests/`、`migrations/`、`submissions/`、`scripts/`、`.github/` 等本地文件不会上传为公开资源；页面 HTML/JS/JSON/CSS 与 `worker.js`、`_headers`、`wrangler.toml` 照常发布 |
| `wrangler.toml` | Cloudflare 项目配置：D1 binding，以及固定项目账号的顶层 `account_id`（不是密钥；workflow 因此不再需要 `CLOUDFLARE_ACCOUNT_ID` Secret） |

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

## 运行时服务商（D1）

投稿与审核入口仍然是 GitHub PR，页面不提供在线投稿表单。审核通过的服务商由 PR 里的声明文件
`submissions/providers/<id>.json` 同步进 D1 的 `providers` 表，`GET /api/providers` 再把它交给页面：

- `GET /api/providers` **只返回 `status = 'approved'` 的记录**，映射为静态目录同款 camelCase 字段；接口只读，没有公网写入口（写路径只有「合并 PR → 同步脚本 → D1」一条）。
- `status` 取值与含义：

  | status | 含义 | 是否被 `GET /api/providers` 返回 |
  | --- | --- | --- |
  | `pending` | 已声明、待审核 | 否 |
  | `approved` | 审核通过 | **是** |
  | `disabled` | 显式下线（记录保留，可恢复） | 否 |
  | `rejected` | 审核不通过 | 否 |

- 该接口输出的是「已审核 + 应用层校验后」的数据，**不承诺**与 `providers.schema.json` 完全一致：Worker 会逐条校验 ID、name、region、protocol、models 非空与 URL 安全（仅接受 `https:`），不安全的 `homepage` / `consoleUrl` / `icon` 会被清空，无法使用的记录会被丢弃；`schema.sql` 中的 CHECK 只是数据库兜底，不能替代 JSON Schema。
- 首页先渲染 `providers.json`，再异步加载 `api/providers`（3 秒超时后放弃），按 `id` 合并、静态目录优先；接口失败、超时或数据格式异常时都保留静态目录，页面照常可用。

### 数据库初始化与迁移顺序

表结构在 `schema.sql`，按数据库当前状态选择对应命令。**注意 `status = 'disabled'` 需要 `0002` 迁移**，只跑过旧 schema 的库必须先升级，否则同步脚本写下线状态时会直接撞 CHECK 约束：

**全新数据库**（`CREATE TABLE IF NOT EXISTS`，不会重建已有表；已包含 `pending / approved / disabled / rejected` 全部状态）：

```bash
npx wrangler d1 execute freebie-db --remote --command="$(< schema.sql)"
# 或直接用迁移（等价，且会写入 d1_migrations 记录，推荐）
npx wrangler d1 migrations apply freebie-db --remote
```

> 两种方式**选一种就好，不要混用**：如果先用 `schema.sql` 建库、之后又执行 `migrations apply`，wrangler 会按记录重放 `0001`（它会把 `disabled` 记录搬进隔离表并把状态集合降级），随后 `0002` 再升级回来。数据不会丢（隔离表保留原文），但需要重新触发一次同步才能把 `disabled` 记录放回 `providers`。

> **为什么用 `--command="$(< 文件)"` 而不是文件模式（`--file`）**：文件模式会把 SQL 上传到 D1 的 `/import` 接口，本库上该接口返回 Cloudflare **7003**；`--command` 走 `/query` 接口，执行的是同一份 SQL。**等号不能改成空格**：`schema.sql`、迁移文件和生成的同步 SQL 都以 `--` 注释开头，wrangler 的 CLI 解析器会把「以 `-` 开头的值」当成下一个选项，`--command "$(< 文件)"` 会直接报 `Unknown argument`（wrangler 4.5.0 / 4.133.0 实测）。这是命令传输方式问题，与账号配置无关：**不要修改 `wrangler.toml` 里的 `account_id`、数据库名或 D1 UUID，也不要重建数据库**（见「同步失败后怎么处理」）。账号 ID 已固定在 `wrangler.toml` 的顶层 `account_id`，不再从 GitHub Secret / Variable 读取。自动同步的 workflow 出于同样原因也已改用 `--command=`（见「同步服务商声明到 D1」）。

> **Windows PowerShell**：不要用 `npx`（它的 `.cmd` 通道会把多行参数截断到第一个换行），请先 `npm install -g wrangler@4`；Windows PowerShell 5.1 还会吞掉参数里的 `"`，必须先把 `"` 转义成 `\"`（否则参数会在第一个 `"` 处被拆坏）。下面两行把 `schema.sql` 换成迁移 / 同步 SQL 的路径即可套用：

```powershell
$sql = (Get-Content -Raw -Encoding UTF8 schema.sql).Replace('"', '\"')
wrangler d1 execute freebie-db --remote --command=$sql
```

> PowerShell 7+ 的原生参数转义规则与 5.1 不同（未验证），建议改用 Git Bash 执行上面的 `bash` 命令：Git Bash 下 `--command="$(< 文件)"` 原样可用。

**已有数据库（升级，全程保留数据）**：旧表结构宽松，重跑 `schema.sql` 不会补上 CHECK 约束，请执行迁移，**不要 `DROP TABLE providers` 重建**（会丢已有记录）。自动同步的 workflow 只执行 `schema.sql`（`IF NOT EXISTS`，不会补约束），不会替你跑迁移：

```bash
# 推荐：由 wrangler 记录到 d1_migrations，失败的迁移会回滚，0001 / 0002 按顺序执行
npx wrangler d1 migrations apply freebie-db --remote

# 或者按需直接执行单个迁移文件
npx wrangler d1 execute freebie-db --remote --command="$(< migrations/0001_providers_constraints.sql)"
npx wrangler d1 execute freebie-db --remote --command="$(< migrations/0002_providers_status_disabled.sql)"
```

| 迁移 | 作用 | 适用 |
| --- | --- | --- |
| `0001_providers_constraints.sql` | 给旧的宽松 `providers` 表补上 CHECK 约束 | 跑过旧 `schema.sql`、表里还没有约束的库 |
| `0002_providers_status_disabled.sql` | 把 `status` 取值集合扩展为 `pending / approved / disabled / rejected` | 跑过 `0001`、需要支持「显式下线」的库 |

两个迁移都是一条流程：新建带约束的表 → 原样复制合规记录（所有状态全部保留）→ 把不满足新约束的旧记录写入 `providers_quarantine` 并记录 `failed_checks` 原因 → 断言「合规记录一条不少 + 隔离条数对得上」→ 全部通过后才替换旧表并重建 `idx_providers_status`。任何断言失败都会直接报错中止，旧表保持原样，不会静默丢数据。

### 迁移中断后重跑

D1 的 SQL 接口**不支持显式事务**：对 D1 执行 `BEGIN TRANSACTION` / `SAVEPOINT` 会直接报错（`To execute a transaction, please use the state.storage.transaction() API instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements.`），只能改用 `batch` / Durable Objects 提供的事务能力。所以这个脚本**没法**用 `BEGIN`/`COMMIT` 把「复制 → 隔离写入 → 断言 → 换表」包成一次原子操作，改为保证「在任意两条语句之间被打断后重跑都安全」：

| 中断位置 | 重跑后果 |
| --- | --- |
| 复制合规记录之后、写隔离表之前 | `providers_new` 和体检表都是从当前 `providers` 派生的副本，重跑会先 `DROP` 再重建，无影响 |
| 写隔离表之后、断言/换表之前 | 隔离表以 `legacy_rowid` 为主键、用 `INSERT OR REPLACE` 写入：同一个旧行永远只有一行审计记录，重跑只是把它刷新成新一轮的 `run_id`，**不会撞主键失败，也不会产生重复行** |
| `DROP TABLE providers` 与 `ALTER TABLE ... RENAME` 之间 | 唯一需要人工介入的情况：新数据在 `providers_new` 里。此时脚本会在前置检查处主动中止，按对应迁移文件（`0001` / `0002`）顶部「前置检查」注释执行 `ALTER TABLE providers_new RENAME TO providers;` 恢复后重跑即可 |
| 已成功之后 | 等价于用同样的约束再重建一遍，结果不变（隔离表不会新增记录） |

检查隔离出来的记录（`run_id` 标记最近一次写入它的迁移轮次；确认后修正字段重新投稿，或用 `--json` 导出留档）：

```bash
npx wrangler d1 execute freebie-db --remote --command "SELECT legacy_rowid, run_id, id, name, status, failed_checks FROM providers_quarantine ORDER BY legacy_rowid"
npx wrangler d1 execute freebie-db --remote --json --command "SELECT * FROM providers_quarantine"
```

## 同步服务商声明到 D1（PR 合并 → D1）

```text
submissions/providers/<id>.json  --合并 PR-->  main
      |
      |  GitHub Actions: .github/workflows/sync-providers.yml
      v
scripts/sync-providers.mjs  --(先全量校验，再输出 SQL)-->  .wrangler/sync-providers.sql
      |
      v
preflight: npx wrangler d1 list --json | node scripts/check-d1-preflight.mjs
      |    (凭据看不到 freebie-db / UUID b95f… 就报错中止，不碰数据库)
      v
npx wrangler d1 execute freebie-db --remote --command="$(< .wrangler/sync-providers.sql)"
      |
      v
D1 `providers`
```

- **触发条件**：只有 push 到 `main`、且改动落在 `submissions/providers/**`、`submissions/providers.schema.json`、`scripts/sync-providers.mjs`、`scripts/check-d1-preflight.mjs`、`schema.sql`、`migrations/**`、`wrangler.toml` 或 workflow 自身时才会运行。
- **权限与并发**：`permissions: contents: read`；`concurrency: sync-providers-d1`（不取消进行中的运行，避免两次写入交错）。
- **写入前 preflight（非敏感）**：workflow 在任何写操作之前用当前凭据执行 `wrangler d1 list --json`，由 `scripts/check-d1-preflight.mjs` 断言列表里存在 `freebie-db` 且 UUID 为 `b95f4660-…`，否则以清晰错误退出，`schema.sql` / upsert 都不会执行。它同时验证 `wrangler.toml` 的 `account_id` 与 Token 属于同一账号——账号 ID 填错曾表现为 D1 接口 7003；日志只输出库名/UUID，不输出 Token，也不输出账号 ID。
- **首次同步自动建表**：写 upsert 之前会先用同一条 `--command=` 通道执行一次 `schema.sql`。它只有 `CREATE ... IF NOT EXISTS` 语句，所以对已有库是无副作用的空操作，对空的 `freebie-db`（`list` 显示 `num_tables=0`）则补出 `providers` / `reviews` / `votes` 三张表，让第一次同步直接成功。workflow **不会**自动执行 `migrations/0001` / `0002`：那两个脚本会重建已存在的 `providers` 表、只适用于已部署的旧库，旧库仍需按「数据库初始化与迁移顺序」人工迁移。
- **不走文件上传（`/import`）**：`wrangler d1 execute` 的文件模式会把 SQL 上传到 D1 的 `/import` 接口，本库上该接口返回 Cloudflare 7003；现在由 bash 读取文件内容，经 `--command` 传给 `/query` 接口。引用写作 `--command="$(< 文件)"`：**等号不能改成空格**（值以 `--` 注释开头，wrangler 会把「以 `-` 开头的值」当成下一个选项而报 `Unknown argument`）；命令替换的结果在双引号内既不会被分词/通配符展开，也不会二次展开 `$`、反引号，多语句 SQL 完整作为**一个参数**传给 wrangler。Windows PowerShell 的写法见「数据库初始化与迁移顺序」。
- **合并即生效**：PR 合并后同步脚本对每个声明执行一次 `INSERT ... ON CONFLICT(id) DO UPDATE`。同一份声明重复同步结果不变（幂等），改回 `approved` 就能恢复上线。
- **同步语义**：写 `pending` / `approved` / `disabled` / `rejected` 全部状态；`created_at` 与已有的 `submitted_by` 在更新时保留，`updated_at` 刷新为本次同步时间。
- **删除声明文件不会下线服务商**：脚本只写「当前还存在声明文件」的 `id`，无法区分「文件被删」和「本次只改了一个文件」。请用显式 `"status": "disabled"` 下线。

### 管理员：配置 GitHub Secrets

workflow **只需要一个仓库级密钥**，配置位置：**仓库 → Settings → Secrets and variables → Actions → Secrets**：

| 名称 | 必需 | 说明 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 是 | Cloudflare API Token，权限至少包含目标账号的 **D1 Edit**（建议按账号/资源最小授权） |

账号 ID 不在这里配置：它固定在 `wrangler.toml` 的顶层 `account_id`（不是密钥，Cloudflare 也把它当作可公开的标识符），workflow 和所有 `wrangler` 命令都只用这一个确定值，所以 `wrangler d1 list` / `d1 execute` 不会再因为 Secret 里的账号 ID 填错而报 7003。**如果你以前配置过 `CLOUDFLARE_ACCOUNT_ID`（Secret 或 Variable），现在可以删除**——没有任何流程会再读它。

> 密钥只会通过 `env` 传给 wrangler，不写入仓库、不出现在命令行参数里；workflow 文件里也没有任何真实凭据。**未配置 Token 时 workflow 会在第一步就失败并给出提示**，不会带着空凭据去连 D1。

### 同步失败后怎么处理

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Generate upsert SQL from declarations` 步骤失败，日志里是 `error: submissions/providers/xxx.json` 加具体字段原因 | 声明文件不合规（URL 不是 https、`disabled` 缺 `offlineReason`/`offlineAt`、`id` 与文件名不一致等） | 按提示修文件再提交一次 PR。脚本**在生成任何 SQL 之前就退出**，所以 D1 完全没有被改动，不存在部分写入 |
| 第一步 `Check Cloudflare credentials` 失败 | Token Secret 没配或名称拼错 | 按上一节配置 `CLOUDFLARE_API_TOKEN` 后重新运行（现在只需要这一个 Secret，账号 ID 已写在 `wrangler.toml`） |
| `Preflight D1 connectivity` 失败 | 当前 Token 看不到目标库：Token 失效/无 D1 权限、不属于 `wrangler.toml` 里 `account_id` 的账号，或 D1 暂时不可用 | 核对 Token 是否为 `account_id` 对应账号且带 D1 权限；**不要**去 GitHub 里找 `CLOUDFLARE_ACCOUNT_ID`（已弃用），账号 ID 只在 `wrangler.toml` 里。修正后重新运行即可——preflight 是只读的，失败时 D1 没有被改动 |
| `Apply schema and upserts to D1` 失败（wrangler 报错 / 网络中断） | 认证、账号权限、D1 暂时不可用等 | 脚本的每条语句都是幂等 upsert，`schema.sql` 也可重复执行，**直接在 Actions 里 re-run 失败的 job 即可**；也可以本地执行 `node scripts/sync-providers.mjs --out .wrangler/sync-providers.sql`，再手动 `npx wrangler d1 execute freebie-db --remote --command="$(< .wrangler/sync-providers.sql)"`（Windows PowerShell 见「数据库初始化与迁移顺序」） |
| 旧版本日志里 `wrangler d1 execute --file` 报 Cloudflare **7003**（`/import` 上传失败） | 旧 workflow 用文件模式，走的是 D1 的 `/import` 接口，该接口对当前 `freebie-db` 不可用；与数据库名、D1 UUID 无关 | **更新到当前 workflow 后重新运行**（re-run 失败的 job，或推送一个命中 `paths` 的提交），**不要**修改 `wrangler.toml` 里的 `account_id` / 数据库名 / D1 UUID，也不要重建数据库。当前 workflow 改用 `--command=` 走 `/query`，并在写 upsert 前先执行 `schema.sql`（空库第一次同步自动建表）与 D1 preflight（确认凭据能看到 `freebie-db`） |
| 旧版本日志里 `/accounts/***/d1/database/..../query` 报 7003，换 Token 后仍然如此 | 请求打到了 Token 无权访问的账号：旧 workflow 从 `CLOUDFLARE_ACCOUNT_ID` Secret/Variable 取账号 ID，填错就会这样 | 确认已更新到当前 workflow（不再读取账号 ID），若还配置着 `CLOUDFLARE_ACCOUNT_ID` 就删除它，然后 re-run。账号 ID 现在只来自 `wrangler.toml` 的 `account_id` |
| workflow 没有触发 | 改动不在 `paths` 列表里（例如只改了 `submissions/providers/README.md` 或 examples） | 正常现象，文档/示例不影响数据；确有需要可在 Actions 里 re-run 上一次成功的运行 |

本地自检（不需要任何密钥，只输出 SQL，不连库）：

```bash
node scripts/sync-providers.mjs                        # SQL 到 stdout
node scripts/sync-providers.mjs --out .wrangler/sync-providers.sql
```

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

## 测试

- 运行测试需要 **Node.js ≥ 22.13.0**（`tests/` 用内置 `node:sqlite` 搭 D1 fixture；该模块在 Node 22.13.0 才移出 `--experimental-sqlite` 标志，更早的版本不受支持）。本项目在 Node 24 LTS 上验证通过，`package.json` 的 `engines.node` 即该下限。
- `tests/assets-ignore.test.js` 用 git 的 ignore 引擎校验 `.assetsignore` 模式（需要 `git` 在 PATH 上；机器上没有 git 时该用例会跳过）。
- `tests/sync-providers.test.js` 会真实 spawn `scripts/sync-providers.mjs`，把生成的 SQL 应用到内存 SQLite，再通过 `GET /api/providers` 读回来，覆盖「approved 上线 / disabled 下线 / 无效声明整体拒绝 / SQL 注入转义 / 迁移 0002 保数据」等路径。
- `tests/sync-workflow.test.js` 静态检查 `.github/workflows/sync-providers.yml`：不允许再出现文件模式（`--file`，会走 `/import` 上传），必须保留 `--command="$(< schema.sql)"` → `--command="$(< "$SYNC_SQL_FILE")"` 的等号引用形式（空格形式会把 `--` 开头的文件内容当成新选项）、空 SQL 跳过、只检查 `CLOUDFLARE_API_TOKEN` 一个 Secret 且不引用任何账号 ID 变量、preflight 排在 `schema.sql` / upsert 之前，且不得自动执行迁移；`wrangler.toml` 必须以顶层 `account_id` 固定项目账号，并保留 `freebie-db` 的 UUID。
- `tests/d1-preflight.test.js` 真实 spawn `scripts/check-d1-preflight.mjs`：`freebie-db`（UUID `b95f…`）可见时通过，库缺失 / 改名 / 空列表 / 非法 JSON 时以清晰错误退出，失败信息里不会出现 Token；并断言脚本里的库名与 UUID 和 `wrangler.toml` 的 `database_name` / `database_id` 一致。
- `tests/docs-d1-commands.test.js` 检查本 README、`migrations/*.sql`，并真实运行 `scripts/sync-providers.mjs` 检查生成输出（工作区里已存在的 `.wrangler/sync-providers.sql` 一并做陈旧检查）：代码块、迁移说明与生成 SQL 头部都不允许再出现 `--file` 示例，文件类 D1 命令必须是 `--command="$(< 文件)"`，并保留 Windows PowerShell 的 `Get-Content -Raw -Encoding UTF8` + 引号转义写法；README 只能要求 `CLOUDFLARE_API_TOKEN` 一个 Secret，且说明 `CLOUDFLARE_ACCOUNT_ID` 已可删除。

```bash
npm test   # node --test，运行 tests/ 下全部测试
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
