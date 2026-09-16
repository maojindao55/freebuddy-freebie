-- 0002_providers_status_disabled.sql
-- 把已存在 D1 `providers` 表里 `status` 的取值集合从 (pending, approved, rejected)
-- 扩展为 (pending, approved, disabled, rejected)，保留数据、重建索引，不动其它表。
--
-- 背景：0001 给旧表装上了 (pending, approved, rejected) 的 CHECK。现在「下线」由
-- submissions/providers/<id>.json 里显式 `status: "disabled"` 表达，再由
-- .github/workflows/sync-providers.yml 经 scripts/sync-providers.mjs 同步进 D1 —— 旧 CHECK
-- 会直接拒绝这条 upsert（CHECK constraint failed），所以必须重建表结构。schema.sql 已同步
-- 更新，但它只对全新数据库生效；已经建过库（无论有没有跑过 0001）的 D1 执行本迁移。
--
-- 本迁移与 0001 的结构完全一致，只改了 status 的取值集合：
--
--   1. 先体检：把旧记录逐条判定（providers_migration_stage），并记录不合规的字段；
--   2. 新建带约束的 `providers_new`（结构与 schema.sql 的 providers 一致）；
--   3. 原样复制合规记录（pending / approved / disabled / rejected 全部保留，字段值不变）；
--   4. 不合规记录写入 `providers_quarantine`（保留原文 + failed_checks 原因），绝不静默删除；
--   5. 断言「合规记录一条不少地进入新表」且「被隔离记录数 = 本轮实际写入隔离表的行数」，
--      任一不满足就报错中止，此时旧表尚未被替换；
--   6. 替换旧表并重建 `idx_providers_status` 索引。
--
-- 执行方式（任选其一）：
--   npx wrangler d1 migrations apply freebie-db --remote
--     -- 推荐：由 wrangler 记录到 d1_migrations，失败的迁移会回滚，0001 / 0002 按顺序执行。
--   npx wrangler d1 execute freebie-db --remote --file=migrations/0002_providers_status_disabled.sql
--
-- 为什么没有 BEGIN/COMMIT：D1 的 SQL 接口不接受显式事务语句 —— 对 D1 执行
--   BEGIN TRANSACTION / SAVEPOINT
-- 会直接报错（"To execute a transaction, please use the state.storage.transaction() API
-- instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements."）。本迁移必须能在 D1 上执行，
-- 所以无法把「复制 → 隔离写入 → 断言 → 换表」用事务包成一次原子操作。
--
-- 替代方案：脚本按「任意两条语句之间都可能被中断」设计，靠幂等和自愈而不是事务来保证安全，
-- 每条语句之后中断、直接重跑都不会失败、丢数据或留下重复记录：
--   * 中断在「复制合规记录」与「写隔离表」之间（中断窗口 W1）：providers_new / 体检表都是从
--     当前 providers 派生的副本，重跑时整体 DROP 后重建，不受影响；
--   * 中断在「写隔离表」之后（中断窗口 W2）：隔离表以 legacy_rowid 为主键、用 INSERT OR REPLACE
--     写入，同一个旧行永远只有一行记录 —— 重跑只是把这一行刷新成新一轮（run_id）的结果，
--     不会撞主键报错，也不会产生第二份/不可解释的重复审计行；
--   * 中断在「DROP TABLE providers」与「RENAME」之间（中断窗口 W3）：唯一需要人工介入的情况，
--     此时新数据在 providers_new 里，见下面「前置检查」注释里的恢复语句；
--   * 已成功后再跑一次等价于用同样的约束再重建一遍，结果不变（隔离表不会新增记录）。
--
-- 检查隔离出来的记录（确认后修正字段、重新投稿，或用 --json 导出留档）：
--   npx wrangler d1 execute freebie-db --remote --command "SELECT legacy_rowid, run_id, id, name, status, failed_checks FROM providers_quarantine ORDER BY legacy_rowid"
--   npx wrangler d1 execute freebie-db --remote --json --command "SELECT * FROM providers_quarantine"

-- ---------------------------------------------------------------------------
-- 前置检查
-- ---------------------------------------------------------------------------
-- 允许继续的两种情况：旧 `providers` 表存在，或数据库全新（两张表都不存在）。
-- 只有一种情况会中止：`providers_new` 存在而 `providers` 不存在 —— 说明上一轮执行到
-- 「DROP TABLE providers」与「RENAME」之间被中断（中断窗口 W3）。此时数据在 providers_new 里，
-- 请勿重建，先执行下面的恢复语句再重跑本迁移：
--   ALTER TABLE providers_new RENAME TO providers;
CREATE TABLE IF NOT EXISTS providers_migration_precondition (ok INTEGER NOT NULL CHECK (ok = 1));
DELETE FROM providers_migration_precondition;
INSERT INTO providers_migration_precondition (ok)
SELECT CASE WHEN (
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'providers') = 1
  OR (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'providers_new') = 0
) THEN 1 ELSE 0 END;
DROP TABLE providers_migration_precondition;

-- 旧表结构与历史版本一致；已存在则不动，全新数据库则先建空表（随后被替换掉）。
-- 注意：如果 `providers` 表缺少下面任何一列（结构被手改过），后面的 SELECT 会直接报
-- "no such column" 而中止——这是有意为之：宁可显式失败，也不猜测或丢数据。
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT,
  icon TEXT,
  region TEXT,
  homepage TEXT,
  console_url TEXT,
  free_tier_summary TEXT,
  protocol TEXT,
  protocols TEXT,
  base_url TEXT,
  env_key TEXT,
  models TEXT,
  context_window INTEGER,
  verified_at TEXT,
  status TEXT,
  submitted_by TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

-- ---------------------------------------------------------------------------
-- 隔离表：保留无法满足新约束的旧记录原文 + 失败原因，供人工检查/导出
-- 主键 = legacy_rowid（旧表 rowid），所以同一个旧行只会有一行记录；重跑时用
-- INSERT OR REPLACE 刷新这一行，run_id 记录最近一次写入它的迁移轮次。
-- 0001 建立、0002 复用同一张表，迁移审计只有一份。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS providers_quarantine (
  legacy_rowid INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL,
  id TEXT,
  name TEXT,
  icon TEXT,
  region TEXT,
  homepage TEXT,
  console_url TEXT,
  free_tier_summary TEXT,
  protocol TEXT,
  protocols TEXT,
  base_url TEXT,
  env_key TEXT,
  models TEXT,
  context_window INTEGER,
  verified_at TEXT,
  status TEXT,
  submitted_by TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  failed_checks TEXT NOT NULL,
  quarantined_at INTEGER NOT NULL
);

-- 本轮运行编号：run_id = 历史最大值 + 1，每轮（含被中断后的重试）在隔离写入前自增。
-- 它用来区分「本轮写入/刷新的行」与「更早轮次留下的行」：下面的断言 2 只统计本轮 run_id 的行。
DROP TABLE IF EXISTS providers_migration_run;
CREATE TABLE providers_migration_run (run_id INTEGER NOT NULL);
INSERT INTO providers_migration_run (run_id)
SELECT IFNULL((SELECT MAX(run_id) FROM providers_quarantine), 0) + 1;

-- ---------------------------------------------------------------------------
-- 体检表：逐条判定旧记录是否满足新约束，并列出不合规字段
-- ---------------------------------------------------------------------------
-- 说明：SQLite 不保证 AND 短路，`json_type()` / `json_array_length()` 遇到非法 JSON 会直接
-- 报 "malformed JSON"。因此 JSON 相关的判定一律写成 `CASE WHEN json_valid(x) THEN ...`，
-- 保证只在 JSON 合法时才调用后面的函数。
DROP TABLE IF EXISTS providers_migration_stage;
CREATE TABLE providers_migration_stage (
  legacy_rowid INTEGER PRIMARY KEY,
  id, name, icon, region, homepage, console_url, free_tier_summary, protocol, protocols,
  base_url, env_key, models, context_window, verified_at, status, submitted_by,
  created_at, updated_at,
  is_valid INTEGER NOT NULL,
  failed_checks TEXT NOT NULL
);

INSERT INTO providers_migration_stage (
  legacy_rowid, id, name, icon, region, homepage, console_url, free_tier_summary, protocol,
  protocols, base_url, env_key, models, context_window, verified_at, status, submitted_by,
  created_at, updated_at, is_valid, failed_checks
)
SELECT
  rowid, id, name, icon, region, homepage, console_url, free_tier_summary, protocol,
  protocols, base_url, env_key, models, context_window, verified_at, status, submitted_by,
  created_at, updated_at,
  (
       id IS NOT NULL AND id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9_-]*' AND length(id) <= 64
   AND name IS NOT NULL AND length(trim(name)) > 0 AND length(name) <= 80
   AND (icon IS NULL OR icon GLOB 'https://*' OR (icon NOT GLOB '*[^A-Za-z0-9._/-]*' AND icon NOT GLOB '//*'))
   AND (region IS NULL OR region IN ('cn', 'global'))
   AND (homepage IS NULL OR homepage GLOB 'https://*')
   AND (console_url IS NULL OR console_url GLOB 'https://*')
   AND (free_tier_summary IS NULL OR CASE WHEN json_valid(free_tier_summary) THEN json_type(free_tier_summary) = 'object' ELSE 0 END)
   AND protocol IS NOT NULL AND protocol IN ('openai-chat', 'openai-responses', 'anthropic', 'deepseek')
   AND (protocols IS NULL OR CASE WHEN json_valid(protocols) THEN json_type(protocols) = 'array' ELSE 0 END)
   AND base_url IS NOT NULL AND base_url GLOB 'https://*'
   AND models IS NOT NULL AND CASE WHEN json_valid(models) THEN json_type(models) = 'array' AND json_array_length(models) >= 1 ELSE 0 END
   AND (context_window IS NULL OR context_window > 0)
   AND (verified_at IS NULL OR verified_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
   AND status IS NOT NULL AND status IN ('pending', 'approved', 'disabled', 'rejected')
   AND created_at IS NOT NULL
   AND updated_at IS NOT NULL
  ) IS 1,
  trim(
    CASE WHEN (id IS NOT NULL AND id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9_-]*' AND length(id) <= 64) IS NOT 1 THEN 'id ' ELSE '' END ||
    CASE WHEN (name IS NOT NULL AND length(trim(name)) > 0 AND length(name) <= 80) IS NOT 1 THEN 'name ' ELSE '' END ||
    CASE WHEN (icon IS NULL OR icon GLOB 'https://*' OR (icon NOT GLOB '*[^A-Za-z0-9._/-]*' AND icon NOT GLOB '//*')) IS NOT 1 THEN 'icon ' ELSE '' END ||
    CASE WHEN (region IS NULL OR region IN ('cn', 'global')) IS NOT 1 THEN 'region ' ELSE '' END ||
    CASE WHEN (homepage IS NULL OR homepage GLOB 'https://*') IS NOT 1 THEN 'homepage ' ELSE '' END ||
    CASE WHEN (console_url IS NULL OR console_url GLOB 'https://*') IS NOT 1 THEN 'console_url ' ELSE '' END ||
    CASE WHEN (free_tier_summary IS NULL OR CASE WHEN json_valid(free_tier_summary) THEN json_type(free_tier_summary) = 'object' ELSE 0 END) IS NOT 1 THEN 'free_tier_summary ' ELSE '' END ||
    CASE WHEN (protocol IS NOT NULL AND protocol IN ('openai-chat', 'openai-responses', 'anthropic', 'deepseek')) IS NOT 1 THEN 'protocol ' ELSE '' END ||
    CASE WHEN (protocols IS NULL OR CASE WHEN json_valid(protocols) THEN json_type(protocols) = 'array' ELSE 0 END) IS NOT 1 THEN 'protocols ' ELSE '' END ||
    CASE WHEN (base_url IS NOT NULL AND base_url GLOB 'https://*') IS NOT 1 THEN 'base_url ' ELSE '' END ||
    CASE WHEN (models IS NOT NULL AND CASE WHEN json_valid(models) THEN json_type(models) = 'array' AND json_array_length(models) >= 1 ELSE 0 END) IS NOT 1 THEN 'models ' ELSE '' END ||
    CASE WHEN (context_window IS NULL OR context_window > 0) IS NOT 1 THEN 'context_window ' ELSE '' END ||
    CASE WHEN (verified_at IS NULL OR verified_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]') IS NOT 1 THEN 'verified_at ' ELSE '' END ||
    CASE WHEN (status IS NOT NULL AND status IN ('pending', 'approved', 'disabled', 'rejected')) IS NOT 1 THEN 'status ' ELSE '' END ||
    CASE WHEN (created_at IS NOT NULL) IS NOT 1 THEN 'created_at ' ELSE '' END ||
    CASE WHEN (updated_at IS NOT NULL) IS NOT 1 THEN 'updated_at ' ELSE '' END
  )
FROM providers;

-- ---------------------------------------------------------------------------
-- 新表（结构必须与 schema.sql 中的 providers 保持一致）
-- 与 0001 的唯一区别：status 接受 'disabled'。
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS providers_new;
CREATE TABLE providers_new (
  id TEXT PRIMARY KEY CHECK (id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9_-]*' AND length(id) <= 64),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 80),
  icon TEXT CHECK (icon IS NULL OR icon GLOB 'https://*' OR (icon NOT GLOB '*[^A-Za-z0-9._/-]*' AND icon NOT GLOB '//*')),
  region TEXT CHECK (region IS NULL OR region IN ('cn', 'global')),
  homepage TEXT CHECK (homepage IS NULL OR homepage GLOB 'https://*'),
  console_url TEXT CHECK (console_url IS NULL OR console_url GLOB 'https://*'),
  free_tier_summary TEXT CHECK (free_tier_summary IS NULL OR (json_valid(free_tier_summary) AND json_type(free_tier_summary) = 'object')),
  protocol TEXT NOT NULL CHECK (protocol IN ('openai-chat', 'openai-responses', 'anthropic', 'deepseek')),
  protocols TEXT CHECK (protocols IS NULL OR (json_valid(protocols) AND json_type(protocols) = 'array')),
  base_url TEXT NOT NULL CHECK (base_url GLOB 'https://*'),
  env_key TEXT,
  models TEXT NOT NULL CHECK (json_valid(models) AND json_type(models) = 'array' AND json_array_length(models) >= 1),
  context_window INTEGER CHECK (context_window IS NULL OR context_window > 0),
  verified_at TEXT CHECK (verified_at IS NULL OR verified_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'disabled', 'rejected')),
  submitted_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 复制合规记录（pending / approved / disabled / rejected 全部保留，字段值不变）
INSERT INTO providers_new (
  id, name, icon, region, homepage, console_url, free_tier_summary, protocol, protocols,
  base_url, env_key, models, context_window, verified_at, status, submitted_by, created_at, updated_at
)
SELECT
  id, name, icon, region, homepage, console_url, free_tier_summary, protocol, protocols,
  base_url, env_key, models, context_window, verified_at, status, submitted_by, created_at, updated_at
FROM providers_migration_stage
WHERE is_valid = 1;

-- [中断窗口 W1] 到此为止：合规记录已复制进 providers_new，隔离表还没写。providers_new 和体检表
-- 都是从当前 providers 派生的副本，重跑时会先 DROP 再重建，因此在这个窗口被打断后直接重跑即可。

-- 隔离不合规记录（原文保留 + 失败字段），供人工检查、修正后重新投稿或导出留档。
-- INSERT OR REPLACE + legacy_rowid 主键：同一个旧行在隔离表里永远只有一行。重复执行（被中断后
-- 的重跑、或上一轮已成功后再跑）只会把这一行刷新成本轮的 run_id / failed_checks / 原文，
-- 而不会因主键冲突失败，也不会留下两份互相矛盾的记录。
INSERT OR REPLACE INTO providers_quarantine (
  legacy_rowid, run_id, id, name, icon, region, homepage, console_url, free_tier_summary,
  protocol, protocols, base_url, env_key, models, context_window, verified_at, status,
  submitted_by, created_at, updated_at, failed_checks, quarantined_at
)
SELECT
  legacy_rowid,
  (SELECT run_id FROM providers_migration_run),
  id, name, icon, region, homepage, console_url, free_tier_summary,
  protocol, protocols, base_url, env_key, models, context_window, verified_at, status,
  submitted_by, created_at, updated_at,
  failed_checks,
  CAST(strftime('%s', 'now') AS INTEGER)
FROM providers_migration_stage
WHERE is_valid = 0;

-- [中断窗口 W2] 到此为止：本轮要隔离的旧行都已写入（run_id = MAX(run_id) + 1），断言和换表还没跑。
-- 重跑会重新体检并再次 INSERT OR REPLACE 覆盖同一批 legacy_rowid，不会撞主键、不会重复。

-- ---------------------------------------------------------------------------
-- 校验：任一断言失败都会以 CHECK constraint failed 中止（旧表尚未替换，数据无损）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS providers_migration_guard (ok INTEGER NOT NULL CHECK (ok = 1));
DELETE FROM providers_migration_guard;

-- 断言 1：体检为合规的旧记录必须全部出现在新表中（按主键逐一比对）
INSERT INTO providers_migration_guard (ok)
SELECT CASE WHEN NOT EXISTS (
  SELECT 1
  FROM providers_migration_stage s
  WHERE s.is_valid = 1
    AND NOT EXISTS (SELECT 1 FROM providers_new n WHERE n.id = s.id)
) THEN 1 ELSE 0 END;

-- 断言 2：体检为不合规的记录数 = 本轮实际写入隔离表的行数
--（上面的 INSERT OR REPLACE 会把本轮所有不合规行刷成当前 run_id，所以这个等式就是
--  「本轮一条不漏地写进隔离表」的检查；更早轮次写入的行带的是旧 run_id，不参与比较）
INSERT INTO providers_migration_guard (ok)
SELECT CASE WHEN
  (SELECT COUNT(*) FROM providers_migration_stage WHERE is_valid = 0)
  = (SELECT COUNT(*) FROM providers_quarantine WHERE run_id = (SELECT run_id FROM providers_migration_run))
THEN 1 ELSE 0 END;

DROP TABLE providers_migration_guard;

-- ---------------------------------------------------------------------------
-- 替换旧表并重建索引
-- [中断窗口 W3] DROP 与 RENAME 之间被打断：providers_new 是唯一的新数据副本，见文件顶部
-- 「前置检查」——此时不要重跑本脚本（会在前置检查处中止），先执行恢复语句再重跑。
-- ---------------------------------------------------------------------------
DROP TABLE providers;
ALTER TABLE providers_new RENAME TO providers;
CREATE INDEX IF NOT EXISTS idx_providers_status ON providers(status, updated_at DESC);
DROP TABLE providers_migration_stage;
DROP TABLE providers_migration_run;
